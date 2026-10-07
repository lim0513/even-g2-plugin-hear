// Soniox 实时 token 流 → 眼镜上的字幕 + 手机上的记录。纯逻辑，不依赖 SDK。
//
// 两份东西，形状不一样：
//
//   眼镜：两条连续滚动的文本（原文 / 译文），只在换人时换行。屏幕只有九行，要的是「现在在说什么」。
//         自动清屏、「不显示目标语言」只影响这一份。
//   手机：一段一段的记录，**一个人的一段发言里，原话在上、译文在下**（和 meeting-notes 的记录同一种排法）。
//         原先手机上也是原文一栏、译文一栏，两栏各滚各的，对不上哪句译的是哪句（用户实测）。
//         这一份在本次打开期间不清。
//
// 未定稿的 token 每次响应整组重发，显示时接在定稿文本后面。

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
 * 眼镜上每个人开口的那一行，行首的记号。换人只换行的话，上一个人的话正好写满一行时
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
}

type Side = 'src' | 'dst'

/**
 * 手机记录里的一段。
 *   say：一个人连着说的一段话 —— src 原话，dst 它的译文（没开翻译时 dst 为空；别人直接说目标语言时只有 dst）
 *   ai： 插进来的 AI 回答
 */
export type Item =
  | { kind: 'say'; src: string; dst: string }
  | { kind: 'ai'; text: string }

/** 手机记录内部用的一段发言 */
type Seg = {
  speaker: string
  src: string
  dst: string
  nfSrc: string
  nfDst: string
  /** 后面插了 AI 回答：这个人接着说的话另起一段，排在回答后面 */
  closed: boolean
  /** 这段话最后一次有定稿的原话进来的时刻 */
  lastAt: number
}

/**
 * 同一个人停了这么久再开口，算新的一段发言。不分的话，一个人隔几分钟说一句，全都堆在同一块里，
 * 原话一大段、译文一大段，又对不上了。译文是按说话人往回找最后一段的：它跟在原话定稿之后一两秒内就到，
 * 早于新段开出来的时候，所以一般不会被分到新段里去。
 * 原先是 10 秒，用户嫌太长；再短（两三秒以内）就会和译文到达的时间撞上，上一段的译文会落到新段里
 */
const SEG_GAP_MS = 4_000

export class Captions {
  /** 译文目标语言；别人直接说目标语言时（translation_status=none 且 language 相同）归到译文那边 */
  target = ''
  /**
   * 别人直接说目标语言的话，**眼镜上**不显示（本来就听得懂）。手机上照常保留 —— 手机那份是完整记录。
   * 只在 target 非空时起作用
   */
  hideTargetSpeech = false
  /** 最近一次有定稿内容到达的时间 */
  lastAt = 0

  // ── 眼镜：两条流 ──
  private glass: Record<Side, Stream> = { src: new Stream(), dst: new Stream() }
  /** 眼镜从哪儿开始显示（清屏只是把它挪到末尾，不删数据） */
  private cut: Record<Side, number> = { src: 0, dst: 0 }
  /** 清屏那一刻眼镜上还挂着的未定稿文字。服务端下次原样再发来时，不该把刚清的屏又填回去 */
  private staleNf = ''

  // ── 手机：一段一段的发言 ──
  private segs: (Seg | { ai: string })[] = []
  /**
   * 未定稿里、说话人和现有段对不上的那部分。实时模式下未定稿 token 的说话人会短暂跳变（官方文档明说），
   * 让它们也开新段的话，一个闪过又消失的 token 会把同一个人的一句话切成两段（meeting-notes 实测过）。
   * 所以**只有定稿 token 才开新段**，跳变的未定稿只作为临时的尾巴显示
   */
  private pending: { speaker: string; src: string; dst: string }[] = []
  /** 这次响应里未定稿的原话（所有人的），给 recent() 用 */
  private nfParts: { sp: string; text: string }[] = []

  /**
   * segment：Soniox 的第几条连接。**每条新连接的说话人编号都从 1 重新开始**，所以说话人的键要带上它，
   * 否则重连之后的「1」会被当成重连之前的「1」（很可能是另一个人）
   */
  feed(res: SonioxResponse, segment = 0): void {
    for (const k of ['src', 'dst'] as Side[]) this.glass[k].begin()
    this.nfParts = []
    for (const s of this.segs) if (!('ai' in s)) { s.nfSrc = ''; s.nfDst = '' }
    this.pending = []
    for (const t of res.tokens) {
      if (CONTROL.test(t.text)) continue   // <end> <fin> 等控制 token 不是内容
      const sp = `${segment}.${t.speaker ?? ''}`
      const isTr = t.translation_status === 'translation'
      const inTarget = t.translation_status === 'none' && !!this.target && t.language === this.target
      const side: Side = isTr || inTarget ? 'dst' : 'src'
      const onGlasses = !(this.hideTargetSpeech && inTarget)
      if (t.is_final) {
        // 给 AI 用的那份记录：所有人说的原话（译文不要），不管眼镜上藏没藏、清没清
        if (!isTr) this.logFinal(sp, t.text)
        if (onGlasses) this.glass[side].final(sp, t.text)
        this.segFor(sp, isTr, true)![side] += t.text
        this.lastAt = Date.now()
      } else {
        if (!isTr) this.nfParts.push({ sp, text: t.text })
        if (onGlasses) this.glass[side].nonFinal(sp, t.text)
        const seg = this.segFor(sp, isTr, false)
        if (seg) seg[side === 'src' ? 'nfSrc' : 'nfDst'] += t.text
        else {
          let p = this.pending.find((x) => x.speaker === sp)
          if (!p) { p = { speaker: sp, src: '', dst: '' }; this.pending.push(p) }
          p[side] += t.text
        }
      }
    }
    for (const k of ['src', 'dst'] as Side[]) this.cut[k] = Math.max(0, this.cut[k] - this.glass[k].trim(MAX))
    this.trimSegs()
    // 清屏时挂着的那半句有了变化（定稿了，或者接着往下说了）：不再藏
    if (this.staleNf && this.nfSig() !== this.staleNf) this.staleNf = ''
  }

  /**
   * 手机记录：这个 token 落到哪一段发言（和 meeting-notes 的 Transcript.current 同一套规则）。
   *   说的话：接在最后一段后面，前提是同一个人、并且那段后面没插过 AI 回答；否则另起一段
   *   译文：  可能在换人之后才到，所以按说话人往回找他的最后一段
   * allowNew：只有定稿 token 才允许开新段
   */
  private segFor(sp: string, isTr: boolean, allowNew: boolean): Seg | null {
    if (isTr) {
      for (let i = this.segs.length - 1; i >= 0; i--) {
        const s = this.segs[i]
        if (!('ai' in s) && s.speaker === sp) return s
      }
    }
    const now = Date.now()
    const last = this.segs[this.segs.length - 1]
    if (last && !('ai' in last) && last.speaker === sp && !last.closed) {
      // 同一个人隔了很久才又开口：另起一段。未定稿的字不算数（allowNew 为假时接在旧段后面当临时尾巴，
      // 等它定稿时再按这里的规则落位），免得一个闪过的未定稿 token 把段切开
      if (!allowNew || now - last.lastAt <= SEG_GAP_MS) { if (allowNew) last.lastAt = now; return last }
    }
    if (!allowNew) return null
    const seg: Seg = { speaker: sp, src: '', dst: '', nfSrc: '', nfDst: '', closed: false, lastAt: now }
    this.segs.push(seg)
    return seg
  }

  private trimSegs(): void {
    const size = (s: Seg | { ai: string }) => ('ai' in s ? s.ai.length : s.src.length + s.dst.length)
    let total = 0
    for (const s of this.segs) total += size(s)
    while (total > PHONE_MAX && this.segs.length > 1) total -= size(this.segs.shift()!)
  }

  /** 手机上的记录：一段一段的发言，原话和译文在一起，中间夹着 AI 的回答。本次打开期间不清 */
  items(): Item[] {
    const out: Item[] = []
    for (const s of this.segs) {
      if ('ai' in s) { out.push({ kind: 'ai', text: s.ai }); continue }
      const src = (s.src + s.nfSrc).trim()
      const dst = (s.dst + s.nfDst).trim()
      if (src || dst) out.push({ kind: 'say', src, dst })
    }
    for (const p of this.pending) {
      const src = p.src.trim()
      const dst = p.dst.trim()
      if (src || dst) out.push({ kind: 'say', src, dst })
    }
    return out
  }

  /** 在手机记录的当前位置插一段 AI 的回答。前面那段发言就此收尾，同一个人接着说的话排在回答后面 */
  note(text: string): void {
    for (const s of this.segs) if (!('ai' in s)) s.closed = true
    this.segs.push({ ai: text })
  }

  // ── 眼镜 ──

  private nfSig(): string { return this.glass.src.nf.trim() + '|' + this.glass.dst.nf.trim() }

  /** 眼镜上的原文：上次清屏之后的，不含被藏掉的话 */
  screenSrc(): string { return this.glassText('src') }
  /** 眼镜上的译文：上次清屏之后的，不含被藏掉的话 */
  screenDst(): string { return this.glassText('dst') }

  private glassText(k: Side): string {
    const s = this.glass[k]
    return turns((s.text.slice(this.cut[k]) + (this.staleNf ? '' : s.nf)).replace(/^\n/, ''))
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
  // 和上面两份分开存。范围怎么定：**一段对话＝中间没有超过 LOG_GAP_MS 的停顿**。停了这么久再有人开口，
  // 算新的一段，旧的丢掉；一段之内最多留 LOG_MAX 个字（只留末尾）。取的时候再按 max 截一次。
  //
  // 每一行带说话人（S1、S2…，按第一次开口的先后编号）。画面上不显示是谁，只用它换行；
  // 但「这两句是同一个人说的」「这句是另一个人答的」对理解对话很要紧，所以给 AI 的这份带上。
  private log: { sp: string; text: string }[] = []
  private logLen = 0
  private logAt = 0
  private speakerNo = new Map<string, number>()

  private label(sp: string): string {
    let n = this.speakerNo.get(sp)
    if (n === undefined) { n = this.speakerNo.size + 1; this.speakerNo.set(sp, n) }
    return `S${n}`
  }

  private logFinal(sp: string, text: string): void {
    const now = Date.now()
    if (now - this.logAt > LOG_GAP_MS) { this.log = []; this.logLen = 0 }
    this.logAt = now
    const last = this.log[this.log.length - 1]
    if (last && last.sp === sp) last.text += text
    else this.log.push({ sp, text })
    this.logLen += text.length
    // 超了从最前面丢：先丢整行，只剩一行还超就截这一行的开头
    while (this.logLen > LOG_MAX && this.log.length > 1) this.logLen -= this.log.shift()!.text.length
    if (this.logLen > LOG_MAX) { this.log[0].text = this.log[0].text.slice(-LOG_MAX); this.logLen = this.log[0].text.length }
  }

  /**
   * 最近一段对话的原话，加上还没定稿的那半句。一个人连着说的话一行，行首是「S1: 」这样的说话人记号。
   * 超过 max 个字只留末尾（从整行开始）
   */
  recent(max = 800): string {
    const stale = Date.now() - this.logAt > LOG_GAP_MS
    const parts: { sp: string; text: string }[] = []
    for (const p of [...(stale ? [] : this.log), ...this.nfParts]) {
      const last = parts[parts.length - 1]
      if (last && last.sp === p.sp) last.text += p.text
      else parts.push({ sp: p.sp, text: p.text })
    }
    const NL = String.fromCharCode(10)
    let out = parts.filter((p) => p.text.trim()).map((p) => `${this.label(p.sp)}: ${p.text.trim()}`).join(NL)
    if (out.length > max) {
      out = out.slice(-max)
      const nl = out.indexOf(NL)
      if (nl >= 0 && nl < out.length - 1) out = out.slice(nl + 1)
    }
    return out
  }
}
