// AI 解答（试验分支 hear-claude-proto）：把最近一段对话的文字发给 Claude，回答流式拿回来。
//
// 发过去是**一次性**的一包文字（接口是一问一答，不能像给 Soniox 送音频那样持续喂）；回来的是流，
// 一边生成一边交给 onText。这个文件只管这一问一答，不碰眼镜和页面。
//
// 从手机上的网页直接调 Anthropic 的接口：SDK 默认不让在浏览器里用（Key 会暴露给页面），要显式打开
// dangerouslyAllowBrowser。这里的 Key 是用户自己在设置里填的、只存在这台手机上，和 Soniox 的 Key 同一处境。
// 直连在宿主 WebView 里行不行，是这个分支要验证的第一件事。
import Anthropic from '@anthropic-ai/sdk'

export type AiModelInfo = { id: string; name: string }
/**
 * 内置的三个：查不到模型列表时（没填 Key、没网、接口被拦）用它们，查到了也排在最前面。
 * 能选的模型不是写死的 —— 设置页打开时用用户的 Key 问一遍「现在能用哪些」（listModels），新出的模型会自己出现
 */
export const AI_MODELS: readonly AiModelInfo[] = [
  { id: 'claude-opus-5-5', name: 'Claude Opus 5.5' },
  { id: 'claude-sonnet-5-5', name: 'Claude Sonnet 5.5' },
  { id: 'claude-haiku-4-5', name: 'Claude Haiku 4.5' },
]
export type AiModel = string
export const DEFAULT_AI_MODEL: AiModel = 'claude-opus-5-5'
export const isAiModel = (v: string): v is AiModel => /^claude-[a-z0-9.-]+$/.test(v)

/**
 * 内置的排前面，查到的其余模型跟在后面。查到的 id 常带日期（claude-haiku-4-5-20251001）：
 * 和内置的是同一个模型，不重复列。keep＝正在用的那个，不在列表里也留着，不悄悄换成别的
 */
export function mergeModels(found: readonly AiModelInfo[], keep = ''): AiModelInfo[] {
  const list: AiModelInfo[] = [...AI_MODELS]
  for (const f of found) {
    if (!isAiModel(f.id)) continue
    if (!list.some((m) => f.id === m.id || f.id.startsWith(m.id + '-'))) list.push({ id: f.id, name: f.name || f.id })
  }
  if (keep && isAiModel(keep) && !list.some((m) => m.id === keep)) list.push({ id: keep, name: keep })
  return list
}

/** 这把 Key 现在能用的模型，新的在前。查不到返回空数组（调用方就用内置的） */
export async function listModels(apiKey: string): Promise<AiModelInfo[]> {
  if (!apiKey) return []
  try {
    const client = new Anthropic({ apiKey, dangerouslyAllowBrowser: true, maxRetries: 1, timeout: 10_000 })
    const out: AiModelInfo[] = []
    for await (const m of client.models.list({ limit: 100 })) {
      out.push({ id: m.id, name: m.display_name || m.id })
      if (out.length >= 100) break
    }
    return out
  } catch (e) {
    console.warn('[ai] 模型列表没查到：', e instanceof Error ? e.message : e)
    return []
  }
}

/**
 * 发请求时不带「推理强度」和「服务端后备」这两个额外参数的模型：Haiku（不认 effort，会报错），
 * 以及实际发过一次、因为参数被拒了的（查到的新模型，程序不认识它的脾气，试出来的）
 */
const plainModels = new Set<string>()
const isPlain = (model: string) => model.includes('haiku') || plainModels.has(model)

export type AiErrorKind = 'auth' | 'rate' | 'net' | 'refusal' | 'other'
export type AiResult = {
  text: string
  /** 从发出请求到第一个字回来（毫秒）；一个字都没回来是 null */
  firstMs: number | null
  totalMs: number
  /** 实际回答的模型（服务端可能换成了后备模型） */
  model: string
  error?: { kind: AiErrorKind; detail: string }
  aborted?: boolean
}
export type AiRun = { abort: () => void; done: Promise<AiResult> }

const LANG_NAMES: Record<string, string> = { zh: 'Simplified Chinese', ja: 'Japanese', en: 'English' }

const langName = (lang: string) => LANG_NAMES[lang] ?? `the language with code "${lang}"`

/** 系统提示。同一种回答语言下逐字不变 */
const system = (lang: string) => `You assist a person who is following a live conversation through caption glasses. You receive a rough, automatically transcribed excerpt of the last moments of that conversation. It may contain recognition errors. Each line is one speaker turn and starts with a label such as "S1:" or "S2:"; the same label is the same voice throughout the excerpt. The labels come from automatic speaker recognition and are sometimes wrong, and the wearer of the glasses may be one of the speakers. The most recent speech is at the end.

Reply in ${langName(lang)}, whatever language the conversation itself is in. Latency-sensitive; begin your visible answer immediately.

The answer is shown on a tiny display that fits nine short lines, so write plain text with no markdown and no preamble, at most five short lines:
- Line 1: what the other person is asking or wants, in one short sentence. Use the speaker labels to follow who said what, but do not print them.
- Then up to three short lines the wearer could say in reply, or the key facts needed to answer.
If the excerpt contains no question or request, say in two short lines what is being discussed.
Keep each line to roughly 25 characters in Chinese or Japanese, or 50 characters in other languages.`

/**
 * 问一次。transcript：最近一段对话的原文（captions.recent()）。lang：用哪种语言回答。
 * onText 每来一段就调一次，给的是**到目前为止的全文**。
 */
export function ask(o: { apiKey: string; model: AiModel; lang: string; transcript: string; onText: (full: string) => void }): AiRun {
  const client = new Anthropic({ apiKey: o.apiKey, dangerouslyAllowBrowser: true, maxRetries: 1, timeout: 30_000 })
  const t0 = Date.now()
  let text = ''
  let firstMs: number | null = null
  let aborted = false

  // Haiku 不认 effort（会报错），也不带思考，本来就是最快的。
  // Opus / Sonnet 这一类的思考关不掉（或不该关），用最低的 effort 把首字时间压下来；
  // 它们的安全分类器可能拒答，打开服务端后备（被拒时由服务端换一个模型重跑同一个请求）。
  // 列表是查来的，会有程序不认识的模型：先按后一种发，因为参数被拒（400）就记下来、去掉这两个参数再发一次
  const open = (fast: boolean) => client.beta.messages.stream({
    model: o.model,
    max_tokens: 4000,   // 思考的 token 也算在里面，留够；回答的长短靠提示词管
    system: system(o.lang),
    // 回答语言在最后再说一遍：只写在系统提示里时，Haiku 4.5 会跟着对话的语言走（实测：日语对话、要求中文，答成了日语）
    messages: [{ role: 'user', content: `Transcript excerpt:\n\n${o.transcript}\n\nWrite your answer in ${langName(o.lang)}.` }],
    ...(fast ? {} : {
      output_config: { effort: 'low' as const },
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default' as const,
    }),
  })

  let stream = open(isPlain(o.model))
  let retried = isPlain(o.model)

  const attempt = async (): Promise<AiResult> => {
    let model: string = o.model
    try {
      for await (const event of stream) {
        if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
          if (firstMs === null) firstMs = Date.now() - t0
          text += event.delta.text
          o.onText(text)
        }
      }
      const msg = await stream.finalMessage()
      model = msg.model
      if (msg.stop_reason === 'refusal') {
        return { text, firstMs, totalMs: Date.now() - t0, model, error: { kind: 'refusal', detail: msg.stop_details?.category ?? '' } }
      }
      return { text, firstMs, totalMs: Date.now() - t0, model }
    } catch (e) {
      const totalMs = Date.now() - t0
      if (aborted || e instanceof Anthropic.APIUserAbortError) return { text, firstMs, totalMs, model, aborted: true }
      if (e instanceof Anthropic.BadRequestError && !retried && !text) {
        retried = true
        plainModels.add(o.model)
        console.warn(`[ai] ${o.model} 不认额外参数，去掉再发一次：${e.message}`)
        stream = open(true)
        return attempt()
      }
      // 从具体到一般。连不上（含跨域被拦 —— WebKit 只回一句 Load failed）单独一类，这是直连最可能出的问题
      if (e instanceof Anthropic.AuthenticationError || e instanceof Anthropic.PermissionDeniedError) {
        return { text, firstMs, totalMs, model, error: { kind: 'auth', detail: e.message } }
      }
      if (e instanceof Anthropic.RateLimitError) return { text, firstMs, totalMs, model, error: { kind: 'rate', detail: e.message } }
      if (e instanceof Anthropic.APIConnectionError) return { text, firstMs, totalMs, model, error: { kind: 'net', detail: e.message } }
      if (e instanceof Anthropic.APIError) return { text, firstMs, totalMs, model, error: { kind: 'other', detail: `${e.status ?? ''} ${e.message}`.trim() } }
      return { text, firstMs, totalMs, model, error: { kind: 'other', detail: e instanceof Error ? e.message : String(e) } }
    }
  }
  const done = attempt()

  return { abort: () => { aborted = true; stream.abort() }, done }
}
