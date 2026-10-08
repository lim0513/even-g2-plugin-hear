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
  'settings.locked': { zh: '暂停后才能修改', ja: '一時停止すると変更できます', en: 'pause to change' },
  'caps': { zh: '实时字幕', ja: 'リアルタイム字幕', en: 'Live captions' },
  'caps.empty': { zh: '开始后，眼镜上的字幕也会显示在这里。', ja: '開始すると、グラスの字幕がここにも表示されます。', en: 'Once started, the captions on the glasses also appear here.' },
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
    zh: '例如把日语翻成中文时，别人说的中文可以不在眼镜上显示；手机上的字幕照常保留。语言由 Soniox 判断，偶尔会判错。',
    ja: '例：日本語を中国語に翻訳しているとき、中国語の発言はグラスへの表示を省けます。スマホの字幕にはそのまま残ります。言語の判定は Soniox によるもので、まれに誤ることがあります。',
    en: 'For example, when translating Japanese into Chinese, speech that is already Chinese can be left off the glasses; it still appears in the captions on the phone. The language is detected by Soniox and is occasionally wrong.',
  },
  'endpoint': { zh: '一句话什么时候定稿', ja: '発言を確定するタイミング', en: 'When a sentence is finalised' },
  'endpoint.on': { zh: '快：一停下就定稿', ja: '速い：止まったらすぐ確定', en: 'Fast: as soon as the speaker stops' },
  'endpoint.off': { zh: '准：多等一会儿再定稿（默认）', ja: '正確：少し待ってから確定（既定）', en: 'Accurate: wait a little longer (default)' },
  'endpoint.hint': {
    zh: '「准」对说话人的区分更可靠，也不容易把一句话从中间断开，但每句话的结尾和译文会晚一秒多出来。',
    ja: '「正確」は話者の区別がより確かで、文の途中で切れにくくなりますが、各発言の末尾と訳文が 1 秒あまり遅れて表示されます。',
    en: '"Accurate" tells speakers apart more reliably and is less likely to cut a sentence in the middle, but the end of each sentence and its translation arrive a second or so later.',
  },
  'hints': { zh: '周围会说的语言（语言码，逗号分隔）', ja: '周りで話される言語（言語コード、カンマ区切り）', en: 'Languages spoken around you (codes, comma-separated)' },
  'hints.hint': { zh: '只是提示，不是限定。只写一种会把别的语言往它上面硬靠，所以常听到的都写上。代码见翻译下拉框。', ja: 'ヒントであって制限ではありません。一つだけ書くと他の言語が引き寄せられるので、よく聞く言語は全部書いてください。コードは翻訳の一覧を参照。', en: 'Hints only, not a restriction. Listing a single language pulls others toward it, so list every language you hear often. Codes are in the translation dropdown.' },
  'mic': { zh: '麦克风', ja: 'マイク', en: 'Microphone' },
  'mic.glasses': { zh: '眼镜', ja: 'グラス', en: 'Glasses' },
  'mic.phone': { zh: '手机', ja: 'スマホ', en: 'Phone' },
  'quiet': { zh: '安静多久后断开（分钟）', ja: '静かな状態が何分続いたら切断', en: 'Quiet timeout (min)' },
  'clearSec': { zh: '多久没有新字幕就清屏（秒）', ja: '新しい字幕がないとき画面を消すまで（秒）', en: 'Clear after idle (sec)' },
  'clearSec.hint': {
    zh: '最后一个字出现后过这么久，眼镜上的字幕自动清掉；期间只要有新字就重新计时。0＝不自动清。',
    ja: '最後の字幕が出てからこの秒数が過ぎると、グラスの字幕を自動で消します。新しい字幕が出るたびに数え直します。0 で自動消去なし。',
    en: 'Captions on the glasses are cleared this long after the last new text; any new text restarts the count. 0 = never.',
  },
  'ai.title': { zh: 'AI 解答（试验）', ja: 'AI 回答（試験的）', en: 'AI answers (experimental)' },
  'ai.key': { zh: 'Claude API Key', ja: 'Claude API Key', en: 'Claude API key' },
  'ai.model': { zh: '模型', ja: 'モデル', en: 'Model' },
  'ai.hint': {
    zh: '填了 Key 之后，在眼镜上单击，会把最近一段对话的文字发给 Claude，回答显示在眼镜上；再单击一次关闭。按 Anthropic 的用量计费，算在你自己账上。Key 只存在这台手机上。',
    ja: 'Key を入力すると、グラスをタップしたときに直前の会話のテキストを Claude に送り、回答をグラスに表示します。もう一度タップで閉じます。Anthropic の利用料金はご自身のアカウントに課金されます。Key はこのスマホにだけ保存されます。',
    en: 'With a key set, a tap on the glasses sends the text of the last stretch of conversation to Claude and shows the answer on the glasses; tap again to close. Billed by Anthropic to your own account. The key is stored only on this phone.',
  },
  'ai.box': { zh: 'AI', ja: 'AI', en: 'AI' },
  'ai.note.timing': { zh: 'AI（{m}）：首字 {f} 秒，写完 {t} 秒', ja: 'AI（{m}）：最初の文字まで {f} 秒、完了まで {t} 秒', en: 'AI ({m}): first text {f}s, done {t}s' },
  'note.ai.noKey': { zh: '眼镜单击可以问 AI：先在设置最下面填上 Claude API Key。', ja: 'グラスのタップで AI に質問できます。設定のいちばん下で Claude API Key を入力してください。', en: 'A tap on the glasses can ask the AI: enter a Claude API key at the bottom of Settings first.' },
  'ai.err.auth': { zh: 'Claude Key 无效或没有权限', ja: 'Claude の Key が無効、または権限がありません', en: 'Claude key is invalid or lacks permission' },
  'ai.err.rate': { zh: 'Claude 限流了，稍后再试', ja: 'Claude のレート制限です。しばらくしてからお試しください', en: 'Claude rate limit reached, try again shortly' },
  'ai.err.net': { zh: '连不上 Claude（{e}）', ja: 'Claude に接続できません（{e}）', en: 'Cannot reach Claude ({e})' },
  'ai.err.refusal': { zh: 'Claude 没有回答这段内容', ja: 'Claude はこの内容に回答しませんでした', en: 'Claude declined to answer this' },
  'ai.err.other': { zh: 'Claude 出错：{e}', ja: 'Claude でエラー：{e}', en: 'Claude error: {e}' },
  'quiet.hint': { zh: 'Soniox 按连接时长计费。没人说话时断开，一有声音立刻重连（头一两个字可能来不及）。', ja: 'Soniox は接続時間で課金されます。声がない間は切断し、声がすればすぐ再接続（最初の一言は間に合わないことがあります）。', en: 'Soniox bills by connection time. Disconnects while nobody is talking and reconnects as soon as there is voice (the first word or two may be missed).' },
  'cost.hint': { zh: 'Soniox 实时识别每小时 0.12 美元（2026-10 官网定价），翻译不另收费；眼镜持续传字幕也更耗电。', ja: 'Soniox のリアルタイム認識は 1 時間 0.12 ドル（2026-10 の公式料金）、翻訳は追加料金なし。グラスへ字幕を送り続けるので電池も減ります。', en: 'Soniox real-time costs $0.12 per hour (pricing as of 2026-10), translation included; streaming captions also drains the glasses faster.' },

  // 手机主画面
  'pause': { zh: '暂停', ja: '一時停止', en: 'Pause' },
  'resume': { zh: '继续', ja: '再開', en: 'Resume' },
  'start': { zh: '开始', ja: '開始', en: 'Start' },
  'note.pressStart': { zh: '按「开始」才会连接 Soniox（按连接时长计费）。眼镜上长按也行。', ja: '「開始」を押すと Soniox に接続します（接続時間で課金）。グラスの長押しでも可。', en: 'Press Start to connect to Soniox (billed by connection time). A long-press on the glasses works too.' },
  'clear': { zh: '清空眼镜', ja: 'グラスをクリア', en: 'Clear glasses' },
  'glasses.help': { zh: '眼镜：长按 暂停／继续 · 单击 问 AI · 菜单 清屏 · 双击 退出', ja: 'グラス：長押し 一時停止／再開 · タップ AI に質問 · メニュー 画面をクリア · ダブルタップ 終了', en: 'Glasses: long-press = pause/resume · tap = ask AI · menu = clear · double-tap = exit' },
  'note.netSlow': { zh: '网络慢：来不及发出去的声音会被丢掉，字幕可能漏字，但不会越拖越久。', ja: '回線が遅い状態です。送信が間に合わない音声は破棄されるため、字幕が抜けることがありますが、遅れが積み重なることはありません。', en: 'Slow network: audio that cannot be sent in time is dropped, so captions may skip words but will not fall further behind.' },
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
  'g.ai.thinking': { zh: 'AI 思考中', ja: 'AI 考え中', en: 'AI thinking' },
  'g.ai.writing': { zh: 'AI 回答中', ja: 'AI 回答中', en: 'AI answering' },
  'g.ai.done': { zh: 'AI', ja: 'AI', en: 'AI' },
  'g.ai.nothing': { zh: 'AI：还没有可问的内容', ja: 'AI：まだ内容がありません', en: 'AI: nothing to ask yet' },
  'g.ai.fail': { zh: 'AI 出错', ja: 'AI エラー', en: 'AI error' },
  'g.netSlow': { zh: '! 网络慢', ja: '! 回線が遅い', en: '! Slow network' },
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
