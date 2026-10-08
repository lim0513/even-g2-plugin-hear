// 多语言：界面 + 眼镜文案。三语一张表，照 meeting-notes 的 i18n.ts。
// ja 栏容易混进假日语，test/fake-japanese.mjs 机器查，`npm test` 跑。
// 眼镜上的字只用汉字 / ASCII / 验过的符号（■ □ | !）。

export type Lang = 'zh' | 'ja' | 'en'
export const LANGS: Lang[] = ['zh', 'ja', 'en']
export const LANG_NAMES: Record<Lang, string> = { zh: '中文', ja: '日本語', en: 'English' }

type Row = Record<Lang, string>

const D: Record<string, Row> = {
  'app.title': { zh: 'Hear', ja: 'Hear', en: 'Hear' },
  'save': { zh: '保存', ja: '保存', en: 'Save' },
  'saved': { zh: '已保存', ja: '保存しました', en: 'Saved' },
  'show': { zh: '显示', ja: '表示', en: 'Show' },
  'hide': { zh: '隐藏', ja: '隠す', en: 'Hide' },

  // 状态
  'status.live': { zh: '正在听', ja: '聞いています', en: 'Listening' },
  'status.paused': { zh: '已暂停', ja: '一時停止中', en: 'Paused' },
  'status.connecting': { zh: '正在连接', ja: '接続しています', en: 'Connecting' },
  'status.reconnecting': { zh: '连接断了，正在重连', ja: '接続が切れました。再接続しています', en: 'Connection lost, reconnecting' },
  'status.quiet': { zh: '周围安静，已断开。有声音会自动接上', ja: '静かなので切断しました。声がすれば自動でつながります', en: 'Quiet, so disconnected. Reconnects when someone speaks' },
  'status.error': { zh: '出错了', ja: 'エラーが起きました', en: 'Something went wrong' },

  // 设置
  'settings': { zh: '设置', ja: '設定', en: 'Settings' },
  'lang': { zh: '界面语言', ja: '表示言語', en: 'Language' },
  'lang.auto': { zh: '跟随手机', ja: 'スマホに合わせる', en: 'Same as phone' },
  'apiKey.placeholder': { zh: '粘贴你的 Soniox Key', ja: 'Soniox の Key を貼り付け', en: 'Paste your Soniox key' },
  'settings.locked': { zh: '先暂停，才能改设置', ja: '設定を変えるには、先に一時停止してください', en: 'Pause first to change settings' },
  'caps.empty': { zh: '对方说的话会出现在这里，眼镜上同时显示。', ja: '相手の話した内容がここに表示されます。グラスにも同時に表示されます。', en: 'What people say appears here, and on the glasses at the same time.' },
  'translate': { zh: '翻译成', ja: '翻訳先', en: 'Translate to' },
  'translate.off': { zh: '关（只显示原话）', ja: 'オフ（原文のみ）', en: 'Off (original only)' },
  'showSrc': { zh: '眼镜上同时显示原话', ja: 'グラスに原文も表示', en: 'Show the original on the glasses too' },
  'tgtSpeech': { zh: '别人直接说目标语言时也显示', ja: '相手が翻訳先の言語で話したときも表示', en: 'Also show speech already in the target language' },
  'endpoint': { zh: '一句话什么时候定稿', ja: '発言を確定するタイミング', en: 'When a sentence is finalised' },
  'hints': { zh: '周围会说的语言', ja: '周りで話される言語', en: 'Languages spoken around you' },
  'hints.hint': { zh: '语言码，逗号分隔，例如 ja, zh。只是提示，不是限定；常听到的都写上。', ja: '言語コードをカンマ区切りで（例：ja, zh）。ヒントであって制限ではありません。よく聞く言語は全部書いてください。', en: 'Language codes, comma-separated, for example ja, zh. Hints only, not a restriction; list every language you hear often.' },
  'strict': { zh: '更强地偏向这些语言', ja: 'これらの言語をより強く優先する', en: 'Lean harder toward these languages' },
  'strict.hint': {
    zh: '日语被写成一串中文（或反过来）时试试打开。只写一种语言时最可靠；写了多种时仍然可能互相串。不是硬性限定：说得清楚的别种语言照样会被识别出来。',
    ja: '日本語が中国語の文字で表示されてしまう（またはその逆の）ときに試してください。言語を一つだけ書いたときが最も確実で、複数書くと混ざることがあります。厳密な制限ではなく、はっきり話された別の言語はそのまま認識されます。',
    en: 'Turn on when Japanese comes out as Chinese characters (or the reverse). Most reliable with a single language listed; with several they can still get mixed up. It is not a hard limit: clearly spoken speech in another language is still recognised as such.',
  },
  'mic': { zh: '麦克风', ja: 'マイク', en: 'Microphone' },
  'mic.glasses': { zh: '眼镜', ja: 'グラス', en: 'Glasses' },
  'mic.phone': { zh: '手机', ja: 'スマホ', en: 'Phone' },
  'quiet': { zh: '安静几分钟后断开', ja: '静かな状態が何分続いたら切断', en: 'Disconnect after quiet (minutes)' },
  'clearSec': { zh: '几秒没有新字幕就清屏', ja: '新しい字幕がないとき画面を消すまでの秒数', en: 'Clear glasses after idle (seconds)' },
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
  'ai.note.timing': { zh: 'AI（{m}）：首字 {f} 秒，写完 {t} 秒', ja: 'AI（{m}）：最初の文字まで {f} 秒、完了まで {t} 秒', en: 'AI ({m}): first text {f}s, done {t}s' },
  'note.ai.noKey': { zh: '眼镜单击可以问 AI：先在设置的「AI 解答」里填上 Claude API Key。', ja: 'グラスのタップで AI に質問できます。設定の「AI 回答」で Claude API Key を入力してください。', en: 'A tap on the glasses can ask the AI: enter a Claude API key under "AI answers" in Settings first.' },
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
  'glasses.help': { zh: '眼镜上：长按 暂停／继续，单击 问 AI，菜单 清屏，双击 退出。', ja: 'グラス：長押しで一時停止／再開、タップで AI に質問、メニューで画面をクリア、ダブルタップで終了。', en: 'On the glasses: long-press to pause or resume, tap to ask the AI, menu to clear, double-tap to exit.' },
  'note.netSlow': { zh: '网络慢：来不及发出去的声音会被丢掉，字幕可能漏字，但不会越拖越久。', ja: '回線が遅い状態です。送信が間に合わない音声は破棄されるため、字幕が抜けることがありますが、遅れが積み重なることはありません。', en: 'Slow network: audio that cannot be sent in time is dropped, so captions may skip words but will not fall further behind.' },
  'note.noKey': { zh: '缺一把 Soniox 的 Key', ja: 'Soniox の Key が必要です', en: 'A Soniox key is needed' },
  'note.captionsStopped': { zh: '字幕已停：{d}', ja: '字幕停止：{d}', en: 'Captions stopped: {d}' },
  'note.micFail': { zh: '麦克风打不开（{m}）', ja: 'マイクを開けません（{m}）', en: 'Cannot open microphone ({m})' },
  'note.settingsNotSaved': { zh: '设置没存上', ja: '設定を保存できません', en: 'settings not saved' },

  // 0.2.0 的手机页面
  'status.liveTr': { zh: '正在听，翻译成{l}', ja: '聞いています。{l}に翻訳中', en: 'Listening, translating to {l}' },
  'status.ready': { zh: '还没开始', ja: 'まだ始めていません', en: 'Not started yet' },
  'status.setup': { zh: '还不能开始', ja: 'まだ始められません', en: 'Not ready yet' },
  // 手机状态行里的语言名，跟着界面语言走（眼镜上用的是 main.ts 的 SAFE_NAMES，那边要顾及字库）
  'lname.zh': { zh: '中文', ja: '中国語', en: 'Chinese' },
  'lname.ja': { zh: '日语', ja: '日本語', en: 'Japanese' },
  'lname.en': { zh: '英语', ja: '英語', en: 'English' },
  'close': { zh: '关闭', ja: '閉じる', en: 'Close' },
  'first.lead': { zh: '把周围人说的话变成眼镜上的字。先填一把语音识别的 Key，它只存在这台手机上。', ja: '周りの人の話を、グラスの字幕にします。まず音声認識の Key を入力してください。Key はこのスマホにだけ保存されます。', en: 'Turns what people around you say into captions on your glasses. Start by entering a speech-recognition key; it is stored only on this phone.' },
  'first.hint': { zh: '在 {link} 注册，然后在左侧的 API Keys 里点 Create 生成。听一小时大约 0.12 美元，翻译也算在里面，从你自己的 Soniox 账户扣。', ja: '{link} に登録し、左の API Keys で Create を押して作成します。1 時間あたり約 0.12 ドル（翻訳込み）で、ご自身の Soniox アカウントに課金されます。', en: 'Sign up at {link}, then choose Create under API Keys on the left. About $0.12 per hour of listening, translation included, billed to your own Soniox account.' },
  'first.go': { zh: '保存并开始', ja: '保存して開始', en: 'Save and start' },
  'first.need': { zh: '先把 Key 粘贴进来', ja: '先に Key を貼り付けてください', en: 'Paste a key first' },
  'grp.tr': { zh: '翻译', ja: '翻訳', en: 'Translation' },
  'grp.rec': { zh: '识别', ja: '認識', en: 'Recognition' },
  'grp.glass': { zh: '眼镜显示', ja: 'グラスの表示', en: 'Glasses display' },
  'grp.conn': { zh: '连接与费用', ja: '接続と料金', en: 'Connection and cost' },
  'grp.key': { zh: 'Key 与界面语言', ja: 'Key と表示言語', en: 'Key and language' },
  'showSrc.one': { zh: '开：3 行原话 + 6 行译文。关：9 行都是译文。', ja: 'オン：原文 3 行 + 訳文 6 行。オフ：9 行すべて訳文。', en: 'On: 3 lines original + 6 translation. Off: all 9 lines translation.' },
  'tgtSpeech.one': { zh: '关掉后只是眼镜上不显示，手机上照常保留。', ja: 'オフにしてもスマホの字幕には残ります。', en: 'When off it is only left off the glasses; the phone still keeps it.' },
  'endpoint.acc': { zh: '准', ja: '正確', en: 'Accurate' },
  'endpoint.fast': { zh: '快', ja: '速い', en: 'Fast' },
  'endpoint.one': { zh: '「准」晚约 0.2 秒，分人更可靠，也不容易把一句话切断。', ja: '「正確」は約 0.2 秒遅くなりますが、話者の区別が確かで、文の途中で切れにくくなります。', en: '"Accurate" is about 0.2 s later, tells speakers apart more reliably and cuts sentences less.' },
  'tiers': { zh: '最新两行更亮', ja: '最新の 2 行を明るく', en: 'Brighter newest two lines' },
  'tiers.hint': { zh: '最新的两行最亮，前面的暗一档，抬眼就能找到说到哪儿了。觉得前面的字太暗就关掉。', ja: '最新の 2 行をいちばん明るく、それより前を一段暗くします。どこまで読んだかが見つけやすくなります。前の行が暗すぎるときはオフにしてください。', en: 'The newest two lines are brightest and earlier ones a step dimmer, so your eye lands on what is being said. Turn off if the earlier lines are too dim.' },
  'ai.who': { zh: 'AI 的回答', ja: 'AI の回答', en: 'AI answer' },
  'g.ai.close': { zh: '单击 关闭', ja: 'タップで閉じる', en: 'Tap to close' },
  'g.ai.closeNext': { zh: '单击 关闭　　下滑 下一页', ja: 'タップで閉じる　　下スワイプで次へ', en: 'Tap to close    Swipe down for next' },

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
