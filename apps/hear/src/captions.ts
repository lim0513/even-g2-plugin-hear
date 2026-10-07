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

/** 眼镜那份只留这么多字：眼镜上只看得到最后九行，多了没用 */
const MAX = 4000
/**
 * 手机那份留这么多字。**手机上的记录在这次打开期间不清**（用户定的规矩：暂停、继续、清屏、自动清屏
 * 都只清眼镜；只有退出重进才从头开始），所以要留得久。三万字大约是连续说两个小时的量，再多就从最前面丢
 */
const PHONE_MAX = 30000
/**
 * 每个人开口的那一行，行首的记号。换人只换行的话，上一个人的话正好写满一行时
 * 根本看不出换了人；折行出来的续行不带记号，所以"带记号＝换了人说话"。
 * 「•」是真机字库验过的（根 CLAUDE.md 的字形表），别换成没验过的符号 —— 缺字形是静默空白。
 */
export const TURN = '• '
const CONTROL = /^<[a-z]+>$/
/** 停顿超过这么久，后面的话算新的一段对话（AI 上下文从这里重新开始） */
const LOG_GAP_MS = 45_000
/** 一段对话最多留这么多字 */
const LOG_MAX = 2000

// 末尾的换行去掉，不然折行后多出一个空行占掉一行
const turns = (s: string) => {
  const body = s.replace(/\n$/, '')
  // 只有空白的行丢掉：新说话人的头一个 token 有时只是个空格，不丢的话会多出一行光秃秃的「•」（真机截图里出现过）
  return body ? body.split('\n').filter((l) => l.trim()).map((l) => TURN + l.trimStart()).join('\n') : ''
}

/** 一条字幕流：定稿文本 + 未定稿尾巴，按说话人换行 */
class Stream {
  text = ''
  nf = ''
  /** 未定稿里第一个 token 的说话人 */
  nfFirst = ''
  private speaker = ''
  private nfPrev = ''

  /** 每次响应开头：未定稿整组重来 */
  begin(): void { this.nf = ''; this.nfFirst = ''; this.nfPrev = '' }

  final(sp: string, t: string): void {
    if (sp !== this.speaker && this.text && !this.text.endsWith('\n')) this.text += '\n'
    this.speaker = sp
    this.text += t
  }

  /**
   * 未定稿里换了人：现在就另起一行，别等定稿时整段跳下去。和**前一个 token** 比（未定稿的头一个就和定稿的
   * 最后一个比）—— 上一个人的尾巴还没定稿、下一个人已经开口，是抢话时的常态，只看头一个 token 会漏掉
   */
  nonFinal(sp: string, t: string): void {
    const all = this.text + this.nf
    if (!this.nf) this.nfFirst = sp
    if (all && !all.endsWith('\n') && sp !== (this.nf ? this.nfPrev : this.speaker)) this.nf += '\n'
    this.nfPrev = sp
    this.nf += t
  }

  /** 只留最后 max 个字，返回砍掉了多少 */
  trim(max: number): number {
    const over = this.text.length - max
    if (over <= 0) return 0
    this.text = this.text.slice(over)
    return over
  }

  reset(): void { this.text = ''; this.speaker = ''; this.begin() }
}

type Side = 'src' | 'dst'

export class Captions {
  /** 译文目标语言；别人直接说目标语言时（translation_status=none 且 language 相同）归到译文那栏 */
  target = ''
  /**
   * 别人直接说目标语言的话，**眼镜上**不显示（本来就听得懂）。手机上照常保留 —— 手机那份是完整记录。
   * 只在 target 非空时起作用
   */
  hideTargetSpeech = false
  /** 最近一次有定稿内容到达的时间 */
  lastAt = 0

  // ── 两份：手机上的（完整）和眼镜上的 ──
  // 眼镜那份比手机那份少两样：被「不显示目标语言」藏掉的话，和自动清屏之前的内容。
  // 各自按说话人换行，所以是各存一份，不是从一份里过滤出来的 —— 藏掉一句之后前后两句是不是同一个人，两边答案不一样。
  private phone: Record<Side, Stream> = { src: new Stream(), dst: new Stream() }
  private glass: Record<Side, Stream> = { src: new Stream(), dst: new Stream() }
  /** 眼镜从哪儿开始显示（自动清屏只是把它挪到末尾，不删数据） */
  private cut: Record<Side, number> = { src: 0, dst: 0 }
  /** 清屏那一刻眼镜上还挂着的未定稿文字。服务端下次原样再发来时，不该把刚清的屏又填回去 */
  private staleNf = ''
  /** 插进手机字幕里的备注（AI 的回答）：只在手机那份里出现 */
  private notes: { side: Side; pos: number; text: string }[] = []

  feed(res: SonioxResponse): void {
    for (const k of ['src', 'dst'] as Side[]) { this.phone[k].begin(); this.glass[k].begin() }
    for (const t of res.tokens) {
      if (CONTROL.test(t.text)) continue   // <end> <fin> 等控制 token 不是内容
      const inTarget = t.translation_status === 'none' && !!this.target && t.language === this.target
      const side: Side = t.translation_status === 'translation' || inTarget ? 'dst' : 'src'
      const sp = t.speaker ?? ''
      const onGlasses = !(this.hideTargetSpeech && inTarget)
      if (t.is_final) {
        // 给 AI 用的那份记录：所有人说的原话（译文不要），不管眼镜上藏没藏、清没清
        if (t.translation_status !== 'translation') this.logFinal(sp, t.text)
        this.phone[side].final(sp, t.text)
        if (onGlasses) this.glass[side].final(sp, t.text)
        this.lastAt = Date.now()
      } else {
        this.phone[side].nonFinal(sp, t.text)
        if (onGlasses) this.glass[side].nonFinal(sp, t.text)
      }
    }
    for (const k of ['src', 'dst'] as Side[]) {
      const over = this.phone[k].trim(PHONE_MAX)
      if (over) this.notes = this.notes.map((n) => (n.side === k ? { ...n, pos: n.pos - over } : n)).filter((n) => n.pos >= 0)
      this.cut[k] = Math.max(0, this.cut[k] - this.glass[k].trim(MAX))
    }
    // 清屏时挂着的那半句有了变化（定稿了，或者接着往下说了）：不再藏
    if (this.staleNf && this.nfSig() !== this.staleNf) this.staleNf = ''
  }

  private nfSig(): string { return this.glass.src.nf.trim() + '|' + this.glass.dst.nf.trim() }

  // 流里的每个 '\n' 都是换人，所以每行行首加记号
  /** 手机上的原文：完整的，带插入的备注 */
  srcText(): string { return this.phoneText('src') }
  /** 手机上的译文：完整的，带插入的备注 */
  dstText(): string { return this.phoneText('dst') }
  /** 眼镜上的原文：上次清屏之后的，不含被藏掉的话 */
  screenSrc(): string { return this.glassText('src') }
  /** 眼镜上的译文：上次清屏之后的，不含被藏掉的话 */
  screenDst(): string { return this.glassText('dst') }

  private glassText(k: Side): string {
    const s = this.glass[k]
    return turns((s.text.slice(this.cut[k]) + (this.staleNf ? '' : s.nf)).replace(/^\n/, ''))
  }

  private phoneText(k: Side): string {
    const s = this.phone[k]
    const ns = this.notes.filter((n) => n.side === k)
    if (!ns.length) return turns(s.text + s.nf)
    const out: string[] = []
    let at = 0
    for (const n of ns) {
      const seg = turns(s.text.slice(at, n.pos).replace(/^\n/, ''))
      if (seg) out.push(seg)
      out.push(n.text)
      at = n.pos
    }
    const rest = turns((s.text.slice(at) + s.nf).replace(/^\n/, ''))
    if (rest) out.push(rest)
    return out.join('\n')
  }

  /** 在手机字幕的当前位置插一段备注（AI 的回答）。side：插在原文那栏还是译文那栏 */
  note(side: Side, text: string): void {
    this.notes.push({ side, pos: this.phone[side].text.length, text })
  }

  /**
   * 清眼镜。**所有的「清」都是这一个**：自动清屏、手机上的清屏按钮、眼镜菜单里的清屏、暂停后继续。
   * 手机上那份不动 —— 没有清手机记录的操作，退出重进才从头开始
   */
  clearScreen(): void {
    this.cut = { src: this.glass.src.text.length, dst: this.glass.dst.text.length }
    this.staleNf = this.glass.src.nf || this.glass.dst.nf ? this.nfSig() : ''
  }


  // ── 最近一段对话（发给 AI 的上下文）──
  // 和屏幕上那两份分开存：屏幕会被清掉，而「刚才那人问了什么」往往正是清屏之后才想问的。
  // 范围怎么定：**一段对话＝中间没有超过 LOG_GAP_MS 的停顿**。停了这么久再有人开口，算新的一段，旧的丢掉；
  // 一段之内最多留 LOG_MAX 个字（只留末尾）。取的时候再按 max 截一次。
  private log = ''
  private logSpeaker = ''
  private logAt = 0

  private logFinal(speaker: string, text: string): void {
    const now = Date.now()
    if (now - this.logAt > LOG_GAP_MS) { this.log = ''; this.logSpeaker = '' }
    this.logAt = now
    if (speaker !== this.logSpeaker && this.log && !this.log.endsWith('\n')) this.log += '\n'
    this.logSpeaker = speaker
    this.log += text
    if (this.log.length > LOG_MAX) this.log = this.log.slice(-LOG_MAX)
  }

  /** 最近一段对话的原话，加上还没定稿的那半句；每个人开口的一行行首带「• 」。超过 max 个字只留末尾（从整行开始） */
  recent(max = 800): string {
    const stale = Date.now() - this.logAt > LOG_GAP_MS
    const log = stale ? '' : this.log
    // 未定稿的半句接在后面。它自带的换行是照手机那份原文流算的，这里的最后一句不一定是那一份的最后一句，说话人重新比一次
    const nf = this.phone.src.nf.replace(/^\n/, '')
    const gap = log && nf && !log.endsWith('\n') && this.phone.src.nfFirst !== this.logSpeaker ? '\n' : ''
    let s = turns(log + gap + nf)
    if (s.length > max) {
      s = s.slice(-max)
      const nl = s.indexOf('\n')
      if (nl >= 0 && nl < s.length - 1) s = s.slice(nl + 1)
    }
    return s
  }
}
