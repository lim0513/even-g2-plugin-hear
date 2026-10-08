// 眼镜布局。不依赖 SDK。
//
// 6 个容器，位置在建页时定死（textContainerUpgrade 只能换文字和亮度）：
//
//   header  1 行   状态：■ Hear ／ || 已暂停 ／ ! 重连中
//   capture 全幅 × 底部 28px，内容一个全角空格，**只负责收手势**（isEventCapture）。
//           固件会把手势容器里的字上下平移（顶栏挂过，字被滚没了），所以挂到一个没字的容器上，
//           叠在 now 的最后一行上，什么都不画。照 jp-train-hub 的做法
//   tr      同一行右端：翻译状态「翻译»中文」。单独一个容器才能靠右
//   top     3 行   y 32..116
//   mid     4 行   y 120..232
//   now     2 行   y 232..288
//
// mid 和 now 原先是一个 6 行的 bottom。拆开是因为**亮度只能按容器设**：想让「最新的两行最亮、
// 前面的暗一档」（抬眼就落在正在说的话上），最新的两行就得自己占一个容器。字靠下放，新字从最下面顶上来。
// 三个容器行距一样、上下相邻，同一个亮度时看起来就是一整块。
//
// 开翻译：top = 原文（最暗）、mid + now = 译文。
// 不翻译：原文 9 行，top + mid + now 连着放。

export const C = {
  header: { id: 1, name: 'header' },
  top: { id: 2, name: 'top' },
  mid: { id: 3, name: 'mid' },
  now: { id: 6, name: 'now' },
  tr: { id: 4, name: 'tr' },
  capture: { id: 5, name: 'capture' },
} as const

export type Block = keyof typeof C
/** 有内容、需要更新的块。capture 不更新 */
export type ContentBlock = Exclude<Block, 'capture'>
export const BLOCKS: ContentBlock[] = ['header', 'top', 'mid', 'now', 'tr']

/** textColor 0–4 */
export const DIM = 1
export const MID = 2
export const BRIGHT = 4

const INNER = 28
export const ROWS = { top: 3, mid: 4, now: 2 } as const

export const BOX: Record<Block, { x: number; y: number; w: number; h: number }> = {
  header: { x: 0, y: 0, w: 400, h: 30 },
  tr: { x: 406, y: 0, w: 170, h: 30 },
  top: { x: 0, y: 32, w: 576, h: INNER * ROWS.top },
  mid: { x: 0, y: 120, w: 576, h: INNER * ROWS.mid },
  now: { x: 0, y: 120 + INNER * ROWS.mid, w: 576, h: INNER * ROWS.now },
  capture: { x: 0, y: 288 - INNER, w: 576, h: INNER },
}

export type Screen = Record<ContentBlock, string> & { dim: Record<ContentBlock, number> }

/** 一行能放多少列（半角＝1、全角＝2）。估算值，见 meeting-notes/layout.ts */
export const COLS = 55

const colsOf = (ch: string) => {
  const c = ch.codePointAt(0) ?? 0
  return c >= 0x1100 && (c <= 0x115f || (c >= 0x2e80 && c <= 0xa4cf) || (c >= 0xac00 && c <= 0xd7a3)
    || (c >= 0xf900 && c <= 0xfaff) || (c >= 0xfe30 && c <= 0xfe4f) || (c >= 0xff00 && c <= 0xff60)
    || (c >= 0xffe0 && c <= 0xffe6)) ? 2 : 1
}

export function wrap(text: string, cols = COLS): string[] {
  const out: string[] = []
  for (const para of text.split('\n')) {
    let line = ''
    let w = 0
    for (const ch of para) {
      const cw = colsOf(ch)
      if (w + cw > cols) { out.push(line); line = ''; w = 0 }
      line += ch
      w += cw
    }
    out.push(line)
  }
  return out
}

/** 折行后只保留最后 rows 行 */
export function lastLines(text: string, rows: number, cols = COLS): string[] {
  return wrap(text, cols).slice(-rows)
}
