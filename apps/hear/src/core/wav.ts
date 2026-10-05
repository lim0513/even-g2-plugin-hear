// PCM 工具。纯逻辑，可单测。眼镜/手机麦都是 16 kHz、s16le、单声道。
export const SAMPLE_RATE = 16000
export const BYTES_PER_SEC = SAMPLE_RATE * 2   // 32 KB/s ≈ 115 MB/小时

export const durationMs = (bytes: number) => Math.round(bytes / BYTES_PER_SEC * 1000)

/** 44 字节 WAV 头。导出时拼在 PCM 前面，任何播放器都能开 */
export function wavHeader(pcmBytes: number, sampleRate = SAMPLE_RATE): Uint8Array {
  const h = new DataView(new ArrayBuffer(44))
  const str = (o: number, s: string) => { for (let i = 0; i < s.length; i++) h.setUint8(o + i, s.charCodeAt(i)) }
  str(0, 'RIFF'); h.setUint32(4, 36 + pcmBytes, true); str(8, 'WAVE')
  str(12, 'fmt '); h.setUint32(16, 16, true); h.setUint16(20, 1, true); h.setUint16(22, 1, true)
  h.setUint32(24, sampleRate, true); h.setUint32(28, sampleRate * 2, true); h.setUint16(32, 2, true); h.setUint16(34, 16, true)
  str(36, 'data'); h.setUint32(40, pcmBytes, true)
  return new Uint8Array(h.buffer)
}

/** 一帧的 RMS（0–32767）。粗略的人声检测用，不需要精确 VAD */
export function rms(pcm: Uint8Array): number {
  const n = pcm.byteLength >> 1
  if (!n) return 0
  const v = new DataView(pcm.buffer, pcm.byteOffset, n * 2)
  let acc = 0
  for (let i = 0; i < n; i++) { const s = v.getInt16(i * 2, true); acc += s * s }
  return Math.sqrt(acc / n)
}

/**
 * 宿主送来的 audioPcm 可能不是 Uint8Array：SDK 注释说经 JSON 后"多为 number[] 或
 * base64 字符串"。统一成 Uint8Array。
 */
export function toPcm(raw: unknown): Uint8Array | null {
  if (raw instanceof Uint8Array) return raw
  if (raw instanceof ArrayBuffer) return new Uint8Array(raw)
  if (Array.isArray(raw)) return Uint8Array.from(raw as number[])
  if (typeof raw === 'string' && raw.length) {
    try {
      const bin = atob(raw)
      const out = new Uint8Array(bin.length)
      for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i)
      return out
    } catch { return null }
  }
  return null
}
