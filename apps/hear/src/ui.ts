// 手机侧界面：一个画面。状态 → 设置（常驻，不折叠 —— 就这一块内容）→ 底部 暂停/清屏。
// **手机上不显示字幕**：不需要记录，字幕只在眼镜上（用户拍板）。
// 文案全部走 i18n.ts 的 t()；换语言时 main.ts 重新调一次 mountUi()。
import type { Settings } from './settings.ts'
import { LANGUAGES, LANG_CODES, parseHints } from './languages.ts'
import { t, LANGS, LANG_NAMES } from './i18n.ts'

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
    <main class="panel">
      <header>
        <div><h1>${t('app.title')}</h1><div class="dim">${t('app.sub')}</div></div>
        <div id="status" class="status status-setup">${t('status.setup')}</div>
      </header>
      <p id="note" class="hint"></p>

      <section class="settings">
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
            <label for="lang">${t('lang')}</label>
            <select id="lang"><option value="auto"${sel('auto', settings.lang)}>${t('lang.auto')}</option>${LANGS.map((l) => `<option value="${l}"${sel(l, settings.lang)}>${LANG_NAMES[l]}</option>`).join('')}</select>
          </div>
        </div>
        <p class="hint">${t('quiet.hint')} ${t('cost.hint')}</p>
        <div class="actions">
          <button id="save" type="button" class="primary">${t('save')}</button>
          <span id="saved" class="saved"></span>
        </div>
      </section>

      <footer>${t('glasses.help')}<br><span class="dim" style="font-size:11px">v${esc(String(__APP_VERSION__))}</span></footer>
    </main>
    <div class="bottom-bar">
      <button id="pause" type="button" class="ghost big">${t('pause')}</button>
      <button id="clear" type="button" class="ghost big">${t('clear')}</button>
    </div>`

  for (const id of ['status', 'note', 'pause']) el[id] = $(id)
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
  const syncShowSrc = () => { showSrc.disabled = target.value === '' }
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
      hints: parseHints($<HTMLInputElement>('hints').value).join(', '),
      mic: $<HTMLSelectElement>('mic').value === 'glasses' ? 'glasses' : 'phone',
      quietMin: Math.max(0, Math.min(60, Number($<HTMLInputElement>('quiet').value) || 0)),
    }
    saved.textContent = t('saved')
    setTimeout(() => { saved.textContent = '' }, 2000)
    h.onSave(next)
  }
  injectStyles()
}

let everLive = false
export function setStatus(kind: Status, detail = '') {
  if (!el.status) return
  el.status.className = `status status-${kind}`
  el.status.textContent = detail ? `${t('status.' + kind)} · ${detail}` : t('status.' + kind)
  if (kind === 'live') everLive = true
  // 暂停态的按钮：还没开过听就叫「开始」，开过叫「继续」
  el.pause.textContent = t(kind === 'paused' || kind === 'setup' ? (everLive ? 'resume' : 'start') : 'pause')
  el.pause.className = kind === 'paused' || kind === 'setup' ? 'primary big' : 'ghost big'
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
    #app { display: block; text-align: left; padding: 0; height: auto; }
    .panel { display: flex; flex-direction: column; gap: 12px; max-width: 640px; margin: 0 auto;
      padding: 20px 20px 90px; box-sizing: border-box; }
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
    .bottom-bar { position: fixed; left: 0; right: 0; bottom: 0; display: flex; gap: 10px;
      padding: 12px 20px calc(12px + env(safe-area-inset-bottom)); background: rgba(35,35,35,.96); border-top: 1px solid #3A3A3A; }
    footer { font-size: 12px; color: #7B7B7B; text-align: center; }`
  document.head.appendChild(style)
}
