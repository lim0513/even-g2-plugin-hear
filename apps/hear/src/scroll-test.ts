// 滚动实验（只在 dev 期用：http://127.0.0.1:5176/scroll-test.html）
//
// 已知（用户目视）：固件会滚 isEventCapture 容器里的文字，但整块替换内容后滚动位置回到顶部。
// 本页测三种"追加一行"的方式，看哪种**不回顶**。长按切换方式，每 10 秒追加一行，顶栏显示当前方式。
//
//   A  整块替换：content = 全文                                 （已知回顶，作对照）
//   B  增量：contentOffset = 旧长度, content = 新增部分          （猜 contentOffset 是"从这个位置起写"）
//   C  只更新顶栏容器，正文不动                                  （看别的容器更新会不会连累正文的滚动位置）
import {
  waitForEvenAppBridge, TextContainerProperty, CreateStartUpPageContainer, RebuildPageContainer, TextContainerUpgrade, OsEventTypeList,
} from '@evenrealities/even_hub_sdk'

const bridge = await waitForEvenAppBridge()

const MODES = ['A 整块替换', 'B contentOffset 增量', 'C 只更新顶栏'] as const
let mode = 0
let lines = Array.from({ length: 14 }, (_, i) => `${String(i + 1).padStart(2, '0')} 第${i + 1}行 这是用来测试滚动的文字`)
const body = () => lines.join('\n')
const bytes = (s: string) => new TextEncoder().encode(s).byteLength

const header = () => `${MODES[mode]}   行数 ${lines.length}   长按切换`

const page = {
  containerTotalNum: 2,
  textObject: [
    new TextContainerProperty({
      xPosition: 0, yPosition: 0, width: 576, height: 30, borderWidth: 0, borderColor: 0, paddingLength: 0,
      containerID: 1, containerName: 'header', content: header(), textColor: 2, isEventCapture: 0,
    }),
    new TextContainerProperty({
      xPosition: 0, yPosition: 32, width: 576, height: 256, borderWidth: 0, borderColor: 0, paddingLength: 0,
      containerID: 2, containerName: 'body', content: body(), textColor: 4, isEventCapture: 1,
    }),
  ],
}
// 开发期热重载后 create 会返回 1（一个页面只能 create 一次），退回 rebuild
const r = await bridge.createStartUpPageContainer(new CreateStartUpPageContainer(page))
if (r !== 0) await bridge.rebuildPageContainer(new RebuildPageContainer(page))
console.log('Page created:', r === 0 ? 'success' : `rebuilt (${r})`)

const upHeader = () => bridge.textContainerUpgrade(new TextContainerUpgrade({ containerID: 1, containerName: 'header', content: header(), textColor: 2 }))

let n = lines.length
setInterval(async () => {
  n++
  const line = `${String(n).padStart(2, '0')} 第${n}行 追加于 ${new Date().toLocaleTimeString()}`
  if (mode === 2) {
    // C：正文不碰，只改顶栏
    await upHeader()
    console.log('[C] header only', n)
    return
  }
  const before = body()
  lines.push(line)
  while (bytes(body()) > 990) lines.shift()
  if (mode === 0) {
    await bridge.textContainerUpgrade(new TextContainerUpgrade({ containerID: 2, containerName: 'body', content: body(), textColor: 4 }))
    console.log('[A] replaced, lines', lines.length)
  } else {
    // B：只送新增的那段，contentOffset 指向旧内容末尾（字节数；用字符数也试过的话记在这里）
    const add = '\n' + line
    await bridge.textContainerUpgrade(new TextContainerUpgrade({
      containerID: 2, containerName: 'body', contentOffset: bytes(before), contentLength: bytes(add), content: add, textColor: 4,
    }))
    console.log('[B] offset', bytes(before), 'len', bytes(add))
  }
  await upHeader()
}, 10_000)

bridge.onEvenHubEvent((event) => {
  const e = event.sysEvent?.eventType ?? event.textEvent?.eventType ?? OsEventTypeList.CLICK_EVENT
  console.log('[event]', JSON.stringify(event).slice(0, 120))
  if (e === OsEventTypeList.DOUBLE_CLICK_EVENT) void bridge.shutDownPageContainer(1)
  if (e === OsEventTypeList.LONG_PRESS_EVENT) {
    mode = (mode + 1) % MODES.length
    console.log('[mode]', MODES[mode])
    // 切模式时把正文整块重写一次（B 会把正文弄坏）
    void bridge.textContainerUpgrade(new TextContainerUpgrade({ containerID: 2, containerName: 'body', content: body(), textColor: 4 })).then(upHeader)
  }
})
