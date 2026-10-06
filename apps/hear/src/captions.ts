// Soniox 实时 token 流 → 两条字幕流（原文 / 译文）。纯逻辑，不依赖 SDK。
//
// 和 meeting-notes 的 core/tokens.ts 不同：这里**不标「人物N」、不分段**，只在换人时换行。听障场景要的是
// "现在有人在说什么"，不是会议纪要 —— 所以就是两条连续滚动的文本：
//   src  说的原话（任何语言，Soniox 自动识别）；说话人变了就换行
//   dst  译文（开了翻译才有）；同样按说话人换行（译文 token 也带 speaker）
// 未定稿部分（nfSrc / nfDst）每次响应整组替换，显示时接在定稿文本后面。
// 文本只留最后 MAX 字符，一天戴着也不会涨。

export type SonioxToken = {
  text: string
  is_final: boolean
  start_ms?: number
  end_ms?: number
  confidence?: number
  speaker?: string
  translation_status?: 'none' | 'original' | 'translation'
  language?: string
  source_language?: string
}

export type SonioxResponse = {
  tokens: SonioxToken[]
  final_audio_proc_ms?: number
  total_audio_proc_ms?: number
  finished?: boolean
  error_code?: number
  error_type?: string
  error_message?: string
}

const MAX = 4000
/**
 * 每个人开口的那一行，行首的记号。换人只换行的话，上一个人的话正好写满一行时
 * 根本看不出换了人；折行出来的续行不带记号，所以"带记号＝换了人说话"。
 * 「•」是真机字库验过的（根 CLAUDE.md 的字形表），别换成没验过的符号 —— 缺字形是静默空白。
 */
export const TURN = '• '
const CONTROL = /^<[a-z]+>$/

// 末尾的换行去掉，不然折行后多出一个空行占掉一行
const turns = (s: string) => {
  const body = s.replace(/\n$/, '')
  return body ? body.split('\n').map((l) => TURN + l.trimStart()).join('\n') : ''
}

export class Captions {
  src = ''
  dst = ''
  nfSrc = ''
  nfDst = ''
  /** 译文目标语言；用户自己说目标语言时（translation_status=none 且 language 相同）只进译文流 */
  target = ''
  /** 说目标语言的话（上面那种）整个不要：既不进原文流也不进译文流。只在 target 非空时起作用 */
  hideTargetSpeech = false
  /** 最近一次有内容到达的时间（给"多久没字了"用） */
  lastAt = 0
  /** 各流最后一个定稿 token 的说话人，变了就换行 */
  private srcSpeaker = ''
  private dstSpeaker = ''

  feed(res: SonioxResponse): void {
    this.nfSrc = ''
    this.nfDst = ''
    /** 未定稿部分里前一个 token 的说话人 */
    let nfSrcSp = ''
    let nfDstSp = ''
    for (const t of res.tokens) {
      if (CONTROL.test(t.text)) continue   // <end> <fin> 等控制 token 不是内容
      const toDst = t.translation_status === 'translation'
        || (t.translation_status === 'none' && !!this.target && t.language === this.target)
      // 放在说话人判断之前：被藏掉的话不参与按人换行
      if (this.hideTargetSpeech && toDst && t.translation_status === 'none') continue
      const sp = t.speaker ?? ''
      if (t.is_final) {
        // 按人换行（和 meeting-notes 一样）：说话人变了就另起一行。译文 token 也带 speaker
        if (toDst) {
          if (sp !== this.dstSpeaker && this.dst && !this.dst.endsWith('\n')) this.dst += '\n'
          this.dstSpeaker = sp
          this.dst += t.text
        } else {
          if (sp !== this.srcSpeaker && this.src && !this.src.endsWith('\n')) this.src += '\n'
          this.srcSpeaker = sp
          this.src += t.text
        }
        this.lastAt = Date.now()
      } else if (toDst) {
        // 未定稿的部分里换了人：现在就另起一行，别等定稿时整段跳下去。
        // 和**前一个 token** 比（未定稿的头一个就和定稿的最后一个比）—— 上一个人的尾巴还没定稿、
        // 下一个人已经开口，是抢话时的常态，只看头一个 token 会漏掉
        const all = this.dst + this.nfDst
        if (all && !all.endsWith('\n') && sp !== (this.nfDst ? nfDstSp : this.dstSpeaker)) this.nfDst += '\n'
        nfDstSp = sp
        this.nfDst += t.text
      } else {
        const all = this.src + this.nfSrc
        if (all && !all.endsWith('\n') && sp !== (this.nfSrc ? nfSrcSp : this.srcSpeaker)) this.nfSrc += '\n'
        nfSrcSp = sp
        this.nfSrc += t.text
      }
    }
    if (this.src.length > MAX) this.src = this.src.slice(-MAX)
    if (this.dst.length > MAX) this.dst = this.dst.slice(-MAX)
  }

  // 流里的每个 '\n' 都是换人，所以每行行首加记号
  srcText(): string { return turns(this.src + this.nfSrc) }
  dstText(): string { return turns(this.dst + this.nfDst) }

  clear(): void {
    this.src = this.dst = this.nfSrc = this.nfDst = ''
    this.srcSpeaker = this.dstSpeaker = ''
  }
}
