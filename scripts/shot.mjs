// 眼镜截图，压到黑底再存盘。
//
//   node scripts/shot.mjs [自动化端口] [输出文件] [--raw]
//
// 黑底版只给人看。**上传商店的截图一律加 --raw**（透明底），黑底会被审核退回。
//
// 为什么要压：眼镜画面是**透视显示**，99% 的像素 alpha=0。看图器（和读图的
// 工具）把 alpha=0 画成白色，而亮字本身也接近白 —— 结果是一片空白，
// 和实际观感完全相反。根 CLAUDE.md 记过「别拿截图工具看」，这个脚本是解法：
// 合成到黑底之后，看到的就是眼镜里实际看到的样子。
//
// 依赖只有 node 内置的 zlib，不装任何图像库。
import fs from 'node:fs'
import zlib from 'node:zlib'

const CRC = (() => {
  const t = new Int32Array(256)
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    t[n] = c
  }
  return (buf) => {
    let c = -1
    for (const b of buf) c = t[(c ^ b) & 0xff] ^ (c >>> 8)
    return (c ^ -1) >>> 0
  }
})()

const chunk = (type, data) => {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length)
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data])
  const crc = Buffer.alloc(4); crc.writeUInt32BE(CRC(body))
  return Buffer.concat([len, body, crc])
}

const raw_ = process.argv.includes('--raw')
const args = process.argv.slice(2).filter((a) => a !== '--raw')
const port = args[0] ?? '9898'
const dest = args[1] ?? 'shot.png'
const res = await fetch(`http://127.0.0.1:${port}/api/screenshot/glasses`)
if (!res.ok) throw new Error(`模拟器没应答（HTTP ${res.status}）—— 自动化端口对吗？`)
const src = Buffer.from(await res.arrayBuffer())

// --raw：原样存 RGBA（透明底）。**商店截图必须用这个** —— 审核明确拒收黑底，
// 要求与官方模拟器截图按钮的产物一致（透明底，商店自己铺背景）。
// 实测被拒过一次（joplin-reader，2026-09）。
if (raw_) {
  fs.writeFileSync(dest, src)
  console.log(`${dest}  原样 RGBA（透明底，商店用）`)
  process.exit(0)
}
let p = 8, w = 0, h = 0, bitDepth = 0, color = 0
const idat = []
while (p < src.length) {
  const len = src.readUInt32BE(p)
  const type = src.toString('ascii', p + 4, p + 8)
  const data = src.subarray(p + 8, p + 8 + len)
  if (type === 'IHDR') {
    w = data.readUInt32BE(0); h = data.readUInt32BE(4)
    bitDepth = data[8]; color = data[9]
    if (data[12] !== 0) throw new Error('interlaced PNG は未対応')
  } else if (type === 'IDAT') idat.push(data)
  p += 12 + len
}
if (bitDepth !== 8 || (color !== 6 && color !== 2)) {
  throw new Error(`未対応: bitDepth=${bitDepth} colorType=${color}`)
}
const ch = color === 6 ? 4 : 3
const raw = zlib.inflateSync(Buffer.concat(idat))
const stride = w * ch
const px = Buffer.alloc(h * stride)

// アンフィルタ（PNG の 5 種類）
for (let y = 0; y < h; y++) {
  const f = raw[y * (stride + 1)]
  const line = raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1))
  for (let x = 0; x < stride; x++) {
    const a = x >= ch ? px[y * stride + x - ch] : 0
    const b = y > 0 ? px[(y - 1) * stride + x] : 0
    const c = x >= ch && y > 0 ? px[(y - 1) * stride + x - ch] : 0
    let v = line[x]
    if (f === 1) v += a
    else if (f === 2) v += b
    else if (f === 3) v += (a + b) >> 1
    else if (f === 4) {
      const pp = a + b - c, pa = Math.abs(pp - a), pb = Math.abs(pp - b), pc = Math.abs(pp - c)
      v += pa <= pb && pa <= pc ? a : pb <= pc ? b : c
    }
    px[y * stride + x] = v & 0xff
  }
}

// 黒に合成して RGB で書き戻す
let lit = 0
const out = Buffer.alloc(h * (w * 3 + 1))
for (let y = 0; y < h; y++) {
  out[y * (w * 3 + 1)] = 0
  for (let x = 0; x < w; x++) {
    const s = y * stride + x * ch
    const a = ch === 4 ? px[s + 3] / 255 : 1
    if (a > 0) lit++
    const d = y * (w * 3 + 1) + 1 + x * 3
    for (let k = 0; k < 3; k++) out[d + k] = Math.round(px[s + k] * a)
  }
}
const ihdr = Buffer.alloc(13)
ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4)
ihdr[8] = 8; ihdr[9] = 2
fs.writeFileSync(dest, Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(out)), chunk('IEND', Buffer.alloc(0)),
]))
console.log(`${dest}  ${w}x${h}  点灯 ${lit} px (${(lit / (w * h) * 100).toFixed(1)}%)`)
