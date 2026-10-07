// 手机侧界面：一个画面，分两截。
//   上面固定不动：标题 + 状态、开始／暂停 和 清屏 两个按钮、一行提示、设置（可折叠；正在听的时候自动收起、展不开）
//   下面单独滚动：实时字幕框 → AI 回答框 → 页脚
// 设置展开后比屏幕还长，所以它在固定区里自己滚（.top 限高，details 在里面滚，标题那一行吸顶）。
// 字幕框是后加的（原先手机上不显示字幕）：只是眼镜上那几行的镜像，不存、不导出。
//
// **滚动放在内层容器里，不靠整页滚动。**真机（iOS）上点进输入框弹出键盘之后，整页滚动会卡住拉不动
// （用户实测）—— 键盘弹出时系统会平移整个页面，之后页面自己的滚动位置就乱了。所以 html/body 不滚，
// 外壳的高度跟着「键盘上方还剩多少」（visualViewport）走，里面那一截自己滚。
// 文案全部走 i18n.ts 的 t()；换语言时 main.ts 重新调一次 mountUi()。
import type { Settings } from './settings.ts'
import { LANGUAGES, LANG_CODES, parseHints } from './languages.ts'
import { t, LANGS, LANG_NAMES } from './i18n.ts'
import { AI_MODELS, DEFAULT_AI_MODEL, isAiModel } from './ai.ts'

export type Status = 'live' | 'paused' | 'connecting' | 'reconnecting' | 'quiet' | 'setup' | 'error'

export type UiHandlers = {
  onSave: (s: Settings) => void
  onPause: () => void
  onClear: () => void
}

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!))
const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T
const el: Record<string, HTMLElement> = {}

export function mountUi(settings: Settings, h: UiHandlers) {
  const app = document.getElementById('app')!
  const sel = (v: string, cur: string) => (v === cur ? ' selected' : '')
  const keyLink = '<a href="https://console.soniox.com" target="_blank" rel="noreferrer">console.soniox.com</a>'
  document.title = t('app.title')

  app.innerHTML = `
    <div class="page">
    <div class="top">
      <header>
        <div><h1>${t('app.title')}</h1><div class="dim">${t('app.sub')}</div></div>
        <div id="status" class="status status-setup">${t('status.setup')}</div>
      </header>
      <div class="bar">
        <button id="pause" type="button" class="ghost big">${t('pause')}</button>
        <button id="clear" type="button" class="ghost big">${t('clear')}</button>
      </div>
      <p id="note" class="hint"></p>
      <details id="settings" class="settings"${settings.apiKey ? '' : ' open'}>
        <summary><span>${t('settings')}</span><span id="lock-tip" class="dim"></span></summary>
        <div class="field">
          <label for="apiKey">Soniox API Key</label>
          <div class="key-wrap">
            <input id="apiKey" type="password" autocomplete="off" autocapitalize="off" spellcheck="false"
              placeholder="${t('apiKey.placeholder')}" value="${esc(settings.apiKey)}" />
            <button id="revealKey" type="button" class="ghost">${t('show')}</button>
          </div>
          <p class="hint">${t('apiKey.hint', { link: keyLink })}</p>
        </div>
        <div class="row">
          <div class="field">
            <label for="target">${t('translate')}</label>
            <select id="target"><option value=""${sel('', settings.translate ? settings.target : '')}>${t('translate.off')}</option>${LANGUAGES.map((l) => `<option value="${l.code}"${sel(l.code, settings.translate ? settings.target : '')}>${esc(l.name)} (${l.code})</option>`).join('')}</select>
          </div>
          <div class="field">
            <label for="mic">${t('mic')}</label>
            <select id="mic">
              <option value="glasses"${sel('glasses', settings.mic)}>${t('mic.glasses')}</option>
              <option value="phone"${sel('phone', settings.mic)}>${t('mic.phone')}</option>
            </select>
          </div>
        </div>
        <div class="field">
          <label for="showSrc">${t('showSrc')}</label>
          <select id="showSrc">
            <option value="on"${sel('on', settings.showSource ? 'on' : 'off')}>${t('showSrc.on')}</option>
            <option value="off"${sel('off', settings.showSource ? 'on' : 'off')}>${t('showSrc.off')}</option>
          </select>
          <p class="hint">${t('translate.hint')}</p>
        </div>
        <div class="field">
          <label for="tgtSpeech">${t('tgtSpeech')}</label>
          <select id="tgtSpeech">
            <option value="on"${sel('on', settings.showTargetSpeech ? 'on' : 'off')}>${t('tgtSpeech.on')}</option>
            <option value="off"${sel('off', settings.showTargetSpeech ? 'on' : 'off')}>${t('tgtSpeech.off')}</option>
          </select>
          <p class="hint">${t('tgtSpeech.hint')}</p>
        </div>
        <div class="field">
          <label for="endpoint">${t('endpoint')}</label>
          <select id="endpoint">
            <option value="on"${sel('on', settings.endpoint ? 'on' : 'off')}>${t('endpoint.on')}</option>
            <option value="off"${sel('off', settings.endpoint ? 'on' : 'off')}>${t('endpoint.off')}</option>
          </select>
          <p class="hint">${t('endpoint.hint')}</p>
        </div>
        <div class="field">
          <label for="hints">${t('hints')}</label>
          <input id="hints" type="text" autocapitalize="off" spellcheck="false" placeholder="ja, zh" value="${esc(settings.hints)}" />
          <p class="hint">${t('hints.hint')}</p>
        </div>
        <div class="row">
          <div class="field">
            <label for="quiet">${t('quiet')}</label>
            <input id="quiet" type="number" min="0" max="60" step="1" value="${settings.quietMin}" />
          </div>
          <div class="field">
            <label for="clearSec">${t('clearSec')}</label>
            <input id="clearSec" type="number" min="0" max="600" step="1" value="${settings.clearSec}" />
          </div>
        </div>
        <p class="hint">${t('quiet.hint')} ${t('cost.hint')}</p>
        <p class="hint" style="margin-top:6px">${t('clearSec.hint')}</p>
        <div class="field" style="margin-top:14px">
          <label for="lang">${t('lang')}</label>
          <select id="lang"><option value="auto"${sel('auto', settings.lang)}>${t('lang.auto')}</option>${LANGS.map((l) => `<option value="${l}"${sel(l, settings.lang)}>${LANG_NAMES[l]}</option>`).join('')}</select>
        </div>
        <div class="group-title">${t('ai.title')}</div>
        <div class="row">
          <div class="field">
            <label for="claudeKey">${t('ai.key')}</label>
            <input id="claudeKey" type="password" autocomplete="off" autocapitalize="off" spellcheck="false" value="${esc(settings.claudeKey)}" />
          </div>
          <div class="field">
            <label for="claudeModel">${t('ai.model')}</label>
            <select id="claudeModel">${AI_MODELS.map((m) => `<option value="${m.id}"${sel(m.id, settings.claudeModel)}>${m.name}</option>`).join('')}</select>
          </div>
        </div>
        <p class="hint" style="margin-bottom:14px">${t('ai.hint')}</p>
        <div class="actions">
          <button id="save" type="button" class="primary">${t('save')}</button>
          <span id="saved" class="saved"></span>
        </div>
      </details>
    </div>
    <main id="scroll" class="scroll">
      <section class="caps">
        <div class="caps-label">${t('caps')}</div>
        <div id="cap-src" class="cap cap-src" hidden></div>
        <div id="cap-dst" class="cap cap-dst" hidden></div>
        <div id="cap-empty" class="dim">${t('caps.empty')}</div>
      </section>
      <section id="ai-box" class="caps ai" hidden>
        <div class="caps-label">${t('ai.box')} <span id="ai-info"></span></div>
        <div id="ai-text" class="cap cap-dst"></div>
      </section>

      <footer>${t('glasses.help')}<br><span id="ver" class="dim" style="font-size:11px">v${esc(String(__APP_VERSION__))}</span><div id="diag" class="diag"${diagOn ? '' : ' hidden'}></div></footer>
    </main>
    </div>`

  for (const id of ['status', 'note', 'pause', 'diag', 'settings', 'lock-tip', 'cap-src', 'cap-dst', 'cap-empty', 'ai-box', 'ai-info', 'ai-text']) el[id] = $(id)
  // 正在听的时候设置展不开：点标题那一下拦掉（见 setStatus 里的 lockSettings）
  el.settings.querySelector('summary')!.addEventListener('click', (e) => { if (locked) e.preventDefault() })
  lockSettings(locked)
  capSig = ''
  // 点版本号：开关诊断读数（排查「用久了延迟变高」用，平时不显示）。读数出在版本号下面。
  // 一度挪到页面顶上、改成点状态标签（以为真机上页底够不着），用户确认 0.1.3 这样看得到，要求保留
  $('ver').onclick = () => { diagOn = !diagOn; el.diag.hidden = !diagOn; el.diag.textContent = '' }
  $<HTMLButtonElement>('pause').onclick = () => h.onPause()
  $<HTMLButtonElement>('clear').onclick = () => h.onClear()

  const apiKey = $<HTMLInputElement>('apiKey')
  const reveal = $<HTMLButtonElement>('revealKey')
  reveal.onclick = () => {
    const show = apiKey.type === 'password'
    apiKey.type = show ? 'text' : 'password'
    reveal.textContent = t(show ? 'hide' : 'show')
  }
  // 不翻译时这个选项不起作用，灰掉免得以为它管用
  const target = $<HTMLSelectElement>('target')
  const showSrc = $<HTMLSelectElement>('showSrc')
  const tgtSpeech = $<HTMLSelectElement>('tgtSpeech')
  const syncShowSrc = () => { showSrc.disabled = tgtSpeech.disabled = target.value === '' }
  target.onchange = syncShowSrc
  syncShowSrc()
  const saved = $('saved')
  $<HTMLButtonElement>('save').onclick = () => {
    const tv = $<HTMLSelectElement>('target').value
    const next: Settings = {
      lang: $<HTMLSelectElement>('lang').value,
      apiKey: apiKey.value.trim(),
      // 下拉选了语言＝开翻译；选「关」只关开关，目标语言留着给眼镜长按用
      translate: tv !== '' && LANG_CODES.has(tv),
      target: tv !== '' && LANG_CODES.has(tv) ? tv : settings.target,
      showSource: showSrc.value !== 'off',
      showTargetSpeech: tgtSpeech.value !== 'off',
      endpoint: $<HTMLSelectElement>('endpoint').value !== 'off',
      hints: parseHints($<HTMLInputElement>('hints').value).join(', '),
      mic: $<HTMLSelectElement>('mic').value === 'glasses' ? 'glasses' : 'phone',
      quietMin: Math.max(0, Math.min(60, Number($<HTMLInputElement>('quiet').value) || 0)),
      clearSec: Math.max(0, Math.min(600, Math.round(Number($<HTMLInputElement>('clearSec').value) || 0))),
      claudeKey: $<HTMLInputElement>('claudeKey').value.trim(),
      claudeModel: (() => { const v = $<HTMLSelectElement>('claudeModel').value; return isAiModel(v) ? v : DEFAULT_AI_MODEL })(),
    }
    saved.textContent = t('saved')
    setTimeout(() => { saved.textContent = '' }, 2000)
    h.onSave(next)
  }
  injectStyles()
  fitViewport()
}

// ── 外壳高度跟着键盘走 ──
let fitted = false
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
    setTimeout(() => target.scrollIntoView({ block: 'center', behavior: 'smooth' }), 350)
  })
}

// ── 设置的锁 ──
let locked = false
/** 正在听（含连接中、重连中、安静断开）时：设置收起来，并且展不开。改设置要先暂停 */
function lockSettings(on: boolean) {
  locked = on
  const d = el.settings as HTMLDetailsElement | undefined
  if (!d) return
  if (on) d.open = false
  d.classList.toggle('locked', on)
  el['lock-tip'].textContent = on ? t('settings.locked') : ''
}

// ── 实时字幕框 ──
// 手机上的记录这次打开期间不清，会越来越长（上万字）。每秒更新好几次，不能整段重写 ——
// 整段重画在 iPhone 上会闪（根 CLAUDE.md，meeting-notes 踩过）。所以一行一个节点，只动变了的那几行：
// 前面没变的行原样留着，从第一处不同的行开始换掉。平时变的只有最后一两行。
const NL = String.fromCharCode(10)
const shown = new WeakMap<HTMLElement, string[]>()
function putLines(box: HTMLElement, text: string) {
  const next = text ? text.split(NL) : []
  const prev = shown.get(box) ?? []
  let i = 0
  while (i < next.length && i < prev.length && next[i] === prev[i]) i++
  while (box.children.length > i) box.lastElementChild!.remove()
  for (let k = i; k < next.length; k++) {
    const row = document.createElement('div')
    row.textContent = next[k]
    // AI 的回答（captions.note 插进来的）：首行以【AI】开头，续行以全角空格开头
    if (next[k].startsWith('【AI】') || next[k].startsWith('　')) row.className = 'ai-line'
    box.appendChild(row)
  }
  shown.set(box, next)
}
/** 手机上的 AI 回答框。text 为 null＝收起。info：状态或耗时，接在标题后面 */
export function setAi(text: string | null, info = '') {
  if (!el['ai-box']) return
  el['ai-box'].hidden = text === null
  if (text === null) return
  if (el['ai-text'].textContent !== text) el['ai-text'].textContent = text
  el['ai-info'].textContent = info
}

let capSig = ''
/**
 * 把眼镜上的字幕镜像到手机上。translating：开着翻译 —— 这时上面是原话（暗）、下面是译文（亮）；
 * 不翻译时只有原话一块。和眼镜不同的是这里总是两块都给（「眼镜上显示原话」那个开关只管眼镜）
 */
export function setCaptions(src: string, dst: string, translating: boolean) {
  if (!el['cap-dst']) return
  const a = translating ? src : ''
  const b = translating ? dst : src
  const sig = a + String.fromCharCode(0) + b
  if (sig === capSig) return
  capSig = sig
  const put = (box: HTMLElement, text: string) => {
    // 本来就停在最底下才跟着往下滚；用户往上翻着看的时候不抢
    const stick = box.scrollHeight - box.scrollTop - box.clientHeight < 24
    box.hidden = !text
    putLines(box, text)
    if (stick) box.scrollTop = box.scrollHeight
  }
  put(el['cap-src'], a)
  put(el['cap-dst'], b)
  el['cap-empty'].hidden = !!(a || b)
}

// 开发期 ?diag=1 直接打开（模拟器里点不到手机页）。生产里恒为 false
let diagOn = import.meta.env.DEV && new URLSearchParams(location.search).has('diag')
/** 诊断读数开着没有（main.ts 据此决定要不要每秒算一遍） */
export const diagShown = () => diagOn
export function setDiag(text: string) { if (el.diag && diagOn) el.diag.textContent = text }

let everLive = false
export function setStatus(kind: Status, detail = '') {
  if (!el.status) return
  el.status.className = `status status-${kind}`
  el.status.textContent = detail ? `${t('status.' + kind)} · ${detail}` : t('status.' + kind)
  if (kind === 'live') everLive = true
  // 暂停态的按钮：还没开过听就叫「开始」，开过叫「继续」
  el.pause.textContent = t(kind === 'paused' || kind === 'setup' ? (everLive ? 'resume' : 'start') : 'pause')
  el.pause.className = kind === 'paused' || kind === 'setup' ? 'primary big' : 'ghost big'
  lockSettings(kind === 'live' || kind === 'connecting' || kind === 'reconnecting' || kind === 'quiet')
}

export function setNote(text: string, kind: 'hint' | 'warn' = 'hint') {
  if (!el.note) return
  el.note.textContent = text
  el.note.className = kind === 'warn' ? 'hint warn' : 'hint'
}


let styled = false
function injectStyles() {
  if (styled) return
  styled = true
  const style = document.createElement('style')
  style.textContent = `
    :root { color-scheme: dark; }
    html, body { margin: 0; background: #232323; color: #E5E5E5;
      font: 16px/1.4 -apple-system, BlinkMacSystemFont, system-ui, sans-serif; -webkit-text-size-adjust: 100%; }
    html, body { height: 100%; overflow: hidden; overscroll-behavior: none; }
    #app { display: block; text-align: left; padding: 0; height: auto; }
    /* 外壳：高度＝键盘上方还剩的高度（fitViewport 写 --vvh）。上面一截固定，下面一截自己滚 */
    .page { height: var(--vvh, 100dvh); display: flex; flex-direction: column; max-width: 640px; margin: 0 auto; }
    .top { flex: none; display: flex; flex-direction: column; gap: 10px; padding: 16px 20px 12px;
      background: #232323; border-bottom: 1px solid #3A3A3A; box-sizing: border-box;
      max-height: calc(var(--vvh, 100dvh) * 0.86); }
    .top > * { flex: none; }
    /* 设置展开时是固定区里唯一能缩的一块：超出就在自己里面滚，下面的字幕框至少还露出一截 */
    .top > details { flex: 0 1 auto; min-height: 0; overflow-y: auto; -webkit-overflow-scrolling: touch; overscroll-behavior: contain; }
    .top > details[open] > summary { position: sticky; top: -14px; z-index: 1; background: #2A2A2A; margin: -14px -16px 14px; padding: 14px 16px; }
    .bar { display: flex; gap: 10px; }
    .scroll { flex: 1; min-height: 0; overflow-y: auto; -webkit-overflow-scrolling: touch; overscroll-behavior: contain;
      display: flex; flex-direction: column; gap: 12px; box-sizing: border-box;
      padding: 14px 20px calc(48px + env(safe-area-inset-bottom)); }
    .scroll > * { flex: none; }
    .caps { background: #2A2A2A; border: 1px solid #3A3A3A; border-radius: 14px; padding: 12px 16px; }
    .caps-label { font-size: 12px; color: #A7A7A7; margin-bottom: 8px; }
    .caps.ai { border-color: rgba(254,249,145,.45); }
    .ai-line { color: #FEF991; }
    .group-title { font-size: 12px; color: #A7A7A7; margin: 18px 0 10px; padding-top: 14px; border-top: 1px solid #3A3A3A; }
    .cap { white-space: pre-wrap; word-break: break-word; overflow-y: auto; -webkit-overflow-scrolling: touch;
      overscroll-behavior: contain; line-height: 1.5; }
    .cap-src { max-height: 22vh; font-size: 14px; color: #8A8A8A; margin-bottom: 10px; }
    .cap-dst { max-height: 34vh; font-size: 17px; color: #E5E5E5; }
    summary { display: flex; align-items: center; justify-content: space-between; gap: 10px; cursor: pointer;
      font-size: 15px; font-weight: 600; list-style: none; }
    summary::-webkit-details-marker { display: none; }
    summary > span:first-child::before { content: '▸'; display: inline-block; margin-right: 8px; color: #7B7B7B; }
    details[open] > summary > span:first-child::before { content: '▾'; }
    details[open] > summary { margin-bottom: 14px; }
    details.locked > summary { cursor: default; opacity: .55; }
    header { display: flex; align-items: center; justify-content: space-between; gap: 12px; }
    header > div:first-child { min-width: 0; }
    h1 { font-size: 18px; font-weight: 600; margin: 0; }
    .status { font-size: 12px; padding: 4px 10px; border-radius: 999px; white-space: nowrap; border: 1px solid transparent; }
    .status::before { content: '●'; margin-right: 5px; font-size: 9px; vertical-align: 1px; }
    .status-live  { color: #3CFA44; border-color: #3CFA44; background: rgba(60,250,68,.08); }
    .status-paused, .status-quiet { color: #FEB340; border-color: #FEB340; background: rgba(254,179,64,.1); }
    .status-connecting, .status-reconnecting { color: #A7A7A7; border-color: #3E3E3E; }
    .status-setup { color: #FEF991; border-color: #FEF991; background: rgba(254,249,145,.08); }
    .status-error { color: #FF453A; border-color: #FF453A; background: rgba(255,69,58,.08); }
    .settings { background: #2A2A2A; border: 1px solid #3A3A3A; border-radius: 14px; padding: 14px 16px; }
    .field { display: flex; flex-direction: column; gap: 6px; margin-bottom: 14px; }
    .field label { font-size: 12px; color: #A7A7A7; }
    input[type=text], input[type=password], input[type=number], select { background: rgba(255,255,255,.06); color: #E5E5E5;
      border: 1px solid #3E3E3E; border-radius: 9px; padding: 11px 12px; font-size: 16px; width: 100%; box-sizing: border-box; font-family: inherit; }
    .key-wrap { display: flex; gap: 8px; } .key-wrap input { flex: 1; }
    .row { display: flex; gap: 12px; flex-wrap: wrap; align-items: flex-end; margin-bottom: 14px; }
    .row .field { flex: 1 1 140px; min-width: 0; margin-bottom: 0; }
    .hint { margin: 0; font-size: 12px; color: #7B7B7B; } .hint a { color: #FEF991; } .hint.warn { color: #FEB340; }
    .dim { color: #7B7B7B; font-size: 13px; }
    .actions { display: flex; align-items: center; gap: 12px; margin: 6px 0 4px; }
    .primary { background: #FEF991; color: #232323; border: 0; border-radius: 9px; padding: 11px 20px; font-size: 15px; font-weight: 600; }
    .ghost { background: transparent; color: #A7A7A7; border: 1px solid #3E3E3E; border-radius: 8px; padding: 8px 12px; font-size: 13px; white-space: nowrap; }
    .ghost.big { padding: 11px 18px; font-size: 15px; }
    .saved { font-size: 13px; color: #3CFA44; }
    footer { font-size: 12px; color: #7B7B7B; text-align: center; }
    .diag { margin-top: 6px; font: 11px/1.5 ui-monospace, Menlo, Consolas, monospace; color: #A7A7A7; white-space: pre-wrap; }`
  document.head.appendChild(style)
}
