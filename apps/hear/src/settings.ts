// 用户设置：模型 + 持久化（只存 SDK 存储，见 kv.ts）。
import type { EvenAppBridge } from '@evenrealities/even_hub_sdk'
import { kvGet, kvSet } from './kv.ts'
import { LANG_CODES } from './languages.ts'
import { DEFAULT_AI_MODEL, type AiModel, type AiModelInfo } from './ai.ts'

export type Settings = {
  /** 界面语言：'auto'＝跟手机，或 zh / ja / en */
  lang: string
  apiKey: string
  /** 翻译目标语言（Soniox 语言码）；空串＝不翻译 */
  target: string
  /** 翻译开关（眼镜长按切换；target 留着，下次开还是它） */
  translate: boolean
  /** 开着翻译时，眼镜上还显不显示原话。关掉＝9 行全给译文。不翻译时不起作用 */
  showSource: boolean
  /**
   * 开着翻译时，别人直接说目标语言的话还显不显示。关掉＝不显示（把日语翻成中文的人，中文本来就听得懂）。
   * 默认显示：这是听障辅助，听不见的人两种话都要看
   */
  showTargetSpeech: boolean
  /**
   * 端点检测：开＝一句话一停下 Soniox 就定稿，字幕和译文出得快；关＝多等一会儿，由我们在停顿后发定稿指令，
   * 说话人区分更准、不容易把一句话从中间断开，代价是每句话的结尾晚一秒多（默认。实际用下来快慢差得不多，准更要紧）
   */
  endpoint: boolean
  /** 「默认改成准」那一次已经处理过的记号，见 loadSettings */
  epV?: number
  /** language_hints，逗号分隔 */
  hints: string
  /**
   * language_hints_strict：让识别更强地偏向 hints 里的语言。别人说的日语被写成一串中文时用。
   * 是「尽力而为」不是硬限定：Soniox 说只写一种语言时最可靠；实测（合成语音，hints 只写 ja）
   * 说得清楚的中文照样写成中文，所以它大概只在模型拿不准的时候起作用。真实场合的效果没验过
   */
  hintsStrict: boolean
  /**
   * 眼镜上最新的两行最亮、前面的暗一档（layout.ts 的 mid / now）。关＝和 0.1.x 一样：字从上往下填、全部最亮。
   * 做成开关是因为暗一档的字在强光下够不够清楚因人而异，真机上没来得及验
   */
  tiers: boolean
  mic: 'phone' | 'glasses'
  /** 安静多少分钟后断开 Soniox（省钱）；0＝不断 */
  quietMin: number
  /**
   * 自动清屏：眼镜上的字幕这么多秒没有新字就清掉；0＝不自动清。
   * 「没有新字」指字幕文本没变化 —— 期间只要出了新字（包括还没定稿的）就重新计时
   */
  clearSec: number
  /** Claude 的 API Key（AI 解答，试验）。空＝不启用，眼镜单击不做任何事 */
  claudeKey: string
  claudeModel: AiModel
  /** 上次用这把 Claude Key 查到的模型列表：下次打开设置先显示它，查到新的再换 */
  claudeModels?: AiModelInfo[]
}

export const DEFAULTS: Settings = {
  lang: 'auto',
  apiKey: '',
  target: 'zh',
  translate: false,
  showSource: true,
  showTargetSpeech: true,
  endpoint: false,
  epV: 2,
  hints: 'ja, zh',
  hintsStrict: false,
  tiers: true,
  mic: 'glasses',
  quietMin: 2,
  clearSec: 15,
  claudeKey: '',
  claudeModel: DEFAULT_AI_MODEL,
}

const KEY = 'hear.settings.v1'

export function phoneLang(): string | null {
  const tag = (typeof navigator !== 'undefined' && navigator.language) || ''
  const code = tag.toLowerCase().split(/[-_]/)[0]
  return LANG_CODES.has(code) ? code : null
}

/** 没保存过：翻译目标跟手机语言，提示＝日语 + 手机语言 */
export function initialDefaults(): Settings {
  const pl = phoneLang()
  const target = pl ?? DEFAULTS.target
  return { ...DEFAULTS, target, hints: [...new Set(['ja', target])].join(', ') }
}

export async function loadSettings(bridge: EvenAppBridge): Promise<Settings> {
  const raw = await kvGet(bridge, KEY)
  if (raw) {
    try {
      const saved = JSON.parse(raw) as Partial<Settings>
      // 0.1.12 起默认从「快」改成「准」。老版本存下来的设置里一律是「快」（分不出是自己选的还是当时的默认），
      // 所以升级后的第一次统一改成「准」；之后用户再选什么就是什么
      if (saved.epV !== 2) {
        if (saved.endpoint !== false) console.log('[settings] 定稿方式：按新默认改成「准」')
        saved.endpoint = false
        saved.epV = 2
      }
      return { ...initialDefaults(), ...saved }
    } catch { /* 当作没存过 */ }
  }
  return initialDefaults()
}

export function saveSettings(bridge: EvenAppBridge, s: Settings): Promise<boolean> {
  return kvSet(bridge, KEY, JSON.stringify(s))
}
