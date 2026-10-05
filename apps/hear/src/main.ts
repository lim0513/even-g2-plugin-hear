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
import { C, BOX, BLOCKS, ROWS, DIM, MID, BRIGHT, lastLines, type Block, type ContentBlock, type Screen } from './layout.ts'
import { Captions } from './captions.ts'
import { rms, toPcm } from './core/wav.ts'
import { loadSettings, saveSettings, type Settings } from './settings.ts'
import { parseHints } from './languages.ts'
import { mountUi, setStatus, setNote } from './ui.ts'
import { SonioxSession } from './soniox.ts'
import { SCRIPT, runFake } from './demo-feed.ts'
import { t, setLang, getLang, resolveLang } from './i18n.ts'

// ── 模块顶层状态：全部在 mount 之前声明（根 CLAUDE.md：TDZ 坑）──
type Mode = 'live' | 'paused' | 'quiet'
let mode: Mode = 'live'
let session: SonioxSession | null = null
let segmentBase = 0
let notice = ''
let micOpen = false
let lastVoiceAt = Date.now()
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
  if (import.meta.env.VITE_SONIOX_KEY && !settings.apiKey && !q.get('demo')) settings.apiKey = String(import.meta.env.VITE_SONIOX_KEY)
  console.log(`[i18n] navigator=${navigator.language} search=${location.search} → ${getLang()}`)
}
captions.target = settings.translate ? settings.target : ''
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


function screen(): Screen {
  let head: string
  if (!settings.apiKey && !demo) head = t('g.noKey')
  else if (mode === 'paused') head = t(started ? 'g.paused' : 'g.start')
  else if (mode === 'quiet') head = t('g.quiet')
  else if (!demo && (!session || session.status === 'connecting')) head = t('g.connecting')
  else head = t('g.live')
  if (notice) head += `   ${notice}`
  const tr = translating() ? t('g.translate.on', { l: targetLabel() }) : ''
  const hdim = mode === 'live' && !notice ? DIM : MID
  if (translating() && settings.showSource) {
    return {
      header: head, tr,
      top: lastLines(captions.srcText(), ROWS.top).join('\n'),
      bottom: lastLines(captions.dstText(), ROWS.bottom).join('\n'),
      dim: { header: hdim, tr: DIM, top: MID, bottom: BRIGHT },
    }
  }
  // 只出一种文字（不翻译＝原文；翻译但不显示原文＝译文）：9 行，前 3 行放 top、后 6 行放 bottom，
  // 看起来是一整块。说目标语言的话本来就进译文流（captions.ts），所以藏掉原文不会漏掉它们
  const lines = lastLines(translating() ? captions.dstText() : captions.srcText(), ROWS.top + ROWS.bottom)
  // 不足 9 行时从上往下填（top 先满），否则 top 空着、中间出现一截空白（截图踩过）
  const topN = Math.min(ROWS.top, lines.length)
  return {
    header: head, tr,
    top: lines.slice(0, topN).join('\n'),
    bottom: lines.slice(topN).join('\n'),
    dim: { header: hdim, tr: DIM, top: BRIGHT, bottom: BRIGHT },
  }
}

// ── 渲染：只发变了的容器；串行化 ──
const last: Partial<Record<ContentBlock, string>> = {}
const lastDim: Partial<Record<ContentBlock, number>> = {}
let rendering = false
let dirty = false
async function render() {
  if (rendering) { dirty = true; return }
  rendering = true
  try {
    do {
      dirty = false
      const s = screen()
      for (const k of BLOCKS) {
        if (last[k] === s[k] && lastDim[k] === s.dim[k]) continue
        last[k] = s[k]
        lastDim[k] = s.dim[k]
        await bridge.textContainerUpgrade(new TextContainerUpgrade({
          containerID: C[k].id, containerName: C[k].name, content: blank(s[k]), textColor: s.dim[k],
        }))
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
  }, {
    onResponse: (r) => { captions.feed(r); void render() },
    onStatus: (s, detail) => {
      notice = s === 'live' || s === 'idle' ? '' : s === 'error' ? `! ${detail}` : t('g.reconnecting')
      if (s === 'error') setNote(t('note.captionsStopped', { d: detail }), 'warn')
      else if (s === 'live') setNote(t('glasses.help'))
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
  else if (ss === 'live') setStatus('live', translating() ? `${t('translate')} ${targetLabel()}` : '')
  else if (ss === 'reconnecting') setStatus('reconnecting')
  else setStatus('connecting')
}

// ── 模式 ──
async function goLive() {
  mode = 'live'
  started = true
  lastVoiceAt = Date.now()
  captions.clear()   // 开始／恢复时清屏：上一段的字幕和现在没关系了
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
    || next.translate !== settings.translate || next.hints !== settings.hints
  settings = next
  captions.target = translating() ? settings.target : ''
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
    if (rms(pcm) > 500) {
      lastVoiceAt = Date.now()
      // 安静期断开后又有声音：立刻重连
      if (mode === 'quiet') { mode = 'live'; openSession(); syncStatus(); void render() }
    }
    session?.sendAudio(pcm)
    return
  }
  if (event.menuItemClickEvent?.itemID === 1) { captions.clear(); void render(); return }
  const types = [eventTypeOf(event.sysEvent), eventTypeOf(event.textEvent)]
  if (types.includes(OsEventTypeList.DOUBLE_CLICK_EVENT)) {
    void closeSession(); void closeMic()
    void bridge.shutDownPageContainer(1)
    return
  }
  // 长按：暂停／继续。单击、上下滑：不做任何事（误触太容易）。翻译开关只在手机设置里
  // 手势挂在专用空容器上只是为了别让固件推字幕的字
  if (types.includes(OsEventTypeList.LONG_PRESS_EVENT)) togglePause()
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
  onClear: () => { captions.clear(); void render() },
}
mountUi(settings, handlers)
await mount(bridge)
// 启动时不自动开听：Soniox 按连接时长计费，由用户按「开始」（手机）或单击（眼镜）再连
mode = 'paused'
if (settings.apiKey) { setStatus('paused'); setNote(t('note.pressStart')); void render() }
else { setStatus('setup'); setNote(t('note.noKey'), 'warn'); void render() }

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

// 演示字幕（只在开发期、没 Key 时）
if (import.meta.env.DEV && !settings.apiKey) {
  runFake(SCRIPT, (res) => { captions.feed(res); void render() }, {
    paused: () => mode === 'paused' || !!settings.apiKey,
    onCycle: async () => {
      notice = t('g.demoRestart')
      await render()
      await new Promise((r) => setTimeout(r, 2500))
      captions.clear()
      notice = ''
      await render()
    },
  })
}
