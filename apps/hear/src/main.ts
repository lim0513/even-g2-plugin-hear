// Hear：把周围的话变成眼镜上的字幕（听障辅助）。
//
// 和 meeting-notes 的差别就是"少"：打开即听、没有会议、不录音、不存、不导出。
//   长按   暂停 / 继续（暂停时关麦、断 Soniox —— 按连接时长计费）
//   单击   不做任何事（误触太容易）；翻译开关在手机设置里
//   双击   退出
// 安静 N 分钟自动断开 Soniox，一有声音立刻重连（省钱，设置里可调）。
import {
  waitForEvenAppBridge,
  TextContainerProperty,
  CreateStartUpPageContainer,
  RebuildPageContainer,
  TextContainerUpgrade,
  AudioInputSource,
  OsEventTypeList,
  MenuContainerProperty,
  MenuItemProperty,
  type EvenAppBridge,
} from '@evenrealities/even_hub_sdk'
import { C, BOX, BLOCKS, ROWS, DIM, MID, BRIGHT, lastLines, wrap, type Block, type ContentBlock, type Screen } from './layout.ts'
import { Captions } from './captions.ts'
import { rms, toPcm } from './core/wav.ts'
import { loadSettings, saveSettings, type Settings } from './settings.ts'
import { parseHints } from './languages.ts'
import { mountUi, setStatus, setNote, setDiag, diagShown, setCaptions, setAi } from './ui.ts'
import { ask, type AiRun } from './ai.ts'
import { SonioxSession, stats as sonioxStats } from './soniox.ts'
import { SCRIPT, runFake } from './demo-feed.ts'
import { t, setLang, getLang, resolveLang } from './i18n.ts'

// ── 模块顶层状态：全部在 mount 之前声明（根 CLAUDE.md：TDZ 坑）──
type Mode = 'live' | 'paused' | 'quiet'
let mode: Mode = 'live'
let session: SonioxSession | null = null
let segmentBase = 0
let notice = ''
let micOpen = false
/** 这次开麦的时刻；从什么时候起音频一直欠账太多（0＝现在不欠）；正在重开麦克风 */
let micOpenedAt = 0
let micLagSince = 0
let micRestarting = false
/** 网络慢到正在丢音频（soniox.ts 的 onNet）。顶栏接一句提示，免得以为是没人说话 */
let netSlow = false
let lastVoiceAt = Date.now()
/** 上次发定稿指令之后又有人说过话（端点检测关着时用，见下面的定时器） */
let spokeSinceFinalize = false
/** 眼镜上的字幕文本最近一次变化的时刻（自动清屏从这儿算起） */
let lastTextAt = Date.now()
/**
 * AI 解答的一次问答（眼镜单击触发）。有它在，眼镜上显示的是回答而不是字幕（字幕照常在后台攒着）。
 * phase：thinking＝请求发出去了还没回字；writing＝在出字；done／error＝结束，再过 AI_HOLD_MS 自动收起
 */
type AiState = { phase: 'thinking' | 'writing' | 'done' | 'error'; text: string; info: string; run: AiRun | null; page: number }
let ai: AiState | null = null
let aiTimer: ReturnType<typeof setTimeout> | null = null
/** 本次打开后按过开始没有（没有＝顶栏显示「长按开始」） */
let started = false
const captions = new Captions()

const bridge = await waitForEvenAppBridge()
let settings: Settings = await loadSettings(bridge)
setLang(resolveLang(settings.lang))
if (import.meta.env.DEV) {
  const q = new URLSearchParams(location.search)
  if (q.get('lang')) setLang(resolveLang(q.get('lang')!))
  if (q.get('demo')) settings.apiKey = ''
  if (q.get('tr')) settings.translate = q.get('tr') === '1'   // 出截图用
  if (q.get('src')) settings.showSource = q.get('src') === '1'
  if (q.get('ep')) settings.endpoint = q.get('ep') === '1'   // 端点检测开关
  if (q.get('clear')) settings.clearSec = Number(q.get('clear')) || 0   // 自动清屏秒数（测试时调短）
  if (q.get('slow')) netSlow = true   // 看顶栏「网络慢」提示的样子
  if (q.get('tiers')) settings.tiers = q.get('tiers') === '1'   // 眼镜上「最新两行更亮」开／关，对比用
  if (import.meta.env.VITE_SONIOX_KEY && !settings.apiKey && !q.get('demo')) settings.apiKey = String(import.meta.env.VITE_SONIOX_KEY)
  // .env.local 里 VITE_CLAUDE_KEY=...：模拟器里点不到手机页，没法手填。只在开发期生效，打包时整段摇掉
  if (import.meta.env.VITE_CLAUDE_KEY && !settings.claudeKey) settings.claudeKey = String(import.meta.env.VITE_CLAUDE_KEY)
  console.log(`[i18n] navigator=${navigator.language} search=${location.search} → ${getLang()}`)
}
captions.target = settings.translate ? settings.target : ''
captions.hideTargetSpeech = !settings.showTargetSpeech
// 开发期 ?demo=1：假字幕、顶栏按「正在听」显示（出商店截图）。生产里恒为 false，整段摇掉
const demo = import.meta.env.DEV && new URLSearchParams(location.search).has('demo')

const blank = (s: string) => (s === '' ? ' ' : s)   // 空串 protobuf 不发，真机上旧字会留着

function container(block: Block, content: string, color: number, capture = 0) {
  const b = BOX[block]
  return new TextContainerProperty({
    xPosition: b.x, yPosition: b.y, width: b.w, height: b.h,
    borderWidth: 0, borderColor: 0, paddingLength: 0,
    containerID: C[block].id, containerName: C[block].name,
    content: blank(content), textColor: color, isEventCapture: capture,
  })
}

const translating = () => settings.translate && !!settings.target
/** 眼镜上显示的目标语言名：中/日/英用语言名（字形验过），其余用大写代码（别的文字字库未验） */
const SAFE_NAMES: Record<string, string> = { zh: '中文', ja: '日本語', en: 'English' }
const targetLabel = () => SAFE_NAMES[settings.target] ?? settings.target.toUpperCase()


/** 手机状态行里的目标语言名：中/日/英按界面语言说，其余用大写代码 */
function phoneTargetName(): string {
  const key = 'lname.' + settings.target
  const name = t(key)
  return name === key ? settings.target.toUpperCase() : name
}

/** 回答写完后在眼镜上留多久 */
const AI_HOLD_MS = 25_000
/**
 * 回答一屏的行数：top 3 + mid 4。最下面的 now 两行留给「怎么关、怎么翻页」（空一行 + 一行提示，最暗）。
 * 一行约 27 个汉字或 55 个半角字符（layout.ts 的 COLS）
 */
const AI_ROWS = ROWS.top + ROWS.mid
/** 字幕区一共几行 */
const ALL_ROWS = ROWS.top + ROWS.mid + ROWS.now
/** 占位的空行。不能用空串或半角空格行：整块内容为空时 protobuf 不发，旧字会留在真机上（见 blank） */
const PAD = '　'
/** 把 lines 靠下放进 rows 行：不够的在上面垫空行。一行都没有就返回空（整块清掉） */
const anchor = (lines: string[], rows: number): string[] =>
  lines.length ? [...Array<string>(Math.max(0, rows - lines.length)).fill(PAD), ...lines] : []
const join = (lines: string[]) => lines.join('\n')

/** 回答折行后分成几屏、现在看第几屏 */
function aiPages(a: AiState): { lines: string[]; pages: number; page: number } {
  const lines = wrap(a.text || (a.phase === 'thinking' ? '...' : ''))
  const pages = Math.max(1, Math.ceil(lines.length / AI_ROWS))
  return { lines, pages, page: Math.min(a.page, pages - 1) }
}

function holdAi(a: AiState) {
  if (aiTimer) clearTimeout(aiTimer)
  aiTimer = setTimeout(() => { if (ai === a) closeAi() }, AI_HOLD_MS)
}

/**
 * 回答超过一屏时上下滑翻屏。**首尾相接**：换方向后的第一下滑动不产生事件（根 CLAUDE.md），
 * 所以一直朝一个方向滑要能到任何一屏。翻了屏就重新开始计「留多久」
 */
function pageAi(dir: 1 | -1) {
  if (!ai) return
  const { pages, page } = aiPages(ai)
  if (pages < 2) return
  ai.page = (page + dir + pages) % pages
  if (ai.phase === 'done' || ai.phase === 'error') holdAi(ai)
  void render()
}

function closeAi() {
  if (aiTimer) { clearTimeout(aiTimer); aiTimer = null }
  ai?.run?.abort()
  ai = null
  setAi(null)
  void render()
}

/** 单击：没在问就问一次；正在问或回答还挂着就收起（正在问的会被取消） */
function toggleAi() {
  if (ai) { closeAi(); return }
  // 顶栏闪一句提示，3 秒后撤掉（期间没被别的提示顶替才撤）
  const flash = (msg: string) => {
    notice = msg
    void render()
    setTimeout(() => { if (notice === msg) { notice = ''; void render() } }, 3000)
  }
  // 没填 Key：眼镜上不出任何东西（单击很容易误触，不用 AI 的人不该被打扰），只在手机页上说一声 ——
  // 不说的话，Key 没保存上和「单击没触发」分不出来
  if (!settings.claudeKey) { setNote(t('note.ai.noKey'), 'warn'); return }
  const transcript = captions.recent()
  if (!transcript.trim()) { flash(t('g.ai.nothing')); return }
  // 回答用的语言：开着翻译就用翻译的目标语言（那是戴眼镜的人读的语言），否则用界面语言
  const lang = translating() ? settings.target : getLang()
  const mine: AiState = { phase: 'thinking', text: '', info: '', run: null, page: 0 }
  ai = mine
  console.log(`[ai] 发送 ${transcript.length} 字 → ${settings.claudeModel}（${lang}）`)
  mine.run = ask({
    apiKey: settings.claudeKey, model: settings.claudeModel, lang, transcript,
    onText: (full) => {
      if (ai !== mine) return
      mine.phase = 'writing'
      mine.text = full
      setAi(full, t('g.ai.writing'))
      void render()
    },
  })
  setAi('', t('g.ai.thinking'))
  void render()
  void mine.run.done.then((r) => {
    if (ai !== mine || r.aborted) return
    const sec = (ms: number | null) => (ms === null ? '-' : (ms / 1000).toFixed(1))
    console.log(`[ai] ${r.model} 首字 ${sec(r.firstMs)}s 写完 ${sec(r.totalMs)}s ${r.error ? '出错 ' + r.error.kind + ' ' + r.error.detail : r.text.length + ' 字'}`)
    if (r.error) {
      mine.phase = 'error'
      mine.text = t('ai.err.' + r.error.kind, { e: r.error.detail.slice(0, 80) })
      mine.info = ''
      setNote(mine.text, 'warn')
    } else {
      mine.phase = 'done'
      mine.text = r.text
      mine.info = `${sec(r.firstMs)}/${sec(r.totalMs)}s`
      setNote(t('ai.note.timing', { m: r.model, f: sec(r.firstMs), t: sec(r.totalMs) }))
    }
    // 写完：回答插进手机记录的当时位置，单独的回答框收起。
    // 眼镜上那份字幕不带它 —— 眼镜上回答是盖在字幕上显示的，关掉就回到字幕
    if (!r.error && r.text.trim()) {
      captions.note(r.text.trim())
      setAi(null)
    } else setAi(mine.text, mine.info)
    void render()
    holdAi(mine)
  })
}

function screen(): Screen {
  if (ai) {
    // 回答盖住字幕：顶栏说状态（写完后带「首字／写完」的秒数），九行全给回答，从头显示
    const state = ai.phase === 'thinking' ? t('g.ai.thinking') : ai.phase === 'writing' ? t('g.ai.writing')
      : ai.phase === 'error' ? t('g.ai.fail') : `${t('g.ai.done')} ${ai.info}`
    const pg = aiPages(ai)
    const lines = pg.lines.slice(pg.page * AI_ROWS, (pg.page + 1) * AI_ROWS)
    // 不止一屏时顶栏带页码，下滑看下一屏（到最后一屏再滑回到第一屏）
    const head = pg.pages > 1 ? `${state}  ${pg.page + 1}/${pg.pages}` : state
    return {
      header: `> ${head}`, tr: '',
      top: join(lines.slice(0, ROWS.top)),
      mid: join(lines.slice(ROWS.top)),
      // 最下面一行：怎么关、怎么翻页。上面空一行，和回答隔开
      now: join([PAD, t(pg.pages > 1 ? 'g.ai.closeNext' : 'g.ai.close')]),
      dim: { header: MID, tr: DIM, top: BRIGHT, mid: BRIGHT, now: DIM },
    }
  }
  let head: string
  if (!settings.apiKey && !demo) head = t('g.noKey')
  else if (mode === 'paused') head = t(started ? 'g.paused' : 'g.start')
  else if (mode === 'quiet') head = t('g.quiet')
  else if (!demo && (!session || session.status === 'connecting')) head = t('g.connecting')
  else head = t('g.live')
  if (notice) head += `   ${notice}`
  else if (netSlow && mode === 'live') head += `   ${t('g.netSlow')}`
  const tr = translating() ? t('g.translate.on', { l: targetLabel() }) : ''
  const hdim = mode === 'live' && !notice && !netSlow ? DIM : MID
  // 亮度：
  //   tiers 开（默认）：最新的两行（now）最亮，前面的（mid、单流时还有 top）暗一档；字靠下放，新字从最下面顶上来
  //   tiers 关：和 0.1.x 一样，字从上往下填、全部最亮
  //   暂停：留在屏幕上的字全部降到最暗 —— 一眼看得出是停住的，又还能回头读
  const paused = mode === 'paused'
  const tiers = settings.tiers
  const older = paused ? DIM : tiers ? MID : BRIGHT
  const newest = paused ? DIM : BRIGHT
  if (translating() && settings.showSource) {
    // 原话 3 行在上（备查用，最暗一档；tiers 关时是原来的中等亮度），译文 6 行在下
    const dst = lastLines(captions.screenDst(), ROWS.mid + ROWS.now)
    const rows = tiers ? anchor(dst, ROWS.mid + ROWS.now) : dst
    return {
      header: head, tr,
      top: join(lastLines(captions.screenSrc(), ROWS.top)),
      mid: join(rows.slice(0, ROWS.mid)),
      now: join(rows.slice(ROWS.mid)),
      dim: { header: hdim, tr: DIM, top: paused || tiers ? DIM : MID, mid: older, now: newest },
    }
  }
  // 只出一种文字（不翻译＝原文；翻译但不显示原文＝译文）：9 行，top + mid + now 连着放，看起来是一整块。
  // 说目标语言的话本来就进译文流（captions.ts），所以藏掉原文不会漏掉它们
  const lines = lastLines(translating() ? captions.screenDst() : captions.screenSrc(), ALL_ROWS)
  // tiers 关时不足 9 行从上往下填（top 先满），否则 top 空着、中间出现一截空白（截图踩过）
  const rows = tiers ? anchor(lines, ALL_ROWS) : lines
  return {
    header: head, tr,
    top: join(rows.slice(0, ROWS.top)),
    mid: join(rows.slice(ROWS.top, ROWS.top + ROWS.mid)),
    now: join(rows.slice(ROWS.top + ROWS.mid)),
    dim: { header: hdim, tr: DIM, top: older, mid: older, now: newest },
  }
}

// ── 诊断读数（手机页点版本号才显示）──
// 用来分清「用久了延迟变高」卡在哪一段：眼镜→手机的音频、手机→Soniox 的网络、Soniox 识别、手机→眼镜的显示。
// 每一项都是「这一秒窗口里」的值，每秒出一行然后清零。
/**
 * Soniox 回来的定稿 token 按「状态:语言」数字数（o＝original 原话、t＝translation 译文、n＝none 没翻译）。
 * 用来查「原话在出、译文不出」：是译文根本没回来（o 在涨、t 不涨），还是这些话被标成了不翻译（n 在涨）。
 * recent 是最近 RECENT_MS 之内的，total 是这次打开以来的
 */
const tok = { total: new Map<string, number>(), recent: [] as { at: number; key: string; n: number }[], nfSrc: 0, nfDst: 0, lastFinalAt: 0 }
const RECENT_MS = 30_000
function countTokens(res: Parameters<Captions['feed']>[0]) {
  const now = Date.now()
  tok.nfSrc = 0
  tok.nfDst = 0
  for (const t of res.tokens) {
    if (/^<[a-z]+>$/.test(t.text)) continue
    // 还没定稿的：原话挂了多少字、译文挂了多少字。原话一直挂着不定稿的话，译文是不会来的
    if (!t.is_final) { if (t.translation_status === 'translation') tok.nfDst += t.text.length; else tok.nfSrc += t.text.length; continue }
    tok.lastFinalAt = now
    const key = `${(t.translation_status ?? '-')[0]}:${t.language ?? '?'}`
    tok.total.set(key, (tok.total.get(key) ?? 0) + t.text.length)
    tok.recent.push({ at: now, key, n: t.text.length })
  }
  while (tok.recent.length && now - tok.recent[0].at > RECENT_MS) tok.recent.shift()
}
function tokLine(): string {
  const recent = new Map<string, number>()
  for (const r of tok.recent) recent.set(r.key, (recent.get(r.key) ?? 0) + r.n)
  const show = (m: Map<string, number>) => [...m].sort().map(([k, n]) => `${k} ${n}`).join(' ') || '-'
  const idle = tok.lastFinalAt ? ((Date.now() - tok.lastFinalAt) / 1000).toFixed(0) + 's' : '-'
  return `tok 30s: ${show(recent)} | all: ${show(tok.total)} | nf ${tok.nfSrc}/${tok.nfDst} · final ${idle} ago`
}

const diag = {
  /** 因为音频欠账太多而自动重开麦克风的次数 */
  micResets: 0,
  /** 麦克风打开后第一帧音频到达的时刻；0＝还没到 */
  micT0: 0,
  micBytes: 0,
  /** 单次 textContainerUpgrade 最久等了多少毫秒 */
  drawMs: 0,
  draws: 0,
  /** 每秒定时器最多晚了多少毫秒（页面被系统降速时会变大） */
  tickLate: 0,
  tickAt: Date.now(),
}

// ── 字幕进来：喂给组装器，文本变了就记下时刻 ──
function feedCaptions(res: Parameters<Captions['feed']>[0], segment = 0) {
  // 自动清屏是眼镜的事，所以「有没有新字」看眼镜上那份：只在手机上保留的话（被藏掉的目标语言）不算
  const before = [captions.screenSrc(), captions.screenDst()]
  countTokens(res)
  captions.feed(res, segment)
  if (captions.screenSrc() !== before[0] || captions.screenDst() !== before[1]) lastTextAt = Date.now()
  void render()
}

/** 音频欠账超过这么多、并且持续 MIC_LAG_HOLD_MS：重开麦克风。一次开麦至少过 MIC_MIN_OPEN_MS 才允许，免得来回开关 */
const MIC_LAG_MS = 2000
const MIC_LAG_HOLD_MS = 3000
const MIC_MIN_OPEN_MS = 20_000

// ── 渲染：只发变了的容器；串行化 ──
const last: Partial<Record<ContentBlock, string>> = {}
const lastDim: Partial<Record<ContentBlock, number>> = {}
let rendering = false
let dirty = false
/**
 * 两轮更新之间至少隔这么久。Soniox 说话时一秒回好几次，每次未定稿的字都变，原先是来一次画一次、
 * 画完立刻画下一次 —— 等于有人说话时一直把到眼镜的蓝牙链路占满，而眼镜麦的音频走的是同一条链路。
 * 留出空档给音频；一秒四次对读字幕来说看不出差别。空闲后的第一次更新不等（lastPass 早就过了）。
 */
const MIN_GAP = 250
let lastPass = 0
/** 手机上的字幕框：最多 300ms 更新一次（眼镜那边另有自己的节奏） */
let phoneTimer: ReturnType<typeof setTimeout> | null = null
function phoneSoon() {
  if (phoneTimer) return
  phoneTimer = setTimeout(() => {
    phoneTimer = null
    setCaptions(captions.items(), translating())
  }, 300)
}

async function render() {
  phoneSoon()
  if (rendering) { dirty = true; return }
  rendering = true
  try {
    do {
      const wait = lastPass + MIN_GAP - Date.now()
      if (wait > 0) await new Promise((r) => setTimeout(r, wait))
      dirty = false
      lastPass = Date.now()
      const s = screen()
      for (const k of BLOCKS) {
        if (last[k] === s[k] && lastDim[k] === s.dim[k]) continue
        last[k] = s[k]
        lastDim[k] = s.dim[k]
        const t0 = Date.now()
        await bridge.textContainerUpgrade(new TextContainerUpgrade({
          containerID: C[k].id, containerName: C[k].name, content: blank(s[k]), textColor: s.dim[k],
        }))
        diag.drawMs = Math.max(diag.drawMs, Date.now() - t0)
        diag.draws++
      }
    } while (dirty)
  } finally {
    rendering = false
  }
}

let mounted = false
async function mount(b: EvenAppBridge) {
  const s = screen()
  // 手势挂在专用空容器上（全角空格，叠在最后一行，什么都不画）
  const objs = [...BLOCKS.map((k) => container(k, s[k], s.dim[k])), container('capture', '　', DIM, 1)]
  // 长按菜单：清屏。菜单只能随建页/重建下发，换语言时 mount 会再跑一次
  const menuObject = new MenuContainerProperty({ menuItems: [new MenuItemProperty({ itemID: 1, itemName: t('menu.clear') })] })
  const page = { containerTotalNum: objs.length, textObject: objs, menuObject }
  let r = 1
  if (!mounted) r = await b.createStartUpPageContainer(new CreateStartUpPageContainer(page))
  if (r !== 0) await b.rebuildPageContainer(new RebuildPageContainer(page))
  mounted = true
  for (const k of BLOCKS) { last[k] = s[k]; lastDim[k] = s.dim[k] }
  console.log('Page created:', r === 0 ? 'success' : `rebuilt (create=${r})`)
}

// ── 麦克风 ──
async function openMic(): Promise<boolean> {
  const ok = await bridge.audioControl(true, settings.mic === 'glasses' ? AudioInputSource.Glasses : AudioInputSource.Phone)
  micOpen = !!ok
  micOpenedAt = Date.now()
  micLagSince = 0
  diag.micT0 = 0
  diag.micBytes = 0
  if (!ok) setNote(t('note.micFail', { m: t(settings.mic === 'glasses' ? 'mic.glasses' : 'mic.phone') }), 'warn')
  return micOpen
}
async function closeMic() {
  if (micOpen) await bridge.audioControl(false)
  micOpen = false
}

// ── Soniox 会话 ──
function openSession() {
  if (!settings.apiKey || session) return
  session = new SonioxSession({
    apiKey: settings.apiKey, target: translating() ? settings.target : '', hints: parseHints(settings.hints), context: {},
    strict: settings.hintsStrict,
    endpoint: settings.endpoint,
  }, {
    onResponse: (r, seg) => feedCaptions(r, seg),
    onNet: (slow) => {
      netSlow = slow
      if (slow) setNote(t('note.netSlow'), 'warn')
      else if (session?.status === 'live') setNote('')
      void render()
    },
    onStatus: (s, detail) => {
      notice = s === 'live' || s === 'idle' ? '' : s === 'error' ? `! ${detail}` : t('g.reconnecting')
      if (s === 'error') setNote(t('note.captionsStopped', { d: detail }), 'warn')
      else if (s === 'live') setNote('')
      syncStatus()
      void render()
    },
  }, segmentBase)
  session.start()
}
function closeSession(): Promise<void> {
  const s = session
  session = null
  notice = ''
  netSlow = false
  if (!s) return Promise.resolve()
  segmentBase = s.segment
  return s.stop()
}

function syncStatus() {
  if (!settings.apiKey) { setStatus('setup'); return }
  if (mode === 'paused') { setStatus('paused'); return }
  if (mode === 'quiet') { setStatus('quiet'); return }
  const ss = session?.status
  if (ss === 'error') setStatus('error', notice.replace(/^! /, ''))
  else if (ss === 'live') setStatus('live', translating() ? phoneTargetName() : '')
  else if (ss === 'reconnecting') setStatus('reconnecting')
  else setStatus('connecting')
}

// ── 模式 ──
async function goLive() {
  mode = 'live'
  started = true
  lastVoiceAt = Date.now()
  captions.clearScreen()   // 开始／恢复时清眼镜：上一段的字幕和现在没关系了。手机上的记录不清
  if (!micOpen) await openMic()
  openSession()
  syncStatus()
  void render()
}
async function pause() {
  mode = 'paused'
  void closeSession()
  await closeMic()
  syncStatus()
  void render()
}
function togglePause() { if (mode === 'paused') void goLive(); else void pause() }


function applySettings(next: Settings) {
  const micChanged = next.mic !== settings.mic
  const sessionChanged = next.apiKey !== settings.apiKey || next.target !== settings.target
    || next.translate !== settings.translate || next.hints !== settings.hints || next.hintsStrict !== settings.hintsStrict || next.endpoint !== settings.endpoint
  settings = next
  captions.target = translating() ? settings.target : ''
  captions.hideTargetSpeech = !settings.showTargetSpeech
  if (mode === 'live') {
    if (micChanged) void closeMic().then(openMic)
    if (sessionChanged) void closeSession().then(() => { if (mode === 'live') openSession() })
    if (!micOpen && settings.apiKey) void goLive()
  }
  syncStatus()
  void render()
}

// ── 输入 ──
function eventTypeOf(envelope?: { eventType?: OsEventTypeList }): OsEventTypeList | null {
  if (!envelope) return null
  return envelope.eventType ?? OsEventTypeList.CLICK_EVENT
}

bridge.onEvenHubEvent((event) => {
  const audio = event.audioEvent
  if (audio) {
    const pcm = toPcm(audio.audioPcm)
    if (!pcm) return
    if (!diag.micT0) diag.micT0 = Date.now()
    diag.micBytes += pcm.byteLength
    if (rms(pcm) > 500) {
      lastVoiceAt = Date.now()
      spokeSinceFinalize = true
      // 安静期断开后又有声音：立刻重连
      if (mode === 'quiet') { mode = 'live'; openSession(); syncStatus(); void render() }
    }
    session?.sendAudio(pcm)
    return
  }
  if (event.menuItemClickEvent?.itemID === 1) { captions.clearScreen(); void render(); return }
  const types = [eventTypeOf(event.sysEvent), eventTypeOf(event.textEvent)]
  if (types.includes(OsEventTypeList.DOUBLE_CLICK_EVENT)) {
    void closeSession(); void closeMic()
    void bridge.shutDownPageContainer(1)
    return
  }
  // 长按：暂停／继续。单击、上下滑：不做任何事（误触太容易）。翻译开关只在手机设置里
  // 手势挂在专用空容器上只是为了别让固件推字幕的字
  if (types.includes(OsEventTypeList.LONG_PRESS_EVENT)) { togglePause(); return }
  // AI 回答显示着的时候，上下滑是翻屏（平时滑动不做任何事）
  if (ai) {
    if (types.includes(OsEventTypeList.SCROLL_BOTTOM_EVENT)) { pageAi(1); return }
    if (types.includes(OsEventTypeList.SCROLL_TOP_EVENT)) { pageAi(-1); return }
  }
  // 单击：AI 解答（试验）。没填 Claude Key 时不做任何事，和原来一样
  if (types.includes(OsEventTypeList.CLICK_EVENT)) toggleAi()
})

// ── 启动 ──
const handlers: Parameters<typeof mountUi>[1] = {
  onSave: (next) => {
    const lang = resolveLang(next.lang)
    void saveSettings(bridge, next).then((ok) => { if (!ok) setStatus('error', t('note.settingsNotSaved')) })
    if (lang !== getLang()) { setLang(lang); mountUi(next, handlers); void mount(bridge) }
    applySettings(next)
  },
  onPause: togglePause,
  // 手机上的「清屏」清的也是眼镜。手机上的记录任何时候都不清
  onClear: () => { captions.clearScreen(); void render() },
}
mountUi(settings, handlers)
await mount(bridge)
// 启动时不自动开听：Soniox 按连接时长计费，由用户按「开始」（手机）或单击（眼镜）再连
mode = 'paused'
if (settings.apiKey) { setStatus('paused'); setNote(t('note.pressStart')); void render() }
else { setStatus('setup'); setNote(t('note.noKey')); void render() }

// 安静 N 分钟断开 Soniox（麦继续开着，靠音量判断什么时候重连）
setInterval(() => {
  const q = settings.quietMin
  if (mode === 'live' && q > 0 && session && Date.now() - lastVoiceAt > q * 60_000) {
    mode = 'quiet'
    void closeSession()
    syncStatus()
    void render()
  }
}, 2000)

// 诊断读数：每秒一行。mic＝从开麦算起，墙上时间比收到的音频时长多出多少（眼镜→手机这段欠了多少；
// 前提是宿主连续送音频，静音时也送 —— 真机上是否如此没验过，静音时这个数若自己涨就说明不是）。
// stt＝Soniox 比已发出的音频落后多少；net＝压在 WebSocket 里没发出去的；draw＝一次眼镜更新最久等多久 × 次数；
// tick＝定时器晚了多少；然后是页面可见性（手机锁屏／切后台时是 hidden）；
// drop＝为了跟上而丢掉的音频总时长；reset＝因为发不出去或落后太多而自动重开连接的次数（soniox.ts）；
// micreset＝因为音频欠账太多而自动重开麦克风的次数
setInterval(() => {
  const now = Date.now()
  diag.tickLate = Math.max(diag.tickLate, now - diag.tickAt - 1000)
  diag.tickAt = now
  // 音频欠账：从开麦算起，墙上时间比收到的音频时长多出多少。真机实测（0.1.9，眼镜麦，Wi‑Fi）：这个数涨到 +2.9 秒时
  // 字幕明显变慢，而 stt／net／drop／reset 全都正常 —— 慢在眼镜→手机这一段，声音是排着队晚到的。
  // 上游的队我们清不了，但退出重进、断开重连都能恢复。所以欠得多了就替用户做这一下：麦克风和 Soniox 连接一起重开。
  const micLag = micOpen && diag.micT0 ? now - diag.micT0 - diag.micBytes / 32 : 0
  if (mode !== 'live' || micLag <= MIC_LAG_MS) micLagSince = 0
  else if (!micLagSince) micLagSince = now
  else if (now - micLagSince > MIC_LAG_HOLD_MS && now - micOpenedAt > MIC_MIN_OPEN_MS && !micRestarting) {
    micRestarting = true
    diag.micResets++
    console.warn(`[mic] 音频欠了 ${(micLag / 1000).toFixed(1)} 秒，麦克风和 Soniox 连接一起重开`)
    // 两头一起重开，等于替用户做一次「暂停再继续」（用户实测：断开重连能把延迟恢复）。
    // 排队到底排在哪一段没法从这里看出来，所以不赌是哪一头。手机上的记录不动，眼镜上的字幕也不清。
    void closeSession()
    void closeMic().then(openMic).then(() => { if (mode === 'live') openSession() }).finally(() => { micRestarting = false; syncStatus(); void render() })
  }
  if (diagShown()) {
    const sec = (ms: number) => (ms >= 0 ? '+' : '') + (ms / 1000).toFixed(1) + 's'
    const mic = micOpen && diag.micT0 ? sec(micLag) : '-'
    const stt = session?.lagMs == null ? '-' : sec(session.lagMs)
    const line = `mic ${mic} · stt ${stt} · net ${((session?.buffered ?? 0) / 1024).toFixed(0)}k`
      + ` · draw ${diag.drawMs}ms x${diag.draws} · tick +${Math.max(0, diag.tickLate)}ms · ${document.visibilityState}`
      + ` · drop ${(sonioxStats.droppedMs / 1000).toFixed(1)}s · reset ${sonioxStats.resets} · micreset ${diag.micResets}`
    const line2 = `${tokLine()} · ep ${settings.endpoint ? 'on' : 'off'} · tr ${translating() ? settings.target : 'off'}`
    setDiag(line + String.fromCharCode(10) + line2)
    console.log('[diag]', line, '|', line2)
  }
  diag.drawMs = 0
  diag.draws = 0
  diag.tickLate = 0
}, 1000)

// 自动清屏：clearSec 秒没有新字就把**眼镜上**的字幕清掉（手机上的不清）。看的是**字幕文本有没有变**（未定稿的字在变也算有新字），
// 不看音量 —— 有声音但没识别出字，屏幕上留着的旧字照样该清
setInterval(() => {
  const s = settings.clearSec
  if (!(s > 0) || !(captions.screenSrc() || captions.screenDst())) return
  if (Date.now() - lastTextAt < s * 1000) return
  // 只清眼镜。手机上的字幕框留着，那是用来回头看的
  captions.clearScreen()
  void render()
}, 500)

// 端点检测关着时：一句话说完停下来，最后一段会一直挂着不定稿，译文也跟着不出，要等下一句的声音把它顶出来。
// 所以停顿够长（FINALIZE_PAUSE_MS）就替它发一次定稿指令。停顿取长一点是有意的 —— 定稿前给模型的音频上下文越足，
// 说话人区分越准，这正是关掉端点检测想换来的东西（和 meeting-notes 同一做法、同一个值）
const FINALIZE_PAUSE_MS = 1200
setInterval(() => {
  if (settings.endpoint || !session || mode !== 'live' || !spokeSinceFinalize) return
  if (Date.now() - lastVoiceAt >= FINALIZE_PAUSE_MS) {
    spokeSinceFinalize = false
    session.finalize()
  }
}, 200)

// 演示字幕（只在开发期、没 Key 时）
if (import.meta.env.DEV && !settings.apiKey) {
  runFake(SCRIPT, (res) => feedCaptions(res), {
    paused: () => mode === 'paused' || !!settings.apiKey,
    onCycle: async () => {
      notice = t('g.demoRestart')
      await render()
      await new Promise((r) => setTimeout(r, 2500))
      captions.clearScreen()
      notice = ''
      await render()
    },
  })
}
