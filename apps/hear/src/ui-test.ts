// 手机页面的样子，不等 bridge 直接在浏览器里看（开发用，不进产物：vite 只打包 index.html）。
//   /ui-test.html?view=first|live|plain|paused|settings|error|ai&lang=zh|ja|en
// 做法照 meeting-notes 的 ui-test.html。
import { mountUi, setStatus, setNote, setCaptions, setAi } from './ui.ts'
import { initialDefaults, type Settings } from './settings.ts'
import { setLang, resolveLang, t } from './i18n.ts'
import type { Item } from './captions.ts'

const q = new URLSearchParams(location.search)
const view = q.get('view') ?? 'live'
setLang(resolveLang(q.get('lang') ?? 'zh'))
const settings: Settings = { ...initialDefaults(), apiKey: view === 'first' ? '' : 'demo-key', translate: view !== 'plain', target: 'zh', hints: 'ja, zh' }
mountUi(settings, { onSave: (s) => console.log('save', s), onPause: () => console.log('pause'), onClear: () => console.log('clear') })

const talk: Item[] = [
  { kind: 'say', src: 'おはようございます。', dst: '早上好。', turn: false },
  { kind: 'say', src: 'お疲れさまです。来週の打ち合わせ、火曜の十時からに変更になりました。', dst: '辛苦了。下周的会议改到周二上午十点开始了。', turn: true },
  { kind: 'say', src: '了解です。場所は同じ会議室ですか。', dst: '明白。地点还是同一个会议室吗？', turn: true },
  { kind: 'say', src: 'いえ、三階の小さいほうの部屋に', dst: '不，是三楼那间小一点的', turn: true },
]
const plain = talk.map((it) => (it.kind === 'say' ? { ...it, dst: '' } : it))

if (view === 'first') { setStatus('setup'); setNote(t('note.noKey')) }
else if (view === 'live') { setStatus('live', '中文'); setCaptions(talk, true) }
else if (view === 'plain') { setStatus('live'); setCaptions(plain, false) }
else if (view === 'paused') { setStatus('live', '中文'); setStatus('paused'); setCaptions(talk, true) }
else if (view === 'empty') { setStatus('paused'); setNote(t('note.pressStart')) }
else if (view === 'settings') { setStatus('live', '中文'); setStatus('paused'); setCaptions(talk, true); document.getElementById('open')!.click() }
else if (view === 'error') {
  setStatus('error', t('sx.connectFail', { e: 'timeout' })); setNote(t('note.captionsStopped', { d: t('sx.network') }), 'warn')
  setCaptions([...talk.slice(1, 3), { kind: 'ai', text: '会议改到下周二上午十点，地点是三楼的小会议室。' }], true)
} else if (view === 'ai') { setStatus('live', '中文'); setCaptions(talk, true); setAi('会议改到下周二上午十点，地点是', 'AI 回答中') }
if (q.get('scroll')) setTimeout(() => { document.getElementById('sheet')!.scrollTop = Number(q.get('scroll')) }, 50)
