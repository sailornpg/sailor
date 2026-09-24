// Real-Electron verification for the workspace terminal. It runs inside Electron's
// main process (so node-pty is loaded against Electron's ABI) and drives the real
// TerminalService + NodePtyAdapter + TerminalIpcHandler against real login shells.
const { app } = require('electron')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')

const reportPath = process.argv[2]
const root = process.cwd()

app.commandLine.appendSwitch('no-sandbox')
app.disableHardwareAcceleration()
app.setPath('userData', fs.mkdtempSync(path.join(os.tmpdir(), 'sailor-terminal-userdata-')))
if (app.dock) app.dock.hide()

const results = []
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

function check(name, ok, detail) {
  results.push({ name, ok: Boolean(ok), detail: detail === undefined ? null : detail })
  if (!ok) console.error(`FAIL ${name}: ${detail ?? ''}`)
}

function isAlive(pid) {
  try {
    process.kill(pid, 0)
    return true
  } catch {
    return false
  }
}

function createSender(id) {
  const received = []
  const outputs = new Map()
  return {
    id,
    destroyed: false,
    received,
    outputs,
    isDestroyed() {
      return this.destroyed
    },
    send(payload) {
      received.push(payload)
      if (payload.event.type === 'output') {
        outputs.set(payload.event.sessionId, (outputs.get(payload.event.sessionId) ?? '') + payload.event.data)
      }
    },
  }
}

function outputFor(sender, sessionId) {
  return sender.outputs.get(sessionId) ?? ''
}

async function waitFor(label, predicate, timeoutMs = 15000) {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    if (predicate()) return true
    await sleep(50)
  }
  check(label, false, `在 ${timeoutMs}ms 内没有满足条件`)
  return false
}

async function main() {
  const { createServer } = await import('vite')
  const server = await createServer({
    logLevel: 'silent',
    server: { middlewareMode: true },
    resolve: { alias: { '@shared': path.resolve(root, 'src/shared') } },
  })
  const { TerminalService } = await server.ssrLoadModule('/src/main/terminal/TerminalService.ts')
  const { TerminalIpcHandler } = await server.ssrLoadModule('/src/main/terminal/TerminalIpcHandler.ts')
  const { createNodePtyAdapter } = await server.ssrLoadModule('/src/main/terminal/NodePtyAdapter.ts')

  const projectRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'sailor-terminal-project-'))
  fs.writeFileSync(path.join(projectRoot, 'probe.txt'), 'sailor\n')

  const service = new TerminalService({
    resolveProjectRoot: async (projectId) => {
      if (projectId !== 'p1') throw new Error(`工作区不存在：${projectId}`)
      return projectRoot
    },
    adapter: createNodePtyAdapter(),
  })
  const handler = new TerminalIpcHandler({ service, isTrustedSender: (sender) => sender.id === 1 })
  const sender = createSender(1)
  const output = (sessionId) => outputFor(sender, sessionId)
  const write = (sessionId, data) => handler.write(sender, { projectId: 'p1', sessionId, data })

  check('Electron ABI', typeof process.versions.modules === 'string', `electron ${process.versions.electron} / modules ${process.versions.modules}`)

  // --- 单会话生命周期 ---------------------------------------------------------
  const info = await handler.create(sender, { projectId: 'p1', cols: 80, rows: 24 })
  check('shell 启动', info.status === 'running' && info.pid > 0 && info.shell.length > 0, JSON.stringify({ status: info.status, pid: info.pid, shell: info.shell }))
  check('首个会话 ordinal 为 1', info.ordinal === 1, String(info.ordinal))
  const attached = await handler.attach(sender, { projectId: 'p1', sessionId: info.sessionId })
  check('附着返回订阅', typeof attached.subscriptionId === 'string' && attached.subscriptionId.length > 0)
  check('初始尺寸传递', info.cols === 80 && info.rows === 24, `${info.cols}x${info.rows}`)

  await write(info.sessionId, 'pwd; echo TERM=$TERM; echo smoke-$((6*7))\r')
  await waitFor('交互输入与输出', () => output(info.sessionId).includes('smoke-42') && output(info.sessionId).includes('TERM=xterm-256color'))
  check('工作目录为项目根目录', output(info.sessionId).includes(projectRoot), output(info.sessionId).slice(-400))

  await write(info.sessionId, 'sleep 30\r')
  await sleep(600)
  await write(info.sessionId, '\u0003')
  await sleep(300)
  const beforeCancel = output(info.sessionId).length
  await write(info.sessionId, 'echo after-cancel\r')
  check('Ctrl+C 中断前台任务', await waitFor('Ctrl+C 中断前台任务', () => output(info.sessionId).slice(beforeCancel).includes('after-cancel')))

  const resized = await handler.resize(sender, { projectId: 'p1', sessionId: info.sessionId, cols: 120, rows: 40 })
  const beforeSize = output(info.sessionId).length
  await write(info.sessionId, 'stty size\r')
  await waitFor('尺寸变化传递到 PTY', () => output(info.sessionId).slice(beforeSize).includes('40 120'))
  check('resize 返回新尺寸', resized.cols === 120 && resized.rows === 40, `${resized.cols}x${resized.rows}`)

  const beforeFlood = output(info.sessionId).length
  await write(info.sessionId, 'seq 1 20000\r')
  await write(info.sessionId, 'echo flood-done\r')
  await waitFor('输出洪峰后会话仍可用', () => output(info.sessionId).slice(beforeFlood).includes('flood-done'), 30000)
  const snapshot = service.outputSnapshot('p1', info.sessionId, 0)
  check('输出缓存在上限内', snapshot.chunks.reduce((total, chunk) => total + Buffer.byteLength(chunk.data, 'utf8'), 0) <= 256 * 1024)

  await handler.detach(sender, attached.subscriptionId)
  await write(info.sessionId, 'echo while-detached\r')
  await sleep(700)
  const resumed = await handler.attach(sender, { projectId: 'p1', sessionId: info.sessionId, sinceSeq: 0 })
  check('隐藏后进程保活', resumed.info.pid === info.pid && resumed.info.status === 'running', `pid ${info.pid} -> ${resumed.info.pid}`)
  check('重新附着回放期间的输出', resumed.chunks.map((chunk) => chunk.data).join('').includes('while-detached'))

  const beforeChild = output(info.sessionId).length
  await write(info.sessionId, 'sleep 300 & echo child=$!\r')
  await waitFor('取得后台子进程 pid', () => /child=\d+/.test(output(info.sessionId).slice(beforeChild)))
  const childPid = Number(/child=(\d+)/.exec(output(info.sessionId).slice(beforeChild))?.[1] ?? 0)
  check('后台子进程已启动', childPid > 0 && isAlive(childPid), `pid ${childPid}`)

  const startedAt = Date.now()
  await handler.terminate(sender, { projectId: 'p1', sessionId: info.sessionId })
  check('显式关闭后会话记录被移除', service.find('p1', info.sessionId) === null)
  await waitFor('关闭后普通子进程被清理', () => !isAlive(childPid), 5000)
  check('关闭耗时在宽限范围内', Date.now() - startedAt < 8000, `${Date.now() - startedAt}ms`)

  // --- 多会话：隔离、独立终止、上限 -------------------------------------------
  const second = await handler.create(sender, { projectId: 'p1', cols: 80, rows: 24 })
  const third = await handler.create(sender, { projectId: 'p1', cols: 80, rows: 24 })
  check('同一工作区可开多个终端', second.sessionId !== third.sessionId && second.status === 'running' && third.status === 'running')
  check('ordinal 递增且稳定', third.ordinal === second.ordinal + 1 && second.ordinal > info.ordinal, `${info.ordinal} -> ${second.ordinal} -> ${third.ordinal}`)
  check('list 返回两个会话', service.list('p1').length === 2, JSON.stringify(service.list('p1').map((entry) => entry.ordinal)))
  await handler.attach(sender, { projectId: 'p1', sessionId: second.sessionId })
  await handler.attach(sender, { projectId: 'p1', sessionId: third.sessionId })

  await write(second.sessionId, 'echo tab-only-b\r')
  await write(third.sessionId, 'echo tab-only-c\r')
  await waitFor('第二个终端有输出', () => output(second.sessionId).includes('tab-only-b'))
  await waitFor('第三个终端有输出', () => output(third.sessionId).includes('tab-only-c'))
  check('两个终端的输出互相隔离', !output(second.sessionId).includes('tab-only-c') && !output(third.sessionId).includes('tab-only-b'))

  await handler.terminate(sender, { projectId: 'p1', sessionId: second.sessionId })
  check('关闭一个 tab 只移除对应会话', service.find('p1', second.sessionId) === null && service.find('p1', third.sessionId)?.status === 'running')
  const beforeSurvivor = output(third.sessionId).length
  await write(third.sessionId, 'echo survivor-ok\r')
  check('另一个终端继续可用', await waitFor('另一个终端继续可用', () => output(third.sessionId).slice(beforeSurvivor).includes('survivor-ok')))

  // 每工作区上限（默认 4 个存活会话）
  const extra = []
  for (let index = service.list('p1').filter((entry) => entry.status === 'running').length; index < 4; index += 1) {
    extra.push(await handler.create(sender, { projectId: 'p1', cols: 80, rows: 24 }))
  }
  check('可以填满每工作区上限', service.list('p1').filter((entry) => entry.status === 'running').length === 4)
  let limitError = null
  try {
    await handler.create(sender, { projectId: 'p1', cols: 80, rows: 24 })
  } catch (error) {
    limitError = error
  }
  check('超过每工作区上限时给出 SESSION_LIMIT', limitError?.code === 'SESSION_LIMIT', `${limitError?.code}: ${limitError?.message}`)

  handler.dispose()
  await service.disposeAll()
  check('disposeAll 清空会话', service.list().length === 0)
  await waitFor('退出清理所有子进程', () => extra.every((entry) => !isAlive(entry.pid)) && !isAlive(third.pid), 6000)

  await server.close()
  fs.rmSync(projectRoot, { recursive: true, force: true })

  const failed = results.filter((entry) => !entry.ok)
  return { ok: failed.length === 0, results }
}

app.whenReady().then(async () => {
  let report
  try {
    report = await main()
  } catch (error) {
    report = { ok: false, results, error: error && error.stack ? error.stack : String(error) }
    console.error(error)
  }
  if (reportPath) fs.writeFileSync(reportPath, JSON.stringify(report, null, 2))
  console.log(JSON.stringify(report, null, 2))
  app.exit(report.ok ? 0 : 1)
})
