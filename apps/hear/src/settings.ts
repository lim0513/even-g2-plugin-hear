// 用户设置：模型 + 持久化（只存 SDK 存储，见 kv.ts）。
import type { EvenAppBridge } from '@evenrealities/even_hub_sdk'
import { kvGet, kvSet } from './kv.ts'
import { LANG_CODES } from './languages.ts'

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
  /** language_hints，逗号分隔 */
  hints: string
  mic: 'phone' | 'glasses'
  /** 安静多少分钟后断开 Soniox（省钱）；0＝不断 */
  quietMin: number
}

export const DEFAULTS: Settings = {
  lang: 'auto',
  apiKey: '',
  target: 'zh',
  translate: false,
  showSource: true,
  hints: 'ja, zh',
  mic: 'glasses',
  quietMin: 2,
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
