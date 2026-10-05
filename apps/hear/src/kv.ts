// SDK 键值存储的薄封装（按包名隔离）。
//
// 走 bridge 到宿主 App，**可能永不 resolve**（根 CLAUDE.md），一律套 8 秒超时，
// 超时按"没存过"处理。开发期用 WebView 原生 localStorage 兜底 —— 模拟器的
// SDK 存储不跨实例保存。正式包里**不碰原生 localStorage**：它按 origin 划分，
// 打包后所有插件都是 http://127.0.0.1:<端口>，可能被别的插件读到（meeting-notes 设计书 §3.4）。
import type { EvenAppBridge } from '@evenrealities/even_hub_sdk'

const SDK_TIMEOUT = 8000

const withTimeout = <T>(p: Promise<T>, fallback: T): Promise<T> =>
  Promise.race([p, new Promise<T>((res) => setTimeout(() => res(fallback), SDK_TIMEOUT))])

export async function kvGet(bridge: EvenAppBridge, key: string): Promise<string | null> {
  try {
    const v = await withTimeout(Promise.resolve(bridge.getLocalStorage(key)), null)
    if (typeof v === 'string' && v.length) return v
  } catch { /* 当作没有 */ }
  if (import.meta.env.DEV) {
    try { return window.localStorage.getItem(key) } catch { /* */ }
  }
  return null
}

export async function kvSet(bridge: EvenAppBridge, key: string, value: string): Promise<boolean> {
  if (import.meta.env.DEV) {
    try { window.localStorage.setItem(key, value) } catch { /* */ }
  }
  try { return await withTimeout(Promise.resolve(bridge.setLocalStorage(key, value)), false) } catch { return false }
}

/** 清掉要送一个空格 —— 空串是 protobuf 默认值，可能根本发不出去 */
export async function kvDel(bridge: EvenAppBridge, key: string): Promise<void> {
  if (import.meta.env.DEV) {
    try { window.localStorage.removeItem(key) } catch { /* */ }
  }
  await kvSet(bridge, key, ' ')
}

export async function kvGetJson<T>(bridge: EvenAppBridge, key: string, ok: (v: unknown) => v is T): Promise<T | null> {
  const raw = await kvGet(bridge, key)
  if (!raw || !raw.trim()) return null
  try {
    const v: unknown = JSON.parse(raw)
    return ok(v) ? v : null
  } catch { return null }
}
