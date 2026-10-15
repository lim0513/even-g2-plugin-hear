// 验证「识别 → 翻译 → 朗读」全用 Soniox 时的延迟。不用眼镜、不用手机，在电脑上用 Node 跑。
//
//   node tools/sts-latency.mjs <音频.wav> [--to zh] [--from ja] [--voice Adrian] [--mode stream|sentence] [--env 路径] [--out 文件夹]
//
// 做的事：
//   1. 把 wav（16 kHz、单声道、16 位）按真实说话的速度一块块送进 Soniox 实时识别 + 单向翻译（和 hear 一样的模型和设置）；
//   2. 译文接到 Soniox 实时语音合成（tts-rt-v2），一句话开一个 stream；
//   3. 每句话记下：对方说完的时刻、译文开始定下来、这句结束（<end>）、合成出第一个音、合成的音有多长；
//   4. 再按「一句念完才念下一句」模拟播放，算出每句真正开始念的时候已经落后多少；
//   5. 合成出来的声音存成 wav，可以自己听。
//
// --mode stream    译文一定下来就送去合成（不等整句），延迟最低
// --mode sentence  等这句话结束（<end>），把整句译文一次送去合成，声音更连贯
//
// Key：环境变量 SONIOX_API_KEY，或 --env 指向的 .env 文件里的 SONIOX_API_KEY。不打印 Key。
import fs from 'node:fs'
import path from 'node:path'

const args = process.argv.slice(2)
const opt = (name, def) => { const i = args.indexOf('--' + name); return i >= 0 ? args[i + 1] : def }
const wavPath = args.find((a, i) => !a.startsWith('--') && (i === 0 || !args[i - 1].startsWith('--')))
if (!wavPath) { console.log('用法: node tools/sts-latency.mjs <音频.wav> [--to zh] [--from ja] [--voice Adrian] [--mode stream|sentence] [--env 路径] [--out 文件夹]'); process.exit(2) }
// --speed 0.7–1.3：合成的语速；--epdelay 500–3000：端点检测最多等多久算说完；--trim：去掉合成开头结尾的静音
const SPEED = Number(opt('speed', '1')), EPDELAY = Number(opt('epdelay', '0')), TRIM = args.includes('--trim')
const TO = opt('to', 'zh'), FROM = opt('from', 'ja'), VOICE = opt('voice', 'Adrian'), MODE = opt('mode', 'stream')
const OUT = opt('out', path.join(path.dirname(wavPath), 'sts-out'))
const TTS_RATE = 24000

function readKey() {
  if (process.env.SONIOX_API_KEY) return process.env.SONIOX_API_KEY.trim()
  const env = opt('env', '.env')
  if (fs.existsSync(env)) for (const line of fs.readFileSync(env, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*SONIOX_API_KEY\s*=\s*(.*)$/)
    if (m) return m[1].trim().replace(/^["']|["']$/g, '')
  }
  console.log('没有 Soniox Key：设 SONIOX_API_KEY，或用 --env 指向 .env'); process.exit(2)
}
const KEY = readKey()

// ── 读 wav ──
const wav = fs.readFileSync(wavPath)
const dataAt = wav.indexOf('data') + 8
const rate = wav.readUInt32LE(24), channels = wav.readUInt16LE(22), bits = wav.readUInt16LE(34)
if (rate !== 16000 || channels !== 1 || bits !== 16) { console.log(`要 16 kHz / 单声道 / 16 位的 wav，这个是 ${rate} Hz / ${channels} 声道 / ${bits} 位`); process.exit(2) }
const pcm = wav.subarray(dataAt)
const audioMs = pcm.length / 32

const now = () => performance.now()
let t0 = 0   // 第一块声音发出去的时刻。之后按真实速度发，所以「音频里第 x 毫秒」≈ 墙钟 t0 + x
const log = (...a) => console.log(((now() - t0) / 1000).toFixed(2).padStart(6) + 's', ...a)

// ── 每一句 ──
const utts = []
let cur = null
function current() {
  if (!cur) { cur = { n: utts.length + 1, src: '', dst: '', srcEndMs: 0, firstDst: 0, endAt: 0, sentText: '', streamOpen: false, firstAudio: 0, audio: {}, open: 0, doneAt: 0, clause: '', k: 0 }; utts.push(cur) }
  return cur
}

// ── 合成：一条连接，一句一个 stream ──
const tts = new WebSocket('wss://tts-rt.soniox.com/tts-websocket', ['soniox-api-key', KEY])
const ttsReady = new Promise((ok, bad) => { tts.onopen = ok; tts.onerror = (e) => bad(new Error('连不上合成服务: ' + (e.message || e.type))) })
const byStream = new Map()
tts.onmessage = (ev) => {
  const m = JSON.parse(ev.data)
  const u = byStream.get(m.stream_id)
  if (m.error_code) { log('合成报错', m.stream_id, m.error_code, m.error_message); if (u) u.doneAt = now(); return }
  if (!u) return
  if (m.audio) { if (!u.firstAudio) { u.firstAudio = now(); log(`#${u.n} 合成出第一个音`) } (u.audio[m.stream_id] ??= []).push(Buffer.from(m.audio, 'base64')) }
  if (m.terminated && --u.open <= 0) u.doneAt = now()
}
function openStream(u, id = 'u' + u.n) {
  if (u.streamOpen && id === 'u' + u.n) return
  u.streamOpen = true
  u.open++
  byStream.set(id, u)
  tts.send(JSON.stringify({ stream_id: id, model: 'tts-rt-v2', language: TO, voice: VOICE, audio_format: 'pcm_s16le', sample_rate: TTS_RATE, ...(SPEED !== 1 ? { speed: SPEED } : {}), ...(TRIM ? { reduce_silence: true } : {}) }))
}
// --mode clause：译文一出现分句的标点（，。？！）就把这一段单独开一个 stream 送去念，不等对方把整句说完
const CLAUSE_END = /[，。？！、,.?!；;]$/
function sendClause(u, text) {
  text = text.trim()
  if (!text) return
  const id = 'u' + u.n + 'c' + ++u.k
  openStream(u, id)
  tts.send(JSON.stringify({ stream_id: id, text, text_end: true }))
  u.sentText += text
}
function sendText(u, text, end) {
  openStream(u)
  if (!text && !end) return
  tts.send(JSON.stringify({ stream_id: 'u' + u.n, text, text_end: end }))
  u.sentText += text
}
// 两句之间没话可说的时候连接会被关掉：隔一会儿发一次保活
const keepalive = setInterval(() => { try { tts.send(JSON.stringify({ keep_alive: true })) } catch {} }, 15000)

// ── 识别 + 翻译 ──
const stt = new WebSocket('wss://stt-rt.soniox.com/transcribe-websocket', ['soniox-api-key', KEY])
let sttClosed
const sttDone = new Promise((ok) => { sttClosed = ok })
// 连上的事件可能在等合成连接的时候就来了：现在就接住
const sttReady = new Promise((ok, bad) => { stt.onopen = ok; setTimeout(() => bad(new Error('连不上识别服务')), 10000) })
stt.onclose = (e) => { if (e.code !== 1000) log('识别连接关了', e.code, e.reason); sttClosed() }
stt.onerror = (e) => log('识别连接出错', e.message || e.type)
stt.onmessage = (ev) => {
  const m = JSON.parse(ev.data)
  if (m.error_code) { log('识别报错', m.error_code, m.error_message); return }
  for (const t of m.tokens || []) {
    if (!t.is_final) continue
    if (t.text === '<end>') {
      const u = current()
      u.endAt = now()
      log(`#${u.n} 这句结束  原话「${u.src.trim()}」  译文「${u.dst.trim()}」`)
      if (MODE === 'sentence') sendText(u, u.dst.trim(), true)
      else if (MODE === 'clause') { sendClause(u, u.clause); u.clause = '' }
      else sendText(u, '', true)
      cur = null
      continue
    }
    const u = current()
    if (t.translation_status === 'translation') {
      if (!u.firstDst) u.firstDst = now()
      u.dst += t.text
      if (MODE === 'stream') sendText(u, t.text, false)
      if (MODE === 'clause') { u.clause += t.text; if (CLAUSE_END.test(u.clause.trim()) && u.clause.trim().length >= 3) { sendClause(u, u.clause); u.clause = '' } }
    } else {
      u.src += t.text
      if (t.end_ms) u.srcEndMs = Math.max(u.srcEndMs, t.end_ms)
    }
  }
  if (m.finished) stt.close(1000)
}

await ttsReady
await sttReady
stt.send(JSON.stringify({
  model: 'stt-rt-v5', audio_format: 'pcm_s16le', sample_rate: 16000, num_channels: 1,
  language_hints: [FROM], enable_endpoint_detection: true, ...(EPDELAY ? { max_endpoint_delay_ms: EPDELAY } : {}),
  translation: { type: 'one_way', target_language: TO },
}))
console.log(`音频 ${(audioMs / 1000).toFixed(1)} 秒，${FROM} → ${TO}，声音 ${VOICE}，模式 ${MODE}，语速 ${SPEED}，端点等待 ${EPDELAY || '默认'}${TRIM ? '，去静音' : ''}`)
t0 = now()
const CHUNK = 3200   // 100 ms
for (let i = 0; i < pcm.length; i += CHUNK) {
  stt.send(pcm.subarray(i, i + CHUNK))
  const ahead = (i + CHUNK) / 32 - (now() - t0)
  if (ahead > 0) await new Promise((r) => setTimeout(r, ahead))
}
// 后面补 2 秒静音，让最后一句的端点检测走完，再告诉服务端声音完了
for (let i = 0; i < 20; i++) { stt.send(Buffer.alloc(CHUNK)); await new Promise((r) => setTimeout(r, 100)) }
stt.send('')
await Promise.race([sttDone, new Promise((r) => setTimeout(r, 15000))])
if (cur && (cur.src || cur.dst)) { cur.endAt = now(); if (MODE === 'clause') sendClause(cur, cur.clause); else sendText(cur, MODE === 'sentence' ? cur.dst.trim() : '', true); cur = null }
// 等合成全部结束
const deadline = now() + 30000
while (utts.some((u) => u.open > 0 && !u.doneAt) && now() < deadline) await new Promise((r) => setTimeout(r, 100))
clearInterval(keepalive)
tts.close()

// ── 结果 ──
fs.mkdirSync(OUT, { recursive: true })
const wavHeader = (bytes) => {
  const h = Buffer.alloc(44)
  h.write('RIFF', 0); h.writeUInt32LE(36 + bytes, 4); h.write('WAVE', 8); h.write('fmt ', 12)
  h.writeUInt32LE(16, 16); h.writeUInt16LE(1, 20); h.writeUInt16LE(1, 22); h.writeUInt32LE(TTS_RATE, 24)
  h.writeUInt32LE(TTS_RATE * 2, 28); h.writeUInt16LE(2, 32); h.writeUInt16LE(16, 34); h.write('data', 36); h.writeUInt32LE(bytes, 40)
  return h
}
const sec = (ms) => (ms / 1000).toFixed(2)
let playEnd = 0
const rows = []
const all = []
for (const u of utts.filter((x) => x.src.trim() || x.dst.trim())) {
  const spoken = t0 + u.srcEndMs
  const audio = Buffer.concat(Object.keys(u.audio).sort().flatMap((k) => u.audio[k]))
  const lenMs = audio.length / 2 / TTS_RATE * 1000
  // 播放：合成出第一个音就开始念，但上一句没念完要排队
  const start = u.firstAudio ? Math.max(u.firstAudio, playEnd) : 0
  if (u.firstAudio) playEnd = start + lenMs
  rows.push({
    '#': u.n,
    原话: u.src.trim().slice(0, 24),
    译文: u.dst.trim().slice(0, 24),
    '说完→译文开始': u.firstDst ? sec(u.firstDst - spoken) : '-',
    '说完→这句结束': u.endAt ? sec(u.endAt - spoken) : '-',
    '说完→第一个音': u.firstAudio ? sec(u.firstAudio - spoken) : '-',
    '合成的音长': sec(lenMs),
    '说完→真正开始念(排队后)': u.firstAudio ? sec(start - spoken) : '-',
  })
  if (audio.length) {
    fs.writeFileSync(path.join(OUT, `u${u.n}.wav`), Buffer.concat([wavHeader(audio.length), audio]))
    all.push(audio, Buffer.alloc(TTS_RATE * 2 * 0.3))
  }
}
console.log('\n（时间都从「这句原话最后一个字说完」算起，单位秒；负数 = 对方还没说完就已经出来了）')
console.table(rows)
if (all.length) { const b = Buffer.concat(all); fs.writeFileSync(path.join(OUT, 'all.wav'), Buffer.concat([wavHeader(b.length), b])) }
console.log('合成的声音存在 ' + OUT)
process.exit(0)
