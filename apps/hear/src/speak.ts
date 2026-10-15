// 朗读译文：Soniox 实时语音合成（tts-rt-v2），从手机出声 —— 连着耳机就是耳机。
//
// 不做「只用耳机播放」：网页拿不到声音从哪儿出（Even SDK 也没有这类接口），只能按设备名猜，
// 在 iPhone 的 WebView 里多半猜不出来。所以只在设置的说明里请用户戴耳机（用户定的）。
//
//   wss://tts-rt.soniox.com/tts-websocket
//   Key 跟识别一样放在协议列表里。一条连接上可以开多个 stream，这里一个分句开一个：
//     → {stream_id, model, language, voice, audio_format, sample_rate, speed}   开一个 stream
//     → {stream_id, text, text_end: true}                                      这一段译文
//     ← {stream_id, audio: base64, audio_end}                           一块块声音
//     ← {stream_id, terminated: true}                                   这个 stream 完了
//   没有 stream 在跑时约 40 秒没消息就会被关：每 20 秒发一次 {keep_alive: true}
//
// 什么时候读：**按分句**。定稿的译文一出现分句的标点（，。？！），这一段就单独开一个 stream 送去合成；
// 一句话定稿（<end>：端点检测；<fin>：停顿后我们发的定稿指令）时，剩下的尾巴也送出去。
// 译文常常在对方还没说完整句时就定稿了前半句，所以前半句可以先念。实测（tools/sts-latency.mjs --mode clause，电脑、合成的日语）：
//   整句送      对方说完 → 第一个音  1.0–1.1 秒
//   按分句送    对方说完 → 第一个音  -1.3 ～ +1.1 秒（多数句子在说完之前就开始念了）
// 只往一个 stream 里边出边送（text_end 留到句末）没用：合成那边等 text_end 才出声，并不更早。
// 语速：接口给 1.3（允许的最快），播放时再 ×1.15，合起来约 1.5 倍，念一句的时长约是原来的三分之二。
//
// 不读什么：对方说的本来就是目标语言 —— 那种话 Soniox 不出译文（只有原话），这里只读译文，所以自然不读。
// 另外按 source_language 再挡一道。
//
// 息屏：iOS 一息屏就把网页的声音停掉（AudioContext 变成 suspended / interrupted），识别和合成却还在跑。
// 真机实测（0.2.4）：息屏没声，再亮屏就把这期间攒下的声音一下子全放出来（「胡言乱语」），然后又没声。所以：
//   - 声音停着的时候来的声音块直接扔掉，不往后排；
//   - 声音一停（状态不是 running），排着的段落、正在放的声音全清掉，恢复后从最新的一句接着念。
// 能不能息屏后照样出声，看 main.ts 的 onSpeak：声音不直接接扬声器，而是接到一个一直在放的 <audio> 上（真机待验）。
//
// 跟不上怎么办：对方连着说就会越积越多。合成和播放是两条线：前一段合成完就合成下一段（不等它放完），
// 声音按顺序排在后面放；但**排着没放的声音超过 MAX_BEHIND 秒**，等着的段落就只留最新的一段，其余丢掉（字幕上都有）。
// 宁可漏读，不能越读越落后。
import type { SonioxResponse } from './captions.ts'

const TTS_WS = 'wss://tts-rt.soniox.com/tts-websocket'
const RATE = 24000
const KEEPALIVE_MS = 20_000
/** 合成的语速（接口允许 0.7–1.3） */
const SPEED = 1.3
/**
 * 播放时再加速这么多倍。接口最快 1.3，用户实测仍嫌慢；播放加速会让声音变尖一点（不保持音高），
 * 1.15 倍以内听着还自然
 */
const PLAY_RATE = 1.15
/** 排着没放的声音超过这么多秒，就开始丢旧的段落 */
const MAX_BEHIND = 4
/** 译文这样结尾就算一个分句，可以先送去念。太短的（「是的，」）不单独送，接着攒 */
const CLAUSE_END = /[，。？！、；,.?!;]$/
const CLAUSE_MIN = 4
const keyInProtocols = (key: string): boolean => /^[A-Za-z0-9!#$%&'*+.^_`|~-]+$/.test(key)

export type SpeakerEvents = {
  /** 出错（Key 不对、余额不足、连不上……），给用户看一句 */
  onError: (text: string) => void
}

export class Speaker {
  private ws: WebSocket | null = null
  private opening: Promise<WebSocket> | null = null
  private keepalive: ReturnType<typeof setInterval> | null = null
  /**
   * 放声音用的，由调用方在用户点击「朗读」时建好再交进来（iOS 只让用户操作里建起来的出声）。
   * 不指定采样率：声音块各自带 24 kHz，浏览器自己重采样
   */
  private ctx: AudioContext
  /** 声音接到哪儿：main 给的（一个 <audio> 背后的 MediaStream，或者直接是扬声器） */
  private out: AudioNode
  /** 已经排上、还没放完的声音：声音被系统停掉时要全部撤掉 */
  private sources = new Set<AudioBufferSourceNode>()
  private onState = () => {
    if (this.ctx.state === 'running') return
    console.warn('[tts] 声音被停了：' + this.ctx.state + '，排着的全部丢掉')
    this.reset()
  }
  /** 这一段到目前为止定稿的译文（还没到分句标点） */
  private buf = ''
  /** 等着合成的段落，先进先出 */
  private queue: string[] = []
  /** 正在合成的 stream（同一时间只合成一段，保证念的顺序） */
  private streamId = ''
  private seq = 0
  private nextAt = 0
  private stopped = false
  /** 诊断：念了几段、因为跟不上丢了几段、最近一段从定稿到出声多少毫秒 */
  readonly stats = { spoken: 0, dropped: 0, lastMs: 0 }
  private heardAt = 0
  private gotAudio = false

  private apiKey: string
  private lang: string
  private voice: string
  private ev: SpeakerEvents

  constructor(apiKey: string, lang: string, voice: string, ctx: AudioContext, out: AudioNode, ev: SpeakerEvents) {
    this.ctx = ctx
    this.out = out
    ctx.addEventListener('statechange', this.onState)
    this.apiKey = apiKey
    this.lang = lang
    this.voice = voice
    this.ev = ev
  }

  /** 识别结果进来：攒定稿的译文，一句话结束就送去念 */
  feed(res: SonioxResponse): void {
    if (this.stopped) return
    for (const t of res.tokens) {
      if (!t.is_final) continue
      if (t.text === '<end>' || t.text === '<fin>') { this.flush(); continue }
      if (t.translation_status !== 'translation') continue
      if (t.source_language && t.source_language === this.lang) continue
      this.buf += t.text
      const s = this.buf.trim()
      if (CLAUSE_END.test(s) && s.length >= CLAUSE_MIN) this.flush()
    }
  }

  /** 攒着的这一段送去排队 */
  private flush(): void {
    const text = this.buf.trim()
    this.buf = ''
    if (!text) return
    this.heardAt = performance.now()
    this.queue.push(text)
    this.pump()
  }

  /** 排着没放的声音有多少秒 */
  private behind(): number { return Math.max(0, this.nextAt - this.ctx.currentTime) }

  /** 没在合成的话，合成下一段。落后太多时只留最新的一段 */
  private pump(): void {
    if (this.stopped || this.streamId || !this.queue.length) return
    if (this.behind() > MAX_BEHIND && this.queue.length > 1) {
      this.stats.dropped += this.queue.length - 1
      this.queue = this.queue.slice(-1)
    }
    void this.say(this.queue.shift()!)
  }


  private connect(): Promise<WebSocket> {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) return Promise.resolve(this.ws)
    if (this.opening) return this.opening
    this.opening = new Promise<WebSocket>((resolve, reject) => {
      let ws: WebSocket
      try { ws = keyInProtocols(this.apiKey) ? new WebSocket(TTS_WS, ['soniox-api-key', this.apiKey]) : new WebSocket(TTS_WS) } catch (e) { reject(e); return }
      const timer = setTimeout(() => { try { ws.close() } catch { /* */ } reject(new Error('timeout')) }, 8000)
      ws.onopen = () => {
        clearTimeout(timer)
        this.ws = ws
        this.keepalive = setInterval(() => {
          if (ws.readyState === WebSocket.OPEN && !this.streamId) ws.send(JSON.stringify({ keep_alive: true }))
        }, KEEPALIVE_MS)
        resolve(ws)
      }
      ws.onerror = () => { /* 紧跟着的 onclose 处理 */ }
      ws.onclose = (e) => {
        console.warn('[tts] 连接关了', e.code, e.reason)
        clearTimeout(timer)
        if (this.keepalive) { clearInterval(this.keepalive); this.keepalive = null }
        if (this.ws === ws) this.ws = null
        this.streamId = ''
        reject(new Error('closed'))
      }
      ws.onmessage = (m) => this.onMessage(m)
    }).finally(() => { this.opening = null })
    return this.opening
  }

  private onMessage(m: MessageEvent): void {
    if (typeof m.data !== 'string') return
    let r: { stream_id?: string; audio?: string; terminated?: boolean; error_code?: number; error_type?: string; error_message?: string }
    try { r = JSON.parse(m.data) } catch { return }
    if (r.stream_id !== this.streamId) { if (r.error_code !== undefined) console.warn('[tts] 别的 stream 报错:', r.stream_id, r.error_type, r.error_message); return }
    if (r.error_code !== undefined) {
      console.warn('[tts] error:', r.error_type, r.error_message)
      this.ev.onError(r.error_type === 'unauthenticated' ? 'key' : r.error_type?.includes('balance') || r.error_type?.includes('budget') ? 'budget' : r.error_type ?? String(r.error_code))
      this.done()
      return
    }
    if (r.audio) { if (!this.gotAudio) { this.gotAudio = true; console.log(`[tts] ${r.stream_id} 第一个音 ${Math.round(performance.now() - this.heardAt)}ms · 声音 ${this.ctx.state}`) } this.play(r.audio) }
    if (r.terminated) { console.log(`[tts] ${r.stream_id} 合成完`); this.done() }
  }

  private play(b64: string): void {
    const ctx = this.ctx
    // 声音停着（息屏）：这一块放不出来，排到后面的话亮屏时会和后来的一起涌出来 —— 扔掉
    if (ctx.state !== 'running') { this.stats.dropped++; return }
    const bin = atob(b64)
    const n = bin.length >> 1
    if (!n) return
    const buf = ctx.createBuffer(1, n, RATE)
    const ch = buf.getChannelData(0)
    for (let i = 0; i < n; i++) {
      const v = bin.charCodeAt(2 * i) | (bin.charCodeAt(2 * i + 1) << 8)
      ch[i] = (v > 32767 ? v - 65536 : v) / 32768
    }
    const src = ctx.createBufferSource()
    src.buffer = buf
    src.playbackRate.value = PLAY_RATE
    src.connect(this.out)
    this.sources.add(src)
    src.onended = () => this.sources.delete(src)
    const at = Math.max(ctx.currentTime + 0.02, this.nextAt)
    if (this.nextAt < ctx.currentTime + 0.02) this.stats.lastMs = Math.round(performance.now() - this.heardAt)   // 这句的第一块
    src.start(at)
    this.nextAt = at + buf.duration / PLAY_RATE
  }

  /** 这一段合成完了：不等它放完，接着合成下一段（声音按顺序排在后面） */
  private done(): void {
    this.streamId = ''
    this.pump()
  }

  private async say(text: string): Promise<void> {
    const id = 's' + ++this.seq
    this.streamId = id
    try {
      const ws = await this.connect()
      if (this.stopped || this.streamId !== id) return
      ws.send(JSON.stringify({ stream_id: id, model: 'tts-rt-v2', language: this.lang, voice: this.voice, audio_format: 'pcm_s16le', sample_rate: RATE, speed: SPEED }))
      ws.send(JSON.stringify({ stream_id: id, text, text_end: true }))
      this.gotAudio = false
      console.log(`[tts] ${id} 送去合成「${text}」 排着 ${this.behind().toFixed(1)}s`)
      this.stats.spoken++
    } catch (e) {
      console.warn('[tts] connect failed:', (e as Error).message)
      if (this.streamId === id) this.streamId = ''
      this.queue = []
      this.ev.onError('connect')
    }
  }

  /** 丢掉一切排着的：等着合成的段落、正在合成的那段、已经排进声音里还没放的 */
  private reset(): void {
    if (this.streamId && this.ws?.readyState === WebSocket.OPEN) this.ws.send(JSON.stringify({ stream_id: this.streamId, cancel: true }))
    this.streamId = ''
    this.buf = ''
    if (this.queue.length) this.stats.dropped += this.queue.length
    this.queue = []
    for (const s of this.sources) { try { s.stop() } catch { /* */ } }
    this.sources.clear()
    this.nextAt = 0
  }

  /** 先把连接建好：第一句话不用再等建连接（实测第一句因此慢 0.5 秒左右） */
  warm(): void { void this.connect().catch(() => {}) }

  /** 关掉：等着的丢掉，连接关掉。已经排进声音里的那一小段会放完（声音是调用方的，不关它） */
  stop(): void {
    this.stopped = true
    this.ctx.removeEventListener('statechange', this.onState)
    this.buf = this.streamId = ''
    this.queue = []
    if (this.keepalive) { clearInterval(this.keepalive); this.keepalive = null }
    try { this.ws?.close() } catch { /* */ }
    this.ws = null
  }
}

