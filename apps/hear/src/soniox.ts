// Soniox 实时会话（设计书 §5）。按官方 WebSocket API 文档：
//
//   wss://stt-rt.soniox.com/transcribe-websocket
//   连上先发一条 JSON 配置 → 之后音频走二进制帧 → 响应是 JSON {tokens, ...}
//   不发音频时每 20 秒内要发 {"type":"keepalive"}，否则连接会被关
//   结束：发一个空帧，服务端回 {finished:true} 后关连接
//   出错：服务端回 {error_code, error_type, error_message} 然后立刻关连接
//   单次会话上限 300 分钟
//
// 从 meeting-notes 搬来，差别：开端点检测（句子一停就定稿，延迟优先）、不做说话人区分。
import type { SonioxResponse } from './captions.ts'
import { t } from './i18n.ts'

export const SONIOX_WS = 'wss://stt-rt.soniox.com/transcribe-websocket'

export type SessionConfig = {
  apiKey: string
  target: string
  /** language_hints；空数组则不发，全靠自动识别 */
  hints: string[]
  /** 已组好的 context 对象（settings.ts 的 buildContext）；空对象则不发 */
  context: Record<string, unknown>
}

export type SessionStatus = 'idle' | 'connecting' | 'live' | 'reconnecting' | 'error'

export type SessionEvents = {
  onResponse: (r: SonioxResponse, segment: number) => void
  onStatus: (s: SessionStatus, detail: string) => void
}

/** 断线期间最多积压 60 秒音频（§4.2），再多只进录音不进转写 */
const BACKLOG_BYTES = 32000 * 60
const KEEPALIVE_MS = 10_000
/** 单会话上限 300 分钟，提前一点主动换段 */
const SEGMENT_MAX_MS = 290 * 60_000

/** 按 error_type 决定怎么处理（官方 Errors 参考） */
function classify(errorType: string | undefined, code: number | undefined): { retry: boolean; text: string } {
  switch (errorType) {
    case 'unauthenticated': return { retry: false, text: t('sx.badKey') }
    case 'permission_denied': return { retry: false, text: t('sx.noPermission') }
    case 'organization_balance_exhausted':
    case 'organization_monthly_budget_exhausted':
    case 'project_monthly_budget_exhausted': return { retry: false, text: t('sx.budget') }
    case 'invalid_request': return { retry: false, text: t('sx.invalid') }
    case 'max_duration_reached': return { retry: true, text: t('sx.maxDuration') }
    case 'temp_api_key_session_expired': return { retry: false, text: t('sx.tempKey') }
    case 'limit_exceeded': return { retry: true, text: t('sx.limit') }
    default: return { retry: true, text: t('sx.other', { e: errorType ?? code ?? t('sx.network') }) }
  }
}

export class SonioxSession {
  status: SessionStatus = 'idle'
  segment = 0

  private cfg: SessionConfig
  private ev: SessionEvents
  private ws: WebSocket | null = null
  private wantOpen = false
  private backlog: Uint8Array[] = []
  private backlogBytes = 0
  private lastSentAt = 0
  private keepalive: ReturnType<typeof setInterval> | null = null
  private segmentTimer: ReturnType<typeof setTimeout> | null = null
  private retryDelay = 1000
  private retryTimer: ReturnType<typeof setTimeout> | null = null

  /**
   * @param startSegment 段号起点。暂停/继续会新建会话对象，段号必须接着上一个对象数下去，
   * 否则两个会话里的 speaker "1" 会被组装器当成同一个人
   */
  constructor(cfg: SessionConfig, ev: SessionEvents, startSegment = 0) {
    this.cfg = cfg
    this.ev = ev
    this.segment = startSegment
  }

  /** 开始（或断线后重开）一个会话 */
  start(): void {
    this.wantOpen = true
    this.openSocket()
  }

  private setStatus(s: SessionStatus, detail = '') {
    this.status = s
    console.log(`[soniox] ${s}${detail ? ' · ' + detail : ''} (segment ${this.segment})`)
    this.ev.onStatus(s, detail)
  }

  private openSocket(): void {
    if (!this.wantOpen || this.ws) return
    this.setStatus(this.segment === 0 ? 'connecting' : 'reconnecting')
    let ws: WebSocket
    try { ws = new WebSocket(SONIOX_WS) } catch (e) {
      this.scheduleRetry(t('sx.connectFail', { e: (e as Error).message }))
      return
    }
    ws.binaryType = 'arraybuffer'
    this.ws = ws
    const seg = ++this.segment

    ws.onopen = () => {
      ws.send(JSON.stringify(this.configJson()))
      this.retryDelay = 1000
      this.setStatus('live')
      // 断线期间攒下的先补发
      for (const b of this.backlog) ws.send(b)
      this.backlog = []
      this.backlogBytes = 0
      this.lastSentAt = Date.now()
      this.keepalive = setInterval(() => {
        if (ws.readyState === WebSocket.OPEN && Date.now() - this.lastSentAt > KEEPALIVE_MS) {
          ws.send(JSON.stringify({ type: 'keepalive' }))
          this.lastSentAt = Date.now()
        }
      }, KEEPALIVE_MS / 2)
      this.segmentTimer = setTimeout(() => { console.log('[soniox] 接近 300 分钟，换段'); this.rotate() }, SEGMENT_MAX_MS)
    }

    ws.onmessage = (m) => {
      if (typeof m.data !== 'string') return
      let r: SonioxResponse
      try { r = JSON.parse(m.data) } catch { return }
      if (r.error_code !== undefined || r.error_type) {
        const c = classify(r.error_type, r.error_code)
        console.warn('[soniox] error:', r.error_type, r.error_message)
        if (c.retry) this.scheduleRetry(c.text)
        else { this.wantOpen = false; this.setStatus('error', c.text) }
        return
      }
      if (r.tokens?.length) this.ev.onResponse(r, seg)
      if (r.finished) console.log('[soniox] finished, segment', seg)
    }

    ws.onerror = () => { /* 紧跟着的 onclose 处理 */ }
    ws.onclose = (e) => {
      this.cleanupSocket()
      if (!this.wantOpen) { this.setStatus('idle'); return }
      this.scheduleRetry(t('sx.closed', { c: e.code }))
    }
  }

  private configJson() {
    const context = this.cfg.context
    return {
      api_key: this.cfg.apiKey,
      model: 'stt-rt-v5',
      audio_format: 'pcm_s16le',
      sample_rate: 16000,
      num_channels: 1,
      // 只提示 ja 时，中文会被硬听成日语（真 Key 实测）。会议里会出现的语言都提示上，靠语言识别切换
      ...(this.cfg.hints.length ? { language_hints: this.cfg.hints } : {}),
      // 按人换行要靠它。和端点检测一起开会降低区分准确率（官方说明），这里换行错一两次无妨
      enable_speaker_diarization: true,
      enable_language_identification: true,
      // 听障场景延迟优先：端点检测让每句话一停就定稿，不等下一句把它顶出来
      enable_endpoint_detection: true,
      ...(this.cfg.target ? { translation: { type: 'one_way', target_language: this.cfg.target } } : {}),
      ...(Object.keys(context).length ? { context } : {}),
    }
  }

  private cleanupSocket() {
    if (this.keepalive) { clearInterval(this.keepalive); this.keepalive = null }
    if (this.segmentTimer) { clearTimeout(this.segmentTimer); this.segmentTimer = null }
    if (this.ws) { this.ws.onclose = null; this.ws.onmessage = null; this.ws = null }
  }

  private scheduleRetry(reason: string) {
    this.cleanupSocket()
    if (!this.wantOpen) return
    this.setStatus('reconnecting', reason)
    if (this.retryTimer) return
    this.retryTimer = setTimeout(() => {
      this.retryTimer = null
      this.openSocket()
    }, this.retryDelay)
    this.retryDelay = Math.min(this.retryDelay * 2, 15_000)
  }

  /** 主动换段（300 分钟上限、切麦克风）：优雅结束当前会话，再开新的 */
  rotate(): void {
    const ws = this.ws
    this.cleanupSocket()
    if (ws && ws.readyState === WebSocket.OPEN) {
      try { ws.send(''); ws.close() } catch { /* */ }
    }
    this.openSocket()
  }

  /** 音频帧。没连上时积压（上限 60 秒） */
  sendAudio(pcm: Uint8Array): void {
    if (!this.wantOpen) return
    const ws = this.ws
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(pcm)
      this.lastSentAt = Date.now()
      return
    }
    this.backlog.push(pcm)
    this.backlogBytes += pcm.byteLength
    while (this.backlogBytes > BACKLOG_BYTES && this.backlog.length) {
      this.backlogBytes -= this.backlog.shift()!.byteLength
    }
  }

  /**
   * 手动定稿：把挂着的 non-final token 全部定稿（官方 "manual finalization"）。
   * 不开端点检测时，一句话说完停顿，最后一段会一直挂着不定稿，译文也跟着不出，
   * 要等下一句的声音把它顶出来（实测）。调用方在检测到停顿后发一次。
   * 文档提醒：定稿前要有足够的音频上下文，否则说话人区分变差 —— 所以只在整句说完的停顿后发。
   */
  finalize(): void {
    const ws = this.ws
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type: 'finalize' }))
      this.lastSentAt = Date.now()
      console.log('[soniox] finalize (停顿)')
    }
  }

  /**
   * 结束：发空帧让服务端定稿并关连接。暂停时也走这条（按连接时长计费，§5.5）。
   * **要等服务端回 `finished` 再 resolve**：空帧之后服务端还会把挂着的 token 全部定稿发回来，
   * 原先这里发完空帧就把 onmessage 摘掉，最后一两句就这么丢了（用户实测：停止时丢尾巴）。
   * 兜底 4 秒。
   */
  stop(): Promise<void> {
    this.wantOpen = false
    if (this.retryTimer) { clearTimeout(this.retryTimer); this.retryTimer = null }
    const ws = this.ws
    if (this.keepalive) { clearInterval(this.keepalive); this.keepalive = null }
    if (this.segmentTimer) { clearTimeout(this.segmentTimer); this.segmentTimer = null }
    this.ws = null
    this.backlog = []
    this.backlogBytes = 0
    this.setStatus('idle')
    if (!ws) return Promise.resolve()
    if (ws.readyState !== WebSocket.OPEN) { try { ws.close() } catch { /* */ } return Promise.resolve() }
    return new Promise<void>((resolve) => {
      let done = false
      const finish = () => {
        if (done) return
        done = true
        clearTimeout(timer)
        ws.onmessage = null
        ws.onclose = null
        try { ws.close() } catch { /* */ }
        resolve()
      }
      const timer = setTimeout(() => { console.warn('[soniox] stop: 4 秒没等到 finished'); finish() }, 4000)
      const onMessage = ws.onmessage   // 原来的处理器：继续把定稿 token 交给组装器
      ws.onmessage = (m) => {
        onMessage?.call(ws, m)
        if (typeof m.data === 'string' && m.data.includes('"finished"')) {
          try { if ((JSON.parse(m.data) as SonioxResponse).finished) finish() } catch { /* */ }
        }
      }
      ws.onclose = finish
      try { ws.send('') } catch { finish() }   // 结束标志是**空文本帧**（官方示例 ws.send("")），空二进制帧服务端不认，实测等不到 finished
    })
  }
}

