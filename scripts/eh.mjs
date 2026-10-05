// Even G2 workspace helper. 被 npm run new / npm run sim 调用。
// 用法: node scripts/eh.mjs <new|sim|list|qr|bump|scaffold|port|wait|check|done> [args]
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import os from 'node:os'
import net from 'node:net'
import { spawn } from 'node:child_process'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const APPS = path.join(ROOT, 'apps')
const DEFAULT_PORT = 5173

const readJson = (p) => JSON.parse(fs.readFileSync(p, 'utf8'))
const writeJson = (p, o) => fs.writeFileSync(p, JSON.stringify(o, null, 2) + '\n')
const appDir = (name) => path.join(APPS, name)
// 拼 Windows 风格路径用于提示（避免源码里出现转义字符）
const W = (...parts) => parts.join(String.fromCharCode(92))

function listApps() {
  if (!fs.existsSync(APPS)) return []
  return fs.readdirSync(APPS, { withFileTypes: true })
    .filter((d) => d.isDirectory() && fs.existsSync(path.join(APPS, d.name, 'package.json')))
    .map((d) => d.name)
}

// 从 vite.config.ts 里读端口，读不到按默认值算
function portOf(name) {
  const cfg = path.join(appDir(name), 'vite.config.ts')
  if (!fs.existsSync(cfg)) return DEFAULT_PORT
  const m = fs.readFileSync(cfg, 'utf8').match(/port:\s*(\d+)/)
  return m ? Number(m[1]) : DEFAULT_PORT
}

// 新工程分配一个没被占用的端口，避免多个工程同时跑时撞车
function nextPort(exclude) {
  const used = new Set(listApps().filter((n) => n !== exclude).map(portOf))
  let p = DEFAULT_PORT
  while (used.has(p)) p += 1
  return p
}

// 根目录实际装着的 SDK 版本；没装就退回一个已知可用的版本
function sdkVersion() {
  const p = path.join(ROOT, 'node_modules', '@evenrealities', 'even_hub_sdk', 'package.json')
  try { return readJson(p).version } catch { return '0.0.15' }
}

// 侧载地址：手机得能连到这台机器，所以必须挑真实的无线/有线网卡。
// 虚拟网卡（VMware / VirtualBox / WSL / Hyper-V）和 VPN 隧道也会出现在列表里，而且
// 经常排在前面 —— 直接取第一个就会给出一个手机连不通的二维码，扫了没反应还查不出原因。
// 实测本机顺序就是：VPN 隧道 → VMnet1 → VMnet8 → WLAN，WLAN 排第四。
const VIRTUAL_NIC = /vmware|virtualbox|vbox|hyper-?v|wsl|docker|loopback|tunnel|tap|zerotier|tailscale/i
const PHYSICAL_NIC = /wlan|wi-?fi|wireless|无线|ethernet|以太网/i

// 返回按"手机连得上的可能性"排好序的候选地址
function lanCandidates(port) {
  const out = []
  for (const [nic, addrs] of Object.entries(os.networkInterfaces())) {
    for (const a of addrs ?? []) {
      if (!a || a.family !== 'IPv4' || a.internal) continue
      let score = 0
      if (VIRTUAL_NIC.test(nic)) score -= 100
      if (PHYSICAL_NIC.test(nic)) score += 50
      if (/^192\.168\./.test(a.address)) score += 10  // 家用/办公路由器最常见的段
      if (/^169\.254\./.test(a.address)) score -= 80  // 自分配地址，说明这口没真连上
      out.push({ nic, address: a.address, url: `http://${a.address}:${port}`, score })
    }
  }
  return out.sort((x, y) => y.score - x.score)
}

function lanUrls(port) {
  return lanCandidates(port).map((c) => c.url)
}

function scaffold(name) {
  if (!/^[a-z0-9][a-z0-9._-]*$/.test(name)) {
    console.error(`工程名 "${name}" 不合法：只能用小写字母、数字、. _ -，且不能以 _ 或 . 开头（npm 的限制）`)
    process.exit(1)
  }
  const dir = appDir(name)
  if (!fs.existsSync(path.join(dir, 'package.json'))) {
    console.error(`找不到 ${W(path.relative(ROOT, dir), 'package.json')}，模板可能没拉下来`)
    process.exit(1)
  }

  const port = nextPort(name)
  const sdk = sdkVersion()

  // package.json：改名、剥掉模板自带的工具依赖（版本比根目录旧，留着会在子目录装一份旧的
  // 把根目录的盖掉）、SDK 对齐根目录实际版本、端口写进脚本
  const pkgPath = path.join(dir, 'package.json')
  const pkg = readJson(pkgPath)
  pkg.name = name
  pkg.private = true
  delete pkg.devDependencies?.['@evenrealities/evenhub-cli']
  delete pkg.devDependencies?.['@evenrealities/evenhub-simulator']
  pkg.dependencies = { ...pkg.dependencies, '@evenrealities/even_hub_sdk': `^${sdk}` }
  // 模板锁的是 vite ^5.4，那个版本线有 high 级漏洞（Windows 上 launch-editor 经 UNC 路径
  // 泄露 NTLMv2 哈希等）。8.x 下 audit 干净，且模板的配置项（host/port/strictPort/
  // build.target）全部照常工作。
  pkg.devDependencies = { ...pkg.devDependencies, vite: '^8.3.0' }
  pkg.scripts = {
    ...pkg.scripts,
    dev: 'vite',
    build: 'tsc --noEmit && vite build',
    preview: 'vite preview',
    pack: 'npm run build && evenhub pack app.json dist',
    // 用 127.0.0.1 不用 localhost：要和真机打包后的 origin 一致，
    // 否则跨源问题在模拟器阶段看不出来（见 sim() 里的说明）
    simulate: `evenhub-simulator http://127.0.0.1:${port}`,
  }
  writeJson(pkgPath, pkg)

  // vite.config.ts：换端口
  const cfgPath = path.join(dir, 'vite.config.ts')
  if (fs.existsSync(cfgPath)) {
    const src = fs.readFileSync(cfgPath, 'utf8')
    // strictPort：端口被占时 vite 直接报错。默认行为是悄悄换一个端口，但模拟器仍按配置里的
    // 端口去连，结果就是模拟器连到别的 server 或空端口上 —— 表现为黑屏，很难排查。
    let next = src.replace(/port:\s*\d+/, `port: ${port}`)
    if (!/strictPort/.test(next)) next = next.replace(/port:\s*\d+/, `port: ${port}, strictPort: true`)
    if (next !== src) fs.writeFileSync(cfgPath, next)
  }

  // app.json：占位 ID 换掉，版本下限对齐 SDK
  const appPath = path.join(dir, 'app.json')
  const notes = []
  if (fs.existsSync(appPath)) {
    const app = readJson(appPath)
    app.package_id = `tech.limeng.${name.replace(/[^a-z0-9]/g, '')}`
    app.name = name
    app.min_sdk_version = sdk
    app.min_app_version = '2.2.10'   // SDK 0.0.15 的下限；换 SDK 版本时 evenhub pack 会提示该改成多少
    writeJson(appPath, app)
    notes.push(`package_id 暂定 ${app.package_id}，发布前改成你自己的`)
  }

  console.log(`已就绪：${W('apps', name)}`)
  console.log(`  端口      ${port}`)
  console.log(`  SDK       ${sdk}`)
  notes.forEach((n) => console.log(`  注意      ${n}`))
}

// 抬版本号。hub 上传时**同一个版本号只能传一次**，重传报"版本已存在"，
// 所以每次打包给别人装之前都得抬一下。package.json 和 app.json 两处必须一致
// （前者进构建产物显示在设置页，后者是包的元数据），分开手改早晚漏一个。
function bump(name, part = 'patch') {
  const dir = appDir(name)
  const files = ['package.json', 'app.json']
    .map((f) => path.join(dir, f))
    .filter((p) => fs.existsSync(p))
  if (!files.length) {
    console.error(`找不到 ${W('apps', name)} 下的 package.json / app.json`)
    process.exit(1)
  }

  const cur = readJson(files[0]).version ?? '0.0.0'
  const m = String(cur).match(/^(\d+)\.(\d+)\.(\d+)$/)
  if (!m) {
    console.error(`当前版本 "${cur}" 不是 x.y.z 格式，evenhub pack 会拒`)
    process.exit(1)
  }
  let [maj, min, pat] = m.slice(1).map(Number)
  if (part === 'major') { maj++; min = 0; pat = 0 }
  else if (part === 'minor') { min++; pat = 0 }
  else pat++
  const next = `${maj}.${min}.${pat}`

  for (const p of files) {
    const j = readJson(p)
    j.version = next
    writeJson(p, j)
  }
  console.log(`${name}: ${cur} -> ${next}`)
  files.forEach((p) => console.log(`  已改 ${W('apps', name, path.basename(p))}`))
}

function done(name) {
  const port = portOf(name)
  console.log(`工程建好了：${W('apps', name)}（端口 ${port}）`)
  console.log('')
  console.log(`  跑起来:   npm run sim -- ${name}`)
  console.log(`  改代码:   ${W('apps', name, 'src', 'main.ts')}`)
  console.log(`  上真机:   node scripts/eh.mjs qr ${name}`)
}

// 打真机侧载的二维码。挑地址这一步单独列出来，是因为选错网卡是侧载最常见的失败原因，
// 而且失败时手机那边只是"扫了没反应"，没有任何报错能指向真正的原因。
function qr(name) {
  const port = portOf(name)
  const cands = lanCandidates(port)
  if (!cands.length) {
    console.error('没找到可用的局域网地址，检查一下网线/WiFi 是不是连着')
    process.exit(1)
  }
  const best = cands[0]
  console.log(`推荐地址：${best.url}   (网卡: ${best.nic})`)
  const rest = cands.slice(1)
  if (rest.length) {
    console.log('')
    console.log('这台机器上的其他地址（手机多半连不上，扫了没反应就换一个试）：')
    rest.forEach((c) => console.log(`  ${c.url}   (网卡: ${c.nic})`))
  }
  console.log('')
  console.log('确认手机和电脑连的是同一个 WiFi，然后跑：')
  console.log(`  npx evenhub qr --url ${best.url}`)
}

async function wait(port) {
  const deadline = Date.now() + 30_000
  process.stdout.write(`等待 dev server (127.0.0.1:${port}) `)
  while (Date.now() < deadline) {
    try {
      const r = await fetch(`http://127.0.0.1:${port}/`, { signal: AbortSignal.timeout(1500) })
      if (r.ok) { console.log('起来了'); return }
    } catch {}
    process.stdout.write('.')
    await new Promise((r) => setTimeout(r, 500))
  }
  console.log('')
  console.error(`30 秒内没等到 localhost:${port}，去 dev server 那个窗口看报错`)
  process.exit(1)
}

// 端口是否已被占用。被占时 run-sim 必须拦住：否则模拟器会连到不相干的 server 上。
function check(port) {
  return new Promise((resolve) => {
    const sock = net.connect({ host: '127.0.0.1', port }, () => { sock.destroy(); resolve(true) })
    sock.on('error', () => resolve(false))
    sock.setTimeout(1200, () => { sock.destroy(); resolve(false) })
  })
}

// ---------- 建工程 ----------
// 原来是 npm run new。改成 Node 的理由：bat 只能在 Windows 跑、必须 CRLF 行尾、
// 中文在 cmd 默认码页下会乱码（所以中文提示本来就得绕道 Node 打印）。
// 真正干活的逻辑一直在这个文件里，bat 只是串一下。
async function create(name, template = 'minimal') {
  if (!name) {
    console.error('用法: npm run new -- <工程名> [模板]')
    console.error('模板: minimal（默认）/ asr / image / text-heavy')
    process.exit(1)
  }
  if (fs.existsSync(appDir(name))) {
    console.error(`${W('apps', name)} 已经存在了`)
    process.exit(1)
  }

  console.log(`\n=== 1/3 拉模板 "${template}" ===`)
  await run('npx', ['--yes', 'degit', `even-realities/evenhub-templates/${template}`, name], { cwd: APPS })

  console.log('\n=== 2/3 打补丁 ===')
  scaffold(name)

  console.log('\n=== 3/3 npm install ===')
  await run('npm', ['install'], { cwd: ROOT })

  console.log('')
  done(name)
}

// ---------- 起 dev server + 模拟器 ----------
// 原来是 npm run sim，用 `start` 开两个 cmd 窗口 —— Windows 专用。
// 改成在当前终端里同时跑两个进程、输出加前缀区分，任何平台都行，Ctrl+C 一起收。
async function sim(name, autoPort) {
  if (!name || !fs.existsSync(path.join(appDir(name), 'package.json'))) {
    console.error(`找不到 ${W('apps', String(name))}`)
    console.log('')
    listCmd()
    process.exit(1)
  }
  const port = portOf(name)

  // 端口被占时必须拦住：vite 起不来（strictPort），但模拟器照样按配置里的端口去连，
  // 于是连到别的 server 上 —— 表现为黑屏，很难查
  if (await check(port)) {
    console.error(`端口 ${port} 被占用了。多半是上次的进程还在。`)
    console.error(`查是谁占的：  netstat -ano | findstr :${port}`)
    process.exit(1)
  }

  const children = []
  const stop = () => { for (const c of children) { try { c.kill() } catch {} } }
  process.on('SIGINT', () => { stop(); process.exit(0) })
  process.on('exit', stop)

  console.log(`启动 dev server: ${name} (端口 ${port})`)
  children.push(spawnTagged('npm', ['run', 'dev', '-w', name], 'vite'))

  await wait(port)

  // **用 127.0.0.1 而不是 localhost**，这一条不是随便选的。
  //
  // 打包后真机上的 origin 是 http://127.0.0.1:<随机端口>（Even App 在手机本地起
  // HTTP 服务跑 .ehpk）。模拟器如果用 localhost，origin 就和真机不一样 ——
  // 而 CORS 比的是**字符串**不是解析结果，两者指向同一个地方也不算数。
  //
  // 实测踩过：Joplin Server 的 CORS 判断有个 bug，任何**不带点**的主机名
  // （localhost、nas）都会被放行，而 127.0.0.1 带点就被拦。于是模拟器一路绿灯、
  // 真机直接 "Load failed"，白查半天。用 127.0.0.1 就能在模拟器阶段暴露出来。
  const args = ['evenhub-simulator', `http://127.0.0.1:${port}`]
  if (autoPort) args.push('--automation-port', String(autoPort))
  console.log(`启动模拟器: ${name}${autoPort ? `（自动化接口 ${autoPort}）` : ''}`)
  console.log(`  加载 http://127.0.0.1:${port} —— 用 127.0.0.1 是为了和真机的 origin 一致`)
  children.push(spawnTagged('npx', args, 'sim'))

  console.log('\nCtrl+C 一起停掉\n')
}

// 子进程输出加前缀，两个进程的日志混在一个终端里也分得清
function spawnTagged(cmd, args, tag) {
  const child = spawn(cmd, args, { cwd: ROOT, shell: true, stdio: ['ignore', 'pipe', 'pipe'] })
  const pipe = (stream) => {
    let buf = ''
    stream.on('data', (d) => {
      buf += d.toString()
      const lines = buf.split('\n')
      buf = lines.pop() ?? ''
      for (const l of lines) if (l.trim()) console.log(`  [${tag}] ${l}`)
    })
  }
  pipe(child.stdout)
  pipe(child.stderr)
  return child
}

function run(cmd, args, opts) {
  return new Promise((resolve, reject) => {
    const c = spawn(cmd, args, { stdio: 'inherit', shell: true, ...opts })
    c.on('close', (code) => (code === 0 ? resolve() : reject(new Error(`${cmd} 退出码 ${code}`))))
  })
}

function listCmd() {
  const apps = listApps()
  if (!apps.length) console.log(`${W('apps', '')} 下还没有工程，先跑: npm run new -- <工程名>`)
  else { console.log('可用的工程：'); apps.forEach((a) => console.log(`  ${a}  (端口 ${portOf(a)})`)) }
}

const [cmd, arg] = process.argv.slice(2)
switch (cmd) {
  case 'scaffold': scaffold(arg); break
  case 'port': console.log(portOf(arg)); break
  case 'wait': await wait(Number(arg)); break
  case 'check': {
    const port = Number(arg)
    if (await check(port)) {
      console.error(`端口 ${port} 已经被占用了。`)
      console.error('多半是这个工程的窗口还开着，或者别的程序占了这个端口。')
      console.error(`查是谁占的：  netstat -ano | findstr :${port}`)
      process.exit(1)
    }
    break
  }
  case 'new': await create(arg, process.argv[4]); break
  case 'sim': await sim(arg, process.argv[4]); break
  case 'done': done(arg); break
  case 'bump': bump(arg, process.argv[4]); break
  case 'qr': qr(arg); break
  case 'list': listCmd(); break
  default:
    console.error('用法: node scripts/eh.mjs <scaffold|port|wait|check|list|done|qr> [name]')
    process.exit(1)
}
