// 假的 Soniox（只在开发期用）：按官方文档描述的节奏伪造响应，喂给 core/tokens.ts。
//
// 模拟的要点（都来自文档，不是猜的）：
//   - 原文按子词一点点到（这里 1–2 个字一个 token），先是 non-final，约 1.3 秒后定稿
//   - 译文**按分句跟在原文后面**：一个分句的原文到齐之后约 0.7 秒，这一句的译文开始流
//   - non-final 的 token 每次响应整组重发
//   - 用户自己说中文：translation_status=none，language=zh，没有译文
//   - 换人：speaker 变
import type { SonioxResponse, SonioxToken } from './captions.ts'

export type Line = { speaker: string; src: string; dst?: string; lang?: 'ja' | 'zh' }

// 分句数两边必须一致，译文才能按句跟上（写脚本时自己数一遍）
export const SCRIPT: Line[] = [
  { speaker: '1', src: 'では、来週の見積もりの件から始めましょう。先週お送りした仕様書、ご確認いただけましたか。',
    dst: '那么，我们从下周报价的事情开始吧。上周发给您的规格书，您确认过了吗？' },
  { speaker: '2', src: 'はい、拝見しました。二点ほど確認したいところがあります。',
    dst: '是的，我看过了。有两点想确认一下。' },
  { speaker: '1', src: 'どうぞ。', dst: '请讲。' },
  { speaker: '2', src: '一つ目は納期です。三月末というのは、検収まで含めた日程でしょうか。',
    dst: '第一点是交货期。三月底这个时间，是包括验收在内的日程吗？' },
  { speaker: '3', src: '検収は含みません。納品が三月末で、検収は四月の第一週を想定しています。ただ、部長の承認がまだなので、来週の会議で正式に決める予定です。',
    dst: '不包括验收。交货是三月底，验收预计在四月第一周。不过，部长还没有批准，预定在下周的会议上正式决定。' },
  // 用户自己说了句中文：Soniox 照常转写，标 none，不翻译
  { speaker: '2', src: '好的，明白了。', lang: 'zh' },
  { speaker: '1', src: '予算の方は、前回の案で進めて問題ないと思いますが、少し検討させてください。',
    dst: '预算方面，我觉得按上次的方案推进没有问题，不过请让我们再研究一下。' },
]

const clauses = (s: string) => s.match(/[^、。？！，]+[、。？！，]?/g) ?? [s]

type Ev = { at: number; finalAt: number; tok: Omit<SonioxToken, 'is_final'> }

const SRC_MS = 220       // 原文每个 token 的间隔（≈ 6–7 字/秒，日语口语语速）
const SRC_FINAL = 1300   // 原文到达后多久定稿
const DST_LAG = 700      // 分句原文到齐后多久开始出译文
const DST_MS = 110       // 译文每个 token 的间隔
const DST_FINAL = 900
const GAP = 1400         // 两段发言之间的停顿
const TICK = 200         // 响应间隔

function plan(script: Line[]): { events: Ev[]; end: number } {
  const events: Ev[] = []
  let t = 500
  let dstCursor = 0   // 译文是顺序流：下一句的译文要等上一句的出完（否则两句的 token 会交错）
  for (const line of script) {
    const lang = line.lang ?? 'ja'
    const srcClauses = clauses(line.src)
    const dstClauses = line.dst ? clauses(line.dst) : []
    srcClauses.forEach((clause, ci) => {
      const chars = [...clause]
      for (let i = 0; i < chars.length; i += 2) {
        t += SRC_MS
        events.push({ at: t, finalAt: t + SRC_FINAL, tok: {
          text: chars.slice(i, i + 2).join(''), speaker: line.speaker, language: lang,
          translation_status: lang === 'ja' ? 'original' : 'none',
          start_ms: t, end_ms: t + SRC_MS,
        } })
      }
      const dst = dstClauses[ci]
      if (dst) {
        let td = Math.max(t + DST_LAG, dstCursor)
        const dchars = [...dst]
        for (let i = 0; i < dchars.length; i += 2) {
          td += DST_MS
          events.push({ at: td, finalAt: td + DST_FINAL, tok: {
            text: dchars.slice(i, i + 2).join(''), speaker: line.speaker,
            language: 'zh', source_language: 'ja', translation_status: 'translation',
          } })
        }
        dstCursor = td
      }
    })
    t += GAP
  }
  events.sort((a, b) => a.at - b.at)
  return { events, end: t + SRC_FINAL + DST_LAG + DST_FINAL + 2000 }
}

/**
 * 跑一遍脚本。暂停时虚拟时钟停住（和真会话"关 WebSocket"不同，只是演示方便）。
 * 返回停止函数。
 */
export function runFake(
  script: Line[],
  onResponse: (r: SonioxResponse) => void,
  opts: { paused: () => boolean; onCycle: () => Promise<void> },
): () => void {
  let stopped = false
  const loop = async () => {
    while (!stopped) {
      const { events, end } = plan(script)
      let now = 0
      let lastTick = 0
      while (now < end && !stopped) {
        await new Promise((r) => setTimeout(r, TICK))
        if (opts.paused()) continue
        lastTick = now
        now += TICK
        const finals = events.filter((e) => e.finalAt > lastTick && e.finalAt <= now)
        const nonfinals = events.filter((e) => e.at <= now && e.finalAt > now)
        if (!finals.length && !nonfinals.length) continue
        onResponse({
          tokens: [
            ...finals.map((e) => ({ ...e.tok, is_final: true })),
            ...nonfinals.map((e) => ({ ...e.tok, is_final: false })),
          ],
          final_audio_proc_ms: now - SRC_FINAL,
          total_audio_proc_ms: now,
        })
      }
      // 等调用方把上一轮清干净再开下一轮 —— 否则新一轮的头几个 token 会被一起清掉（踩过）
      if (!stopped) await opts.onCycle()
    }
  }
  void loop()
  return () => { stopped = true }
}
