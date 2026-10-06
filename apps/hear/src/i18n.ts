// 多语言：界面 + 眼镜文案。三语一张表，照 meeting-notes 的 i18n.ts。
// ja 栏容易混进假日语，test/fake-japanese.mjs 机器查，`npm test` 跑。
// 眼镜上的字只用汉字 / ASCII / 验过的符号（■ □ | !）。

export type Lang = 'zh' | 'ja' | 'en'
export const LANGS: Lang[] = ['zh', 'ja', 'en']
export const LANG_NAMES: Record<Lang, string> = { zh: '中文', ja: '日本語', en: 'English' }

type Row = Record<Lang, string>

const D: Record<string, Row> = {
  'app.title': { zh: 'Hear · 听见', ja: 'Hear · きこえる', en: 'Hear' },
  'app.sub': { zh: '把周围的话变成眼镜上的字幕', ja: '周りの話し声をグラスの字幕に', en: 'What people say, as captions on your glasses' },
  'save': { zh: '保存', ja: '保存', en: 'Save' },
  'saved': { zh: '已保存', ja: '保存しました', en: 'Saved' },
  'show': { zh: '显示', ja: '表示', en: 'Show' },
  'hide': { zh: '隐藏', ja: '隠す', en: 'Hide' },

  // 状态
  'status.live': { zh: '字幕中', ja: '字幕表示中', en: 'Listening' },
  'status.paused': { zh: '已暂停', ja: '一時停止', en: 'Paused' },
  'status.connecting': { zh: '连接中', ja: '接続中', en: 'Connecting' },
  'status.reconnecting': { zh: '重连中', ja: '再接続中', en: 'Reconnecting' },
  'status.quiet': { zh: '安静，已断开（有声音自动连）', ja: '静か、切断中（声で自動再接続）', en: 'Quiet, disconnected (reconnects on voice)' },
  'status.setup': { zh: '没有 Key', ja: 'Key 未設定', en: 'No key' },
  'status.error': { zh: '错误', ja: 'エラー', en: 'Error' },

  // 设置
  'settings': { zh: '设置', ja: '設定', en: 'Settings' },
  'lang': { zh: '界面语言', ja: '表示言語', en: 'Language' },
  'lang.auto': { zh: '跟随手机', ja: 'スマホに合わせる', en: 'Same as phone' },
  'apiKey.placeholder': { zh: '粘贴你的 Soniox Key', ja: 'Soniox の Key を貼り付け', en: 'Paste your Soniox key' },
  'apiKey.hint': {
    zh: '字幕由 Soniox 识别，需要你自己的 Key，按连接时长计费，算在你自己账上。申请步骤：打开 {link} → 注册 → 左侧 API Keys → Create → 复制粘贴到这里。Key 只存在这台手机上。',
    ja: '字幕は Soniox が認識します。自分の Key が必要で、接続時間に応じて自分のアカウントに課金されます。手順：{link} を開く → 登録 → 左の API Keys → Create → ここに貼り付け。Key はこのスマホにだけ保存されます。',
    en: 'Captions are produced by Soniox and need your own key; it is billed to your account by connection time. Steps: open {link} → sign up → API Keys on the left → Create → paste it here. The key is stored only on this phone.',
  },
  'translate': { zh: '翻译成', ja: '翻訳先', en: 'Translate to' },
  'translate.off': { zh: '关（只显示原话）', ja: 'オフ（原文のみ）', en: 'Off (original only)' },
  'translate.hint': { zh: '不翻译时眼镜上是 9 行原话。开了翻译，可以选要不要同时显示原话。', ja: '翻訳オフのときはグラスに原文を 9 行表示します。翻訳オンのときは、原文も一緒に表示するかを選べます。', en: 'With translation off the glasses show 9 lines of the original. With it on, choose whether the original is shown as well.' },
  'showSrc': { zh: '翻译时眼镜上显示原话', ja: '翻訳中もグラスに原文を表示', en: 'Show original on glasses while translating' },
  'showSrc.on': { zh: '显示（原话 3 行 + 译文 6 行）', ja: '表示する（原文 3 行 + 訳文 6 行）', en: 'Show (3 lines original + 6 translation)' },
  'showSrc.off': { zh: '不显示（9 行都是译文）', ja: '表示しない（9 行すべて訳文）', en: 'Hide (all 9 lines translation)' },
  'tgtSpeech': { zh: '别人直接说目标语言时', ja: '相手が翻訳先の言語で話したとき', en: 'Speech already in the target language' },
  'tgtSpeech.on': { zh: '照常显示', ja: '表示する', en: 'Show' },
  'tgtSpeech.off': { zh: '不显示（本来就听得懂）', ja: '表示しない（そのまま分かるので）', en: 'Hide (I understand it anyway)' },
  'tgtSpeech.hint': {
    zh: '例如把日语翻成中文时，别人说的中文可以不显示。语言由 Soniox 判断，偶尔会判错。',
    ja: '例：日本語を中国語に翻訳しているとき、中国語の発言は表示を省けます。言語の判定は Soniox によるもので、まれに誤ることがあります。',
    en: 'For example, when translating Japanese into Chinese, speech that is already Chinese can be left out. The language is detected by Soniox and is occasionally wrong.',
  },
  'hints': { zh: '周围会说的语言（语言码，逗号分隔）', ja: '周りで話される言語（言語コード、カンマ区切り）', en: 'Languages spoken around you (codes, comma-separated)' },
  'hints.hint': { zh: '只是提示，不是限定。只写一种会把别的语言往它上面硬靠，所以常听到的都写上。代码见翻译下拉框。', ja: 'ヒントであって制限ではありません。一つだけ書くと他の言語が引き寄せられるので、よく聞く言語は全部書いてください。コードは翻訳の一覧を参照。', en: 'Hints only, not a restriction. Listing a single language pulls others toward it, so list every language you hear often. Codes are in the translation dropdown.' },
  'mic': { zh: '麦克风', ja: 'マイク', en: 'Microphone' },
  'mic.glasses': { zh: '眼镜', ja: 'グラス', en: 'Glasses' },
  'mic.phone': { zh: '手机', ja: 'スマホ', en: 'Phone' },
  'quiet': { zh: '安静多久后断开（分钟）', ja: '静かな状態が何分続いたら切断', en: 'Quiet timeout (min)' },
  'quiet.hint': { zh: 'Soniox 按连接时长计费。没人说话时断开，一有声音立刻重连（头一两个字可能来不及）。', ja: 'Soniox は接続時間で課金されます。声がない間は切断し、声がすればすぐ再接続（最初の一言は間に合わないことがあります）。', en: 'Soniox bills by connection time. Disconnects while nobody is talking and reconnects as soon as there is voice (the first word or two may be missed).' },
  'cost.hint': { zh: 'Soniox 实时识别每小时 0.12 美元（2026-10 官网定价），翻译不另收费；眼镜持续传字幕也更耗电。', ja: 'Soniox のリアルタイム認識は 1 時間 0.12 ドル（2026-10 の公式料金）、翻訳は追加料金なし。グラスへ字幕を送り続けるので電池も減ります。', en: 'Soniox real-time costs $0.12 per hour (pricing as of 2026-10), translation included; streaming captions also drains the glasses faster.' },

  // 手机主画面
  'pause': { zh: '暂停', ja: '一時停止', en: 'Pause' },
  'resume': { zh: '继续', ja: '再開', en: 'Resume' },
  'start': { zh: '开始', ja: '開始', en: 'Start' },
  'note.pressStart': { zh: '按「开始」才会连接 Soniox（按连接时长计费）。眼镜上长按也行。', ja: '「開始」を押すと Soniox に接続します（接続時間で課金）。グラスの長押しでも可。', en: 'Press Start to connect to Soniox (billed by connection time). A long-press on the glasses works too.' },
  'clear': { zh: '清屏', ja: 'クリア', en: 'Clear' },
  'glasses.help': { zh: '眼镜：长按 暂停／继续 · 菜单 清屏 · 双击 退出', ja: 'グラス：長押し 一時停止／再開 · メニュー 画面をクリア · ダブルタップ 終了', en: 'Glasses: long-press = pause/resume · menu = clear · double-tap = exit' },
  'note.noKey': { zh: '还没有 Soniox Key，先在设置里填一下。', ja: 'Soniox の Key がまだありません。設定で入力してください。', en: 'No Soniox key yet. Enter one in Settings.' },
  'note.captionsStopped': { zh: '字幕已停：{d}', ja: '字幕停止：{d}', en: 'Captions stopped: {d}' },
  'note.micFail': { zh: '麦克风打不开（{m}）', ja: 'マイクを開けません（{m}）', en: 'Cannot open microphone ({m})' },
  'note.settingsNotSaved': { zh: '设置没存上', ja: '設定を保存できません', en: 'settings not saved' },

  // Soniox 连接
  'sx.badKey': { zh: 'Key 无效', ja: 'Key が無効', en: 'invalid key' },
  'sx.noPermission': { zh: 'Key 没有实时转写权限', ja: 'Key にリアルタイム文字起こしの権限がない', en: 'key lacks real-time permission' },
  'sx.budget': { zh: 'Soniox 余额/预算用完', ja: 'Soniox の残高/予算切れ', en: 'Soniox balance/budget exhausted' },
  'sx.invalid': { zh: '配置被拒（invalid_request）', ja: '設定が拒否された（invalid_request）', en: 'config rejected (invalid_request)' },
  'sx.maxDuration': { zh: '到 300 分钟上限，换段', ja: '300 分の上限、セッション切替', en: '300-minute limit, new session' },
  'sx.tempKey': { zh: '临时 Key 过期', ja: '一時 Key の期限切れ', en: 'temporary key expired' },
  'sx.limit': { zh: '并发/配额受限，稍后重试', ja: '同時接続/割当の制限、後で再試行', en: 'rate/quota limited, retrying' },
  'sx.other': { zh: '{e} 错误，重连中', ja: '{e} エラー、再接続中', en: '{e} error, reconnecting' },
  'sx.network': { zh: '网络', ja: 'ネットワーク', en: 'network' },
  'sx.connectFail': { zh: '连不上：{e}', ja: '接続できません：{e}', en: 'cannot connect: {e}' },
  'sx.closed': { zh: '连接断开（{c}）', ja: '接続が切れた（{c}）', en: 'disconnected ({c})' },

  // 眼镜（只用汉字 / ASCII / ■ □ | !）
  'g.live': { zh: '■ 正在听', ja: '■ 聞いています', en: '■ Listening' },
  'g.paused': { zh: '|| 已暂停  长按继续', ja: '|| 一時停止  長押しで再開', en: '|| Paused  long-press to resume' },
  'g.start': { zh: '□ 长按开始', ja: '□ 長押しで開始', en: '□ Long-press to start' },
  'g.connecting': { zh: '□ 连接中', ja: '□ 接続中', en: '□ Connecting' },
  'g.quiet': { zh: '□ 安静  有声音自动连', ja: '□ 静か  声で再接続', en: '□ Quiet  reconnects on voice' },
  'g.reconnecting': { zh: '! 重连中', ja: '! 再接続中', en: '! Reconnecting' },
  'g.noKey': { zh: '! 没有 Key  请在手机上设置', ja: '! Key 未設定  スマホで設定', en: '! No key  set it on the phone' },
  'g.translate.on': { zh: '翻译»{l}', ja: '翻訳»{l}', en: '»{l}' },
  'menu.clear': { zh: '清屏', ja: '画面をクリア', en: 'Clear' },
  'g.demoRestart': { zh: '! 演示从头再来', ja: '! デモを最初から', en: '! Demo restarting' },
}

let current: Lang = 'zh'
export function getLang(): Lang { return current }
export function setLang(l: Lang): void {
  current = l
  if (typeof document !== 'undefined') document.documentElement.lang = l
}
export function detectLang(): Lang {
  const l = (typeof navigator !== 'undefined' && (navigator.languages?.[0] ?? navigator.language) || '').toLowerCase()
  if (l.startsWith('ja')) return 'ja'
  if (l.startsWith('zh')) return 'zh'
  return 'en'
}
export function resolveLang(setting: string | undefined): Lang {
  return setting === 'zh' || setting === 'ja' || setting === 'en' ? setting : detectLang()
}
export function t(key: string, vars?: Record<string, string | number>): string {
  const row = D[key]
  let s = row ? row[current] : key
  if (vars) for (const [k, v] of Object.entries(vars)) s = s.split(`{${k}}`).join(String(v))
  return s
}
