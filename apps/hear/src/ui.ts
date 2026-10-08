// 手机侧界面（0.2.0 重做）。出发点：这个 App 是给听不见的人看字的，所以整页就是对话的文字 ——
// 不是「一个设置表单，下面附一个字幕框」。
//
//   上面固定：名字 + 版本号、一句话的状态（前面的记号和眼镜顶栏上的一模一样）、三个按钮（开始/暂停、清空眼镜、设置）
//   下面一截，三选一：
//     first   第一次打开、还没有 Soniox Key：只放「填 Key，保存并开始」这一件事
//     log     对话记录，不套框，铺满。正在说的那一句是整页最大的字；换了人说话前面有「•」（和眼镜上同一个记号）
//     sheet   设置。暂停后才进得来；分组，只有两个选择的用开关或二选一；「保存」吸在标题旁边
//
// 配色照 Even 给手机页的规范：底 #111111、强调色 #FEF991 只给「现在要点的按钮」和「开着」。
// **眼镜的绿色 #3CFA44 不出现在手机页上**（规范明说），所以状态不再用绿色小标签。
//
// 从旧版留下来的三条，都是真机上踩出来的，别改回去：
// - **滚动放在内层容器里，不靠整页滚动。**iOS 上点进输入框弹出键盘之后，整页滚动会卡住拉不动
//   （键盘弹出时系统会平移整个页面，之后页面自己的滚动位置就乱了）。所以 html/body 不滚，
//   外壳的高度跟着「键盘上方还剩多少」（visualViewport）走，里面那一截自己滚。
// - **有输入框的两截（第一次打开、设置）末尾留 30vh 空白。**点进靠下的输入框、键盘弹出来之后，
//   页面往下拉会出问题，最底下几项滚不进键盘上方；留出这段空白才拉得上来（根 CLAUDE.md）。
//   对话记录里没有输入框，不留 —— 留了的话最新的字会停在离底三成的地方。
// - **记录不整块重画**，一段发言一个节点、只换变了的（见 setCaptions）。整块重画在 iPhone 上会闪。
//
// 文案全部走 i18n.ts 的 t()；换语言时 main.ts 重新调一次 mountUi()。
import type { Settings } from './settings.ts'
import type { Item } from './captions.ts'
import { LANGUAGES, LANG_CODES, parseHints } from './languages.ts'
import { t, LANGS, LANG_NAMES } from './i18n.ts'
import { DEFAULT_AI_MODEL, isAiModel, listModels, mergeModels, type AiModelInfo } from './ai.ts'

export type Status = 'live' | 'paused' | 'connecting' | 'reconnecting' | 'quiet' | 'setup' | 'error'

export type UiHandlers = {
  onSave: (s: Settings) => void
  onPause: () => void
  onClear: () => void
}

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!))
const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T
const el: Record<string, HTMLElement> = {}

// ── 模块状态（全部在函数之前声明：mountUi 之后的回调会读它们）──
/** 开发期 ?demo=1：没有 Key 也当作有，直接看记录（演示字幕）。生产里恒为 false */
const demoDev = import.meta.env.DEV && new URLSearchParams(location.search).has('demo')
// 开发期 ?diag=1 直接打开（模拟器里点不到手机页）。生产里恒为 false
let diagOn = import.meta.env.DEV && new URLSearchParams(location.search).has('diag')
/** 现在生效的设置。保存后换成新的（不重新 mount 的时候也要对） */
let cur: Settings
let handlers: UiHandlers
/** 下面那一截现在显示什么。没有 Key 时不看它，一律显示 first */
let view: 'log' | 'settings' = 'log'
let status: Status = 'setup'
/** 正在听（含连接中、重连中、安静断开）：设置进不去，要先暂停 */
let locked = false
let everLive = false
let shownSig: string[] = []
/** 状态下面那一行平时的内容；被临时提示盖住之后要换回来 */
let note: { text: string; kind: 'hint' | 'warn' } = { text: '', kind: 'hint' }
let flashTimer: ReturnType<typeof setTimeout> | null = null
let styled = false
let fitted = false

const needKey = () => !cur.apiKey && !demoDev

export function mountUi(settings: Settings, h: UiHandlers) {
  cur = settings
  handlers = h
  const app = document.getElementById('app')!
  const keyLink = '<a href="https://console.soniox.com" target="_blank" rel="noreferrer">console.soniox.com</a>'
  const on = (b: boolean) => (b ? ' checked' : '')
  const sel = (v: string, c: string) => (v === c ? ' selected' : '')
  document.title = t('app.title')

  // 设置里的一行：左边说明，右边控件（开关、二选一、下拉、数字）
  const line = (label: string, hint: string, control: string, forId = '') =>
    `<div class="line"><label class="what"${forId ? ` for="${forId}"` : ''}>${label}${hint ? `<small>${hint}</small>` : ''}</label>${control}</div>`
  // 要打字的：说明在上，输入框占满一行
  const field = (label: string, hint: string, control: string, forId: string) =>
    `<div class="field"><label for="${forId}">${label}</label>${control}${hint ? `<p class="hint">${hint}</p>` : ''}</div>`
  const sw = (id: string, checked: boolean) => `<input id="${id}" class="sw" type="checkbox" role="switch"${on(checked)} />`
  const seg = (name: string, value: string, opts: [string, string][]) =>
    `<div class="seg" role="radiogroup">${opts.map(([v, text]) => `<label><input type="radio" name="${name}" value="${v}"${on(v === value)} /><span>${text}</span></label>`).join('')}</div>`
  const tv = settings.translate ? settings.target : ''

  app.innerHTML = `
    <div class="page">
    <div class="top">
      <div class="head"><h1>${t('app.title')}</h1><button id="ver" type="button" class="ver">v${esc(String(__APP_VERSION__))}</button></div>
      <div id="state" class="state idle"><span id="mark" class="mark">||</span><span id="status"></span></div>
      <p id="note" class="sub"></p>
      <div id="diag" class="diag"${diagOn ? '' : ' hidden'}></div>
      <div id="acts" class="acts">
        <button id="pause" type="button" class="go">${t('start')}</button>
        <button id="clear" type="button" class="plain">${t('clear')}</button>
        <button id="open" type="button" class="plain">${t('settings')}</button>
      </div>
    </div>

    <section id="ai-box" class="ai-live" hidden>
      <div id="ai-info" class="who"></div>
      <div id="ai-text" class="ai-text"></div>
    </section>

    <section id="first" class="first" hidden>
      <p class="lead">${t('first.lead')}</p>
      <div class="field">
        <label for="firstKey">Soniox API Key</label>
        <input id="firstKey" type="text" autocomplete="off" autocapitalize="off" spellcheck="false" placeholder="${t('apiKey.placeholder')}" />
        <p class="hint">${t('first.hint', { link: keyLink })}</p>
      </div>
      <div class="acts"><button id="firstGo" type="button" class="go">${t('first.go')}</button></div>
    </section>

    <main id="log" class="log">
      <div id="cap-empty" class="empty"><p>${t('caps.empty')}</p><p>${t('glasses.help')}</p></div>
      <div id="cap-list" class="cap-list" hidden></div>
    </main>

    <section id="sheet" class="sheet" hidden>
      <div class="sheet-head"><h2>${t('settings')}</h2><button id="save" type="button" class="go">${t('save')}</button></div>

      <div class="group"><h3>${t('grp.tr')}</h3>
        ${line(t('translate'), '', `<select id="target"><option value=""${sel('', tv)}>${t('translate.off')}</option>${LANGUAGES.map((l) => `<option value="${l.code}"${sel(l.code, tv)}>${esc(l.name)} (${l.code})</option>`).join('')}</select>`, 'target')}
        ${line(t('showSrc'), t('showSrc.one'), sw('showSrc', settings.showSource), 'showSrc')}
        ${line(t('tgtSpeech'), t('tgtSpeech.one'), sw('tgtSpeech', settings.showTargetSpeech), 'tgtSpeech')}
      </div>

      <div class="group"><h3>${t('grp.rec')}</h3>
        ${line(t('mic'), '', seg('mic', settings.mic, [['glasses', t('mic.glasses')], ['phone', t('mic.phone')]]))}
        ${line(t('endpoint'), t('endpoint.one'), seg('endpoint', settings.endpoint ? 'fast' : 'acc', [['acc', t('endpoint.acc')], ['fast', t('endpoint.fast')]]))}
        ${field(t('hints'), t('hints.hint'), `<input id="hints" type="text" autocapitalize="off" spellcheck="false" placeholder="ja, zh" value="${esc(settings.hints)}" />`, 'hints')}
        ${line(t('strict'), t('strict.hint'), sw('strict', settings.hintsStrict), 'strict')}
      </div>

      <div class="group"><h3>${t('grp.glass')}</h3>
        ${line(t('tiers'), t('tiers.hint'), sw('tiers', settings.tiers), 'tiers')}
        ${line(t('clearSec'), t('clearSec.hint'), `<input id="clearSec" class="num" type="number" inputmode="numeric" min="0" max="600" step="1" value="${settings.clearSec}" />`, 'clearSec')}
      </div>

      <div class="group"><h3>${t('grp.conn')}</h3>
        ${line(t('quiet'), `${t('quiet.hint')} ${t('cost.hint')}`, `<input id="quiet" class="num" type="number" inputmode="numeric" min="0" max="60" step="1" value="${settings.quietMin}" />`, 'quiet')}
      </div>

      <div class="group"><h3>${t('ai.title')}</h3>
        ${field(t('ai.key'), t('ai.hint'), `<input id="claudeKey" type="password" autocomplete="off" autocapitalize="off" spellcheck="false" value="${esc(settings.claudeKey)}" />`, 'claudeKey')}
        ${line(t('ai.model'), '', `<select id="claudeModel">${mergeModels(settings.claudeModels ?? [], settings.claudeModel).map((m) => `<option value="${esc(m.id)}"${sel(m.id, settings.claudeModel)}>${esc(m.name)}</option>`).join('')}</select>`, 'claudeModel')}
      </div>

      <div class="group"><h3>${t('grp.key')}</h3>
        ${field('Soniox API Key', t('first.hint', { link: keyLink }), `<div class="key-wrap"><input id="apiKey" type="password" autocomplete="off" autocapitalize="off" spellcheck="false" placeholder="${t('apiKey.placeholder')}" value="${esc(settings.apiKey)}" /><button id="revealKey" type="button" class="plain">${t('show')}</button></div>`, 'apiKey')}
        ${line(t('lang'), '', `<select id="lang"><option value="auto"${sel('auto', settings.lang)}>${t('lang.auto')}</option>${LANGS.map((l) => `<option value="${l}"${sel(l, settings.lang)}>${LANG_NAMES[l]}</option>`).join('')}</select>`, 'lang')}
      </div>

      <p class="foot">${t('glasses.help')}</p>
    </section>
    </div>`

  for (const id of ['state', 'mark', 'status', 'note', 'diag', 'acts', 'pause', 'open', 'ai-box', 'ai-info', 'ai-text', 'first', 'log', 'cap-list', 'cap-empty', 'sheet']) el[id] = $(id)
  shownSig = []
  // 点版本号：开关诊断读数（排查「用久了延迟变高」用，平时不显示）。读数出在状态下面
  $('ver').onclick = () => { diagOn = !diagOn; el.diag.hidden = !diagOn; el.diag.textContent = '' }
  $<HTMLButtonElement>('pause').onclick = () => handlers.onPause()
  $<HTMLButtonElement>('clear').onclick = () => handlers.onClear()
  // 设置：正在听的时候进不去。按钮不真的 disabled（那样点了没有任何反应，不知道为什么），而是点了告诉你要先暂停
  $<HTMLButtonElement>('open').onclick = () => {
    if (locked) { flash(t('settings.locked')); return }
    view = view === 'settings' ? 'log' : 'settings'
    syncView()
    if (view === 'settings') void refreshModels()
  }
  // 填完 Claude Key 离开输入框：用新 Key 再查一次
  $<HTMLInputElement>('claudeKey').addEventListener('change', () => void refreshModels())

  // 第一次打开：填 Key → 保存 → 直接开始
  const firstKey = $<HTMLInputElement>('firstKey')
  $<HTMLButtonElement>('firstGo').onclick = () => {
    const key = firstKey.value.trim()
    if (!key) { flash(t('first.need')); firstKey.focus(); return }
    cur = { ...cur, apiKey: key }
    view = 'log'
    handlers.onSave(cur)
    handlers.onPause()
  }

  const apiKey = $<HTMLInputElement>('apiKey')
  const reveal = $<HTMLButtonElement>('revealKey')
  reveal.onclick = () => {
    const show = apiKey.type === 'password'
    apiKey.type = show ? 'text' : 'password'
    reveal.textContent = t(show ? 'hide' : 'show')
  }
  // 不翻译时这两项不起作用，灰掉免得以为它管用
  const target = $<HTMLSelectElement>('target')
  const showSrc = $<HTMLInputElement>('showSrc')
  const tgtSpeech = $<HTMLInputElement>('tgtSpeech')
  const syncTr = () => {
    const off = target.value === ''
    showSrc.disabled = tgtSpeech.disabled = off
    showSrc.closest('.line')!.classList.toggle('off', off)
    tgtSpeech.closest('.line')!.classList.toggle('off', off)
  }
  target.onchange = syncTr
  syncTr()

  const picked = (name: string) => (document.querySelector(`input[name="${name}"]:checked`) as HTMLInputElement | null)?.value ?? ''
  $<HTMLButtonElement>('save').onclick = () => {
    const tgt = target.value
    // 从 cur 展开：表单里没有的字段（epV 这种内部记号）要原样带着。0.1.12 是从头拼的，把 epV 弄丢了，
    // 结果每次保存后下一次启动都会把「一句话什么时候定稿」改回「准」
    const next: Settings = {
      ...cur,
      lang: $<HTMLSelectElement>('lang').value,
      apiKey: apiKey.value.trim(),
      // 下拉选了语言＝开翻译；选「关」只关开关，目标语言留着
      translate: tgt !== '' && LANG_CODES.has(tgt),
      target: tgt !== '' && LANG_CODES.has(tgt) ? tgt : cur.target,
      showSource: showSrc.checked,
      showTargetSpeech: tgtSpeech.checked,
      endpoint: picked('endpoint') === 'fast',
      hints: parseHints($<HTMLInputElement>('hints').value).join(', '),
      hintsStrict: $<HTMLInputElement>('strict').checked,
      tiers: $<HTMLInputElement>('tiers').checked,
      mic: picked('mic') === 'phone' ? 'phone' : 'glasses',
      quietMin: Math.max(0, Math.min(60, Number($<HTMLInputElement>('quiet').value) || 0)),
      clearSec: Math.max(0, Math.min(600, Math.round(Number($<HTMLInputElement>('clearSec').value) || 0))),
      claudeKey: $<HTMLInputElement>('claudeKey').value.trim(),
      claudeModel: (() => { const v = $<HTMLSelectElement>('claudeModel').value; return isAiModel(v) ? v : DEFAULT_AI_MODEL })(),
    }
    cur = next
    view = 'log'
    handlers.onSave(next)   // 换了界面语言的话 main.ts 会重新 mountUi，下面两行落在新的页面上
    syncView()
    flash(t('saved'))
  }
  injectStyles()
  fitViewport()
  paintStatus()
  paintNote()
  syncView()
}

// ── Claude 的模型列表：打开设置时按 Key 实际查一遍 ──
// 查到了就换掉下拉框里的选项（正在选的那个保持选中），并记在 cur 里，下次保存时一起存下来；
// 查不到（没填 Key、没网、接口被拦）就保持原样，不打扰
let modelsFor = ''
async function refreshModels() {
  const key = ($<HTMLInputElement>('claudeKey')?.value ?? '').trim()
  if (!key || key === modelsFor) return
  const found: AiModelInfo[] = await listModels(key)
  if (!found.length) return
  modelsFor = key
  cur = { ...cur, claudeModels: found }
  const box = $<HTMLSelectElement>('claudeModel')
  if (!box) return
  const picked = box.value
  box.textContent = ''
  for (const m of mergeModels(found, picked)) {
    const o = document.createElement('option')
    o.value = m.id
    o.textContent = m.name
    o.selected = m.id === picked
    box.appendChild(o)
  }
}

// ── 下面那一截显示哪一个 ──
function syncView() {
  if (!el.first) return
  const first = needKey()
  if (first || locked) view = 'log'
  const settings = !first && view === 'settings'
  el.first.hidden = !first
  el.acts.hidden = first
  el.sheet.hidden = !settings
  el.log.hidden = first || settings
  el.open.textContent = t(settings ? 'close' : 'settings')
  el.open.classList.toggle('on', settings)
  el.open.classList.toggle('locked', locked)
  el.open.setAttribute('aria-disabled', locked ? 'true' : 'false')
}

// ── 外壳高度跟着键盘走 ──
function fitViewport() {
  if (fitted) return
  fitted = true
  const vv = window.visualViewport
  const fit = () => {
    document.documentElement.style.setProperty('--vvh', `${Math.round(vv ? vv.height : window.innerHeight)}px`)
    // 键盘弹出时系统把整页往上推了：推回去，让内层容器自己滚（外壳已经缩到键盘上方了）
    if (vv && vv.offsetTop > 0) window.scrollTo(0, 0)
  }
  vv?.addEventListener('resize', fit)
  vv?.addEventListener('scroll', fit)
  window.addEventListener('resize', fit)
  fit()
  // 点进输入框：等键盘出来、外壳缩好，再把这个输入框滚到看得见的地方
  document.addEventListener('focusin', (e) => {
    const target = e.target as HTMLElement | null
    if (!target || !/^(INPUT|SELECT|TEXTAREA)$/.test(target.tagName)) return
    if ((target as HTMLInputElement).type === 'checkbox' || (target as HTMLInputElement).type === 'radio') return
    setTimeout(() => target.scrollIntoView({ block: 'center', behavior: 'smooth' }), 350)
  })
}

// ── 记录 ──
// 手机上的记录这次打开期间不清，会越来越长（上万字）。每秒更新好几次，不能整个重写 ——
// 整块重画在 iPhone 上会闪（根 CLAUDE.md，meeting-notes 踩过）。所以一段发言一个节点，只换内容变了的那几段：
// 平时变的只有最后一段（正在说的），偶尔是前面某一段（译文晚到）。
// 「正在说的那一句用大字」不写在节点上，由 CSS 按「正在听 + 最后一段」来定，说完自己退回去，不用重画
const NL = String.fromCharCode(10)
function sayNode(src: string, dst: string, turn: boolean, translating: boolean): HTMLElement {
  const box = document.createElement('div')
  box.className = turn ? 'utt say turn' : 'utt say'
  const add = (cls: string, text: string) => { const d = document.createElement('div'); d.className = cls; d.textContent = text; box.appendChild(d) }
  // 原话小而暗，译文大而亮。没开翻译时只有原话，它就是主角，用亮的那种。
  // 只有译文没有原话的（别人直接说目标语言）同样是亮的
  if (src) add(translating || dst ? 'u-src' : 'u-dst', src)
  if (dst) add('u-dst', dst)
  return box
}
function aiNode(text: string): HTMLElement {
  const box = document.createElement('div')
  box.className = 'utt ai'
  const who = document.createElement('div')
  who.className = 'who'
  who.textContent = t('ai.who')
  const d = document.createElement('div')
  d.className = 'u-dst'
  d.textContent = text
  box.append(who, d)
  return box
}

/**
 * 正在写的 AI 回答：钉在记录上方，边写边出。text 为 null＝收起（写完的回答由 captions.note 插进记录里它出现的位置）。
 * info：状态或耗时，接在标题后面
 */
export function setAi(text: string | null, info = '') {
  if (!el['ai-box']) return
  el['ai-box'].hidden = text === null
  if (text === null) return
  if (el['ai-text'].textContent !== text) el['ai-text'].textContent = text
  el['ai-info'].textContent = info || t('ai.who')
}

/**
 * 手机上的记录：一段发言一块，原话在上、译文在下，中间夹着 AI 的回答。
 * translating：现在开着翻译没有 —— 只影响「只有原话的段」用哪种字体
 */
export function setCaptions(items: Item[], translating: boolean) {
  const list = el['cap-list']
  if (!list) return
  const sig = items.map((it) => (it.kind === 'ai' ? 'a' + NL + it.text : (translating ? 't' : 's') + (it.turn ? '1' : '0') + NL + it.src + NL + it.dst))
  // 本来就停在最底下才跟着往下滚；用户往上翻着看的时候不抢
  const stick = list.scrollHeight - list.scrollTop - list.clientHeight < 24
  let changed = sig.length !== shownSig.length
  for (let i = 0; i < items.length; i++) {
    if (sig[i] === shownSig[i]) continue
    changed = true
    const it = items[i]
    const node = it.kind === 'ai' ? aiNode(it.text) : sayNode(it.src, it.dst, it.turn, translating)
    const old = list.children[i]
    if (old) list.replaceChild(node, old)
    else list.appendChild(node)
  }
  while (list.children.length > items.length) list.lastElementChild!.remove()
  if (!changed) return
  shownSig = sig
  list.hidden = !items.length
  el['cap-empty'].hidden = !!items.length
  if (stick) list.scrollTop = list.scrollHeight
}

/** 诊断读数开着没有（main.ts 据此决定要不要每秒算一遍） */
export const diagShown = () => diagOn
export function setDiag(text: string) { if (el.diag && diagOn) el.diag.textContent = text }

// ── 状态：一句话 ──
// 前面的记号和眼镜顶栏用的是同一套（i18n.ts 的 g.*）：■ 正在听、|| 停着、□ 等着、! 有问题
let statusDetail = ''
export function setStatus(kind: Status, detail = '') {
  status = kind
  statusDetail = detail
  if (kind === 'live') everLive = true
  locked = kind === 'live' || kind === 'connecting' || kind === 'reconnecting' || kind === 'quiet'
  paintStatus()
  syncView()
}
function paintStatus() {
  if (!el.status) return
  const kind = status
  const mark = kind === 'live' ? '■' : kind === 'paused' || kind === 'setup' ? '||' : kind === 'reconnecting' || kind === 'error' ? '!' : '□'
  el.mark.textContent = mark
  el.state.className = `state ${kind === 'live' ? 'live' : kind === 'reconnecting' || kind === 'error' ? 'bad' : 'idle'}`
  el.status.textContent = kind === 'live' ? (statusDetail ? t('status.liveTr', { l: statusDetail }) : t('status.live'))
    : kind === 'paused' ? t(everLive ? 'status.paused' : 'status.ready')
    : kind === 'error' ? (statusDetail || t('status.error'))
    : t('status.' + kind)
  // 停着的时候按钮是「现在要点的那个」（黄色）：还没开过听叫「开始」，开过叫「继续」
  const stopped = kind === 'paused' || kind === 'setup'
  el.pause.textContent = t(stopped ? (everLive ? 'resume' : 'start') : 'pause')
  el.pause.className = stopped ? 'go' : 'stop'
  // 只有真的在听的时候，最后一段才是「正在说的那一句」
  el['cap-list'].classList.toggle('listening', kind === 'live')
}

// ── 状态下面那一行：补充说明 ──
export function setNote(text: string, kind: 'hint' | 'warn' = 'hint') {
  note = { text, kind }
  if (!flashTimer) paintNote()
}
function paintNote() {
  if (!el.note) return
  el.note.textContent = note.text
  el.note.className = note.kind === 'warn' ? 'sub warn' : 'sub'
  el.note.hidden = !note.text
}
/** 临时说一句（已保存、要先暂停……），两秒半后换回平时的内容 */
function flash(text: string) {
  if (!el.note) return
  if (flashTimer) clearTimeout(flashTimer)
  el.note.textContent = text
  el.note.className = 'sub say'
  el.note.hidden = false
  flashTimer = setTimeout(() => { flashTimer = null; paintNote() }, 2500)
}

function injectStyles() {
  if (styled) return
  styled = true
  const style = document.createElement('style')
  style.textContent = `
    :root { color-scheme: dark;
      --bg: #111111; --text: #FFFFFF; --said: #CFCFCB; --dim: #8A8A8A; --rule: rgba(255,255,255,.10);
      --input: rgba(255,255,255,.08); --accent: #FEF991; --on-accent: #232323; --bad: #FF7A6B; }
    html, body { margin: 0; height: 100%; overflow: hidden; overscroll-behavior: none; background: var(--bg); color: var(--text);
      font: 16px/1.45 -apple-system, BlinkMacSystemFont, "Hiragino Sans", "PingFang SC", system-ui, sans-serif;
      letter-spacing: -0.01em; -webkit-text-size-adjust: 100%; }
    #app { display: block; text-align: left; padding: 0; height: auto; }
    [hidden] { display: none !important; }
    button, input, select { font: inherit; letter-spacing: 0; color: inherit; }
    :focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }

    /* 外壳：高度＝键盘上方还剩的高度（fitViewport 写 --vvh）。上面一截固定，下面一截自己滚 */
    .page { height: var(--vvh, 100dvh); display: flex; flex-direction: column; max-width: 640px; margin: 0 auto; }
    .top { flex: none; padding: 20px 20px 16px; border-bottom: 1px solid var(--rule); }
    .head { display: flex; align-items: baseline; justify-content: space-between; gap: 12px; }
    h1 { font-size: 24px; font-weight: 600; letter-spacing: -0.02em; line-height: 1.2; margin: 0; }
    .ver { background: none; border: 0; padding: 6px 0 6px 12px; font-size: 13px; color: var(--dim); }
    .state { margin-top: 6px; display: flex; gap: 9px; align-items: baseline; }
    .mark { flex: none; width: 1.1em; text-align: center; font-weight: 700; }
    .state.live .mark { color: var(--accent); }
    .state.idle { color: var(--dim); }
    .state.bad { color: var(--bad); }
    .sub { margin: 2px 0 0 calc(1.1em + 9px); font-size: 13px; line-height: 1.45; color: var(--dim); letter-spacing: 0; }
    .sub.warn { color: var(--bad); }
    .sub.say { color: var(--text); }
    .diag { margin: 6px 0 0; font: 11px/1.5 ui-monospace, Menlo, Consolas, monospace; color: var(--dim); white-space: pre-wrap; letter-spacing: 0; }
    .acts { display: flex; gap: 10px; margin-top: 16px; }
    .acts button, .sheet-head button, .key-wrap button { height: 48px; padding: 0 16px; border-radius: 12px; font-size: 16px; font-weight: 500; white-space: nowrap; }
    .go { flex: 1; background: var(--accent); color: var(--on-accent); border: 0; font-weight: 600; }
    .stop { flex: 1; background: var(--input); color: var(--text); border: 0; }
    .plain { background: transparent; color: var(--text); border: 1px solid var(--rule); }
    .plain.on { border-color: var(--text); }
    .plain.locked { color: #5A5A5A; border-color: rgba(255,255,255,.06); }

    /* 正在写的 AI 回答：钉在记录上方 */
    .ai-live { flex: none; margin: 14px 20px 0; padding-left: 14px; border-left: 2px solid var(--accent); }
    .who { font-size: 13px; color: var(--dim); letter-spacing: 0; }
    .ai-text { font-size: 18px; line-height: 1.45; white-space: pre-wrap; word-break: break-word;
      max-height: 34vh; overflow-y: auto; -webkit-overflow-scrolling: touch; overscroll-behavior: contain; }

    /* 记录：页面本身就是它，不套卡片。话少的时候靠下放（::before 把它们顶下去），最新的字贴着底 */
    .log { flex: 1; min-height: 0; display: flex; flex-direction: column; }
    .empty { padding: 26px 20px; color: var(--dim); }
    .empty p { margin: 0 0 12px; }
    .empty p:first-child { font-size: 18px; color: var(--said); }
    .cap-list { flex: 1; min-height: 0; overflow-y: auto; -webkit-overflow-scrolling: touch; overscroll-behavior: contain;
      display: flex; flex-direction: column; padding: 18px 20px 0; }
    .cap-list::before { content: ''; flex: 1 0 0; }
    .cap-list::after { content: ''; flex: none; height: calc(6px + env(safe-area-inset-bottom)); }
    .utt { flex: none; margin: 0 0 18px; padding-left: 16px; position: relative; white-space: pre-wrap; word-break: break-word; }
    .utt.turn::before { content: '•'; position: absolute; left: 0; top: 0; color: var(--dim); }
    .u-src { font-size: 14px; line-height: 1.5; color: var(--dim); letter-spacing: 0; }
    .u-dst { font-size: 18px; line-height: 1.45; color: var(--said); }
    .utt.ai { padding-left: 14px; border-left: 2px solid var(--accent); }
    .utt.ai .u-dst { color: var(--text); }
    /* 正在说的那一句：整页最大的字 */
    .cap-list.listening .utt.say:last-child .u-src { font-size: 15px; }
    .cap-list.listening .utt.say:last-child .u-dst { font-size: 24px; line-height: 1.35; font-weight: 500; color: var(--text); letter-spacing: -0.02em; }

    /* 第一次打开 */
    .first { flex: 1; min-height: 0; overflow-y: auto; -webkit-overflow-scrolling: touch; overscroll-behavior: contain; padding: 24px 20px 30vh; }
    .lead { margin: 0 0 20px; font-size: 18px; line-height: 1.5; }
    .first .acts { margin-top: 20px; }

    /* 设置 */
    .sheet { flex: 1; min-height: 0; overflow-y: auto; -webkit-overflow-scrolling: touch; overscroll-behavior: contain; padding-bottom: 30vh; }
    .sheet-head { position: sticky; top: 0; z-index: 1; background: var(--bg); display: flex; align-items: center; gap: 12px;
      padding: 12px 20px; border-bottom: 1px solid var(--rule); }
    .sheet-head h2 { flex: 1; margin: 0; font-size: 18px; font-weight: 600; }
    .sheet-head button { flex: none; height: 40px; padding: 0 20px; }
    .saved { font-size: 13px; color: var(--dim); }
    .group { padding: 18px 20px 6px; border-bottom: 1px solid var(--rule); }
    .group h3 { margin: 0 0 12px; font-size: 13px; font-weight: 400; color: var(--dim); letter-spacing: 0; }
    .line { display: flex; align-items: center; justify-content: space-between; gap: 14px; min-height: 48px; margin-bottom: 12px; }
    .line.off { opacity: .4; }
    .what { flex: 1; min-width: 0; }
    .what small, .hint { display: block; margin: 2px 0 0; font-size: 13px; line-height: 1.45; color: var(--dim); letter-spacing: 0; }
    .field { margin-bottom: 14px; }
    .field > label { display: block; margin-bottom: 6px; }
    .first .field > label { font-size: 13px; color: var(--dim); letter-spacing: 0; }
    .hint { margin-top: 8px; }
    .hint a { color: var(--accent); text-underline-offset: 3px; }
    input[type=text], input[type=password], input[type=number], select { height: 48px; border: 0; border-radius: 12px; background: var(--input);
      padding: 0 14px; font-size: 16px; box-sizing: border-box; }
    .field input[type=text], .field input[type=password] { width: 100%; }
    .line select { flex: none; max-width: 52%; height: 40px; border-radius: 10px; padding: 0 12px; }
    .num { flex: none; width: 84px; height: 40px; border-radius: 10px; text-align: center; }
    .key-wrap { display: flex; gap: 8px; } .key-wrap input { flex: 1; min-width: 0; }
    /* 开关 */
    .sw { flex: none; appearance: none; -webkit-appearance: none; margin: 0; width: 50px; height: 30px; border-radius: 15px;
      background: rgba(255,255,255,.16); position: relative; transition: background .15s; }
    .sw::after { content: ''; position: absolute; top: 3px; left: 3px; width: 24px; height: 24px; border-radius: 50%; background: #D8D8D8; transition: left .15s; }
    .sw:checked { background: var(--accent); }
    .sw:checked::after { left: 23px; background: var(--on-accent); }
    /* 二选一 */
    .seg { flex: none; display: flex; background: var(--input); border-radius: 10px; padding: 3px; }
    .seg label { position: relative; }
    .seg input { position: absolute; opacity: 0; inset: 0; margin: 0; }
    .seg span { display: flex; align-items: center; height: 34px; padding: 0 14px; border-radius: 8px; font-size: 15px; color: var(--dim); }
    .seg input:checked + span { background: #3A3A3A; color: var(--text); }
    .seg input:focus-visible + span { outline: 2px solid var(--accent); outline-offset: 2px; }
    .foot { margin: 18px 20px 0; font-size: 13px; color: var(--dim); letter-spacing: 0; }
    @media (prefers-reduced-motion: reduce) { .sw, .sw::after { transition: none; } }`
  document.head.appendChild(style)
}
