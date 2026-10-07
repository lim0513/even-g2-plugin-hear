// 用户设置：模型 + 持久化（只存 SDK 存储，见 kv.ts）。
import type { EvenAppBridge } from '@evenrealities/even_hub_sdk'
import { kvGet, kvSet } from './kv.ts'
import { LANG_CODES } from './languages.ts'
import { DEFAULT_AI_MODEL, type AiModel } from './ai.ts'

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
   * 端点检测：开＝一句话一停下 Soniox 就定稿，字幕和译文出得快（默认）；关＝多等一会儿，由我们在停顿后发定稿指令，
   * 说话人区分更准、不容易把一句话从中间断开，代价是每句话的结尾晚一秒多
   */
  endpoint: boolean
  /** language_hints，逗号分隔 */
  hints: string
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
}

export const DEFAULTS: Settings = {
  lang: 'auto',
  apiKey: '',
  target: 'zh',
  translate: false,
  showSource: true,
  showTargetSpeech: true,
  endpoint: true,
  hints: 'ja, zh',
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
    try { return { ...initialDefaults(), ...(JSON.parse(raw) as Partial<Settings>) } } catch { /* 当作没存过 */ }
  }
  return initialDefaults()
}

export function saveSettings(bridge: EvenAppBridge, s: Settings): Promise<boolean> {
  return kvSet(bridge, KEY, JSON.stringify(s))
}
