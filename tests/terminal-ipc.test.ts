import assert from 'node:assert/strict'
import { readdir, readFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import test, { after } from 'node:test'
import { createServer, type ViteDevServer } from 'vite'

const ALIASES = {
  '@shared': resolve('src/shared'),
  electron: resolve('tests/fixtures/electron-stub.ts'),
}

let server: ViteDevServer | null = null

async function load(path: string): Promise<Record<string, any>> {
  server ??= await createServer({ logLevel: 'silent', server: { middlewareMode: true }, resolve: { alias: ALIASES } })
  return server.ssrLoadModule(path)
}

after(async () => {
  await server?.close()
})

async function loadTerminalIpc() {
  const shared = await load('/src/shared/terminal.ts').catch(() => assert.fail('共享终端契约尚未实现'))
  const serviceModule = await load('/src/main/terminal/TerminalService.ts').catch(() => assert.fail('工作区单终端服务尚未实现'))
  const ipcModule = await load('/src/main/terminal/TerminalIpcHandler.ts').catch(() => assert.fail('终端窄 IPC 尚未实现'))
  assert.equal(typeof ipcModule.TerminalIpcHandler, 'function', '需要可测试的终端 IPC 处理器')
  return { shared, serviceModule, ipcModule }
}

function createManualScheduler() {
  interface Timer {
    fn: () => void
    cancelled: boolean
  }
  const timers: Timer[] = []
  return {
    schedule(fn: () => void) {
      const timer: Timer = { fn, cancelled: false }
      timers.push(timer)
      return () => {
        timer.cancelled = true
      }
    },
    run() {
      while (timers.length > 0) {
        for (const timer of timers.splice(0)) {
          if (!timer.cancelled) timer.fn()
        }
      }
    },
  }
}

interface FakePtyRecord {
  written: string[]
  resizes: Array<{ cols: number; rows: number }>
  groupSignals: string[]
  kills: Array<string | undefined>
  dataListeners: Set<(data: string) => void>
  exitListeners: Set<(event: { code: number | null; signal: number | null }) => void>
}

function createPtyDouble() {
  const records: FakePtyRecord[] = []
  let attempts = 0
  const adapter = {
    spawn() {
      attempts += 1
      const record: FakePtyRecord = { written: [], resizes: [], groupSignals: [], kills: [], dataListeners: new Set(), exitListeners: new Set() }
      records.push(record)
      return {
        pid: 7000 + records.length,
        onData(listener: (data: string) => void) {
          record.dataListeners.add(listener)
          return () => record.dataListeners.delete(listener)
        },
        onExit(listener: (event: { code: number | null; signal: number | null }) => void) {
          record.exitListeners.add(listener)
          return () => record.exitListeners.delete(listener)
        },
        write(data: string) {
          record.written.push(data)
        },
        resize(cols: number, rows: number) {
          record.resizes.push({ cols, rows })
        },
        signalGroup(signal: string) {
          record.groupSignals.push(signal)
        },
        kill(signal?: string) {
          record.kills.push(signal)
          for (const listener of [...record.exitListeners]) listener({ code: 0, signal: 9 })
        },
      }
    },
  }
  return {
    adapter,
    records,
    attempts: () => attempts,
    emitData(record: FakePtyRecord, data: string) {
      for (const listener of [...record.dataListeners]) listener(data)
    },
  }
}

interface FakeSender {
  id: number
  destroyed: boolean
  received: Array<{ subscriptionId: string; event: any }>
  isDestroyed(): boolean
  send(payload: { subscriptionId: string; event: any }): void
}

function createSender(id: number): FakeSender {
  return {
    id,
    destroyed: false,
    received: [],
    isDestroyed() {
      return this.destroyed
    },
    send(payload) {
      this.received.push(payload)
    },
  }
}

async function createHarness(limits: Record<string, number> = {}) {
  const { shared, serviceModule, ipcModule } = await loadTerminalIpc()
  const pty = createPtyDouble()
  const scheduler = createManualScheduler()
  const service = new serviceModule.TerminalService({
    resolveProjectRoot: async (projectId: string) => {
      const roots: Record<string, string> = { p1: '/projects/one', p2: '/projects/two' }
      const root = roots[projectId]
      if (!root) throw new Error(`工作区不存在：${projectId}`)
      return root
    },
    adapter: pty.adapter,
    env: { SHELL: '/bin/zsh' },
    limits: { exitGraceMs: 5, ...limits },
    schedule: scheduler.schedule,
  })
  const trusted = new Set<number>([1, 2])
  const handler = new ipcModule.TerminalIpcHandler({
    service,
    isTrustedSender: (sender: FakeSender) => trusted.has(sender.id),
    schedule: scheduler.schedule,
  })
  return { shared, service, handler, pty, trusted, scheduler }
}

const openInput = { projectId: 'p1', cols: 100, rows: 30 }

test('拒绝非受信 sender 的终端请求，且不启动进程', async () => {
  const { handler, pty } = await createHarness()
  const intruder = createSender(99)
  await assert.rejects(handler.create(intruder, openInput), (error: any) => error.code === 'UNTRUSTED_SENDER')
  await assert.rejects(handler.write(intruder, { projectId: 'p1', sessionId: 'x', data: 'y' }), (error: any) => error.code === 'UNTRUSTED_SENDER')
  await assert.rejects(handler.attach(intruder, { projectId: 'p1', sessionId: 'x' }), (error: any) => error.code === 'UNTRUSTED_SENDER')
  await assert.rejects(handler.detach(intruder, 'sub'), (error: any) => error.code === 'UNTRUSTED_SENDER')
  assert.equal(pty.attempts(), 0)
  assert.equal(intruder.received.length, 0)
})

test('非法参数与 renderer 指定的执行路径被拒绝', async () => {
  const { handler, pty } = await createHarness()
  const sender = createSender(1)
  const invalid: unknown[] = [
    undefined,
    { cols: 80, rows: 24 },
    { projectId: 'p1', cols: '80', rows: 24 },
    { projectId: 'p1', cols: 0, rows: 24 },
    { projectId: 'p1', cols: 100000, rows: 24 },
    { projectId: 'p1', cols: 80.5, rows: 24 },
    { projectId: 'p1', cols: 80, rows: -1 },
    { projectId: 'p1', cols: 80, rows: 24, file: '/bin/evil' },
    { projectId: 'p1', cols: 80, rows: 24, cwd: '/etc' },
    { projectId: 'p1', cols: 80, rows: 24, env: { EVIL: '1' } },
    { projectId: '', cols: 80, rows: 24 },
  ]
  for (const input of invalid) {
    await assert.rejects(handler.create(sender, input), (error: any) => error.code === 'INVALID_INPUT', `应拒绝：${JSON.stringify(input)}`)
  }
  assert.equal(pty.attempts(), 0)
})

test('通过 IPC 新建多个终端并按工作区列出会话', async () => {
  const { handler, service, pty } = await createHarness()
  const sender = createSender(1)

  const first = await handler.create(sender, openInput)
  const second = await handler.create(sender, openInput)
  const other = await handler.create(sender, { projectId: 'p2', cols: 80, rows: 24 })

  assert.notEqual(first.sessionId, second.sessionId)
  assert.equal(pty.attempts(), 3)

  const listed = await handler.list(sender, { projectId: 'p1' })
  assert.deepEqual(listed.map((entry: any) => entry.sessionId), [first.sessionId, second.sessionId])
  assert.deepEqual(listed.map((entry: any) => entry.ordinal), [1, 2])
  assert.deepEqual((await handler.list(sender, { projectId: 'p2' })).map((entry: any) => entry.sessionId), [other.sessionId])
  assert.deepEqual(await handler.list(sender, { projectId: 'missing' }), [])
  assert.equal(service.list().length, 3)
})

test('每工作区会话上限通过 IPC 暴露真实原因', async () => {
  const { handler, pty } = await createHarness({ maxSessionsPerProject: 1 })
  const sender = createSender(1)
  const first = await handler.create(sender, openInput)

  await assert.rejects(handler.create(sender, openInput), (error: any) => {
    assert.equal(error.code, 'SESSION_LIMIT')
    assert.match(error.message, /1/)
    return true
  })
  assert.equal(pty.attempts(), 1)

  await handler.terminate(sender, { projectId: 'p1', sessionId: first.sessionId })
  const replacement = await handler.create(sender, openInput)
  assert.equal(replacement.status, 'running')
  assert.deepEqual((await handler.list(sender, { projectId: 'p1' })).map((entry: any) => entry.sessionId), [replacement.sessionId])
})

test('list 拒绝非法与多余字段的请求', async () => {
  const { handler } = await createHarness()
  const sender = createSender(1)
  for (const input of [undefined, {}, { projectId: '' }, { projectId: 'p1', extra: true }, { projectId: 'p1', sessionId: 'x' }]) {
    await assert.rejects(handler.list(sender, input), (error: any) => error.code === 'INVALID_INPUT', `应拒绝：${JSON.stringify(input)}`)
  }
})

test('通过 IPC 创建、写入、调整尺寸并终止终端', async () => {
  const { handler, service, pty } = await createHarness()
  const sender = createSender(1)

  const info = await handler.create(sender, openInput)
  assert.equal(info.status, 'running')
  assert.equal(info.projectId, 'p1')
  assert.equal(pty.records.length, 1)

  await handler.write(sender, { projectId: 'p1', sessionId: info.sessionId, data: 'ls\r' })
  const resized = await handler.resize(sender, { projectId: 'p1', sessionId: info.sessionId, cols: 120, rows: 40 })
  assert.equal(resized.cols, 120)
  assert.deepEqual(pty.records[0].written, ['ls\r'])
  assert.deepEqual(pty.records[0].resizes, [{ cols: 120, rows: 40 }])

  await handler.terminate(sender, { projectId: 'p1', sessionId: info.sessionId })
  assert.equal(service.find('p1', info.sessionId), null, '关闭 tab 会停止并移除该会话记录')
  assert.equal(pty.records[0].groupSignals[0], 'SIGHUP')
  assert.deepEqual(pty.records[0].kills, ['SIGKILL'])
})

test('输入与尺寸在 IPC 边界按契约上限被拒绝', async () => {
  const { handler, shared, pty } = await createHarness()
  const sender = createSender(1)
  const info = await handler.create(sender, openInput)

  await assert.rejects(
    handler.write(sender, { projectId: 'p1', sessionId: info.sessionId, data: 'x'.repeat(shared.TERMINAL_LIMITS.maxWriteBytes + 1) }),
    (error: any) => error.code === 'INVALID_INPUT',
  )
  await assert.rejects(
    handler.write(sender, { projectId: 'p1', sessionId: info.sessionId, data: '你好'.repeat(shared.TERMINAL_LIMITS.maxWriteBytes) }),
    (error: any) => error.code === 'INVALID_INPUT',
  )
  await assert.rejects(
    handler.resize(sender, { projectId: 'p1', sessionId: info.sessionId, cols: shared.TERMINAL_LIMITS.maxCols + 1, rows: 24 }),
    (error: any) => error.code === 'INVALID_INPUT',
  )
  await assert.rejects(
    handler.resize(sender, { projectId: 'p1', sessionId: info.sessionId, cols: 80, rows: Number.NaN }),
    (error: any) => error.code === 'INVALID_INPUT',
  )
  assert.deepEqual(pty.records[0].written, [])
  assert.deepEqual(pty.records[0].resizes, [])
})

test('会话事件只路由给对应订阅者', async () => {
  const { handler, pty, scheduler } = await createHarness()
  const first = createSender(1)
  const second = createSender(2)
  const one = await handler.create(first, { projectId: 'p1', cols: 80, rows: 24 })
  const two = await handler.create(second, { projectId: 'p2', cols: 80, rows: 24 })

  const subscriptionOne = await handler.attach(first, { projectId: 'p1', sessionId: one.sessionId })
  const subscriptionTwo = await handler.attach(second, { projectId: 'p2', sessionId: two.sessionId })
  assert.notEqual(subscriptionOne.subscriptionId, subscriptionTwo.subscriptionId)

  pty.emitData(pty.records[0], 'one')
  pty.emitData(pty.records[1], 'two')
  scheduler.run()

  const firstEvents = first.received.filter(payload => payload.event.type === 'output')
  const secondEvents = second.received.filter(payload => payload.event.type === 'output')
  assert.deepEqual(firstEvents.map(payload => payload.event.data), ['one'])
  assert.deepEqual(secondEvents.map(payload => payload.event.data), ['two'])
  assert.equal(firstEvents[0].subscriptionId, subscriptionOne.subscriptionId)
  assert.equal(firstEvents[0].event.projectId, 'p1')
  assert.equal(firstEvents[0].event.sessionId, one.sessionId)
})

test('拒绝跨工作区附着，也不为过期会话建立订阅', async () => {
  const { handler, service, pty } = await createHarness()
  const sender = createSender(1)
  const one = await handler.create(sender, { projectId: 'p1', cols: 80, rows: 24 })
  await handler.create(sender, { projectId: 'p2', cols: 80, rows: 24 })

  await assert.rejects(handler.attach(sender, { projectId: 'p2', sessionId: one.sessionId }), (error: any) => error.code === 'SESSION_NOT_FOUND')
  await assert.rejects(handler.attach(sender, { projectId: 'p1', sessionId: 'made-up' }), (error: any) => error.code === 'SESSION_NOT_FOUND')

  await handler.terminate(sender, { projectId: 'p1', sessionId: one.sessionId })
  await assert.rejects(handler.attach(sender, { projectId: 'p1', sessionId: one.sessionId }), (error: any) => error.code === 'SESSION_NOT_FOUND')
  assert.equal(service.find('p1', one.sessionId), null, '显式终止会移除记录')

  pty.emitData(pty.records[0], 'after-exit')
  assert.equal(sender.received.filter(payload => payload.event.type === 'output').length, 0)
})

test('取消订阅后不再收到事件，且不能取消他人的订阅', async () => {
  const { handler, pty, scheduler } = await createHarness()
  const first = createSender(1)
  const second = createSender(2)
  const one = await handler.create(first, { projectId: 'p1', cols: 80, rows: 24 })
  const mine = await handler.attach(first, { projectId: 'p1', sessionId: one.sessionId })
  const other = await handler.attach(second, { projectId: 'p1', sessionId: one.sessionId })

  await handler.detach(second, mine.subscriptionId)
  pty.emitData(pty.records[0], 'kept')
  scheduler.run()
  assert.equal(first.received.filter(payload => payload.event.data === 'kept').length, 1, '他人不能取消我的订阅')

  await handler.detach(first, mine.subscriptionId)
  pty.emitData(pty.records[0], 'gone')
  scheduler.run()
  assert.equal(first.received.filter(payload => payload.event.data === 'gone').length, 0)
  assert.equal(second.received.filter(payload => payload.event.data === 'gone').length, 1, '其它订阅者仍然收到事件')

  await handler.detach(first, mine.subscriptionId)
  await handler.detach(first, 'unknown-subscription')
})

test('sender 被销毁后自动清理订阅且不抛错', async () => {
  const { handler, pty } = await createHarness()
  const sender = createSender(1)
  const info = await handler.create(sender, { projectId: 'p1', cols: 80, rows: 24 })
  await handler.attach(sender, { projectId: 'p1', sessionId: info.sessionId })

  sender.destroyed = true
  pty.emitData(pty.records[0], 'nobody')
  assert.equal(sender.received.length, 0)

  sender.destroyed = false
  pty.emitData(pty.records[0], 'after-cleanup')
  assert.equal(sender.received.length, 0, '销毁过的订阅不会复活')
})

test('dispose 释放服务监听与全部订阅', async () => {
  const { handler, service, pty } = await createHarness()
  const sender = createSender(1)
  const info = await handler.create(sender, { projectId: 'p1', cols: 80, rows: 24 })
  await handler.attach(sender, { projectId: 'p1', sessionId: info.sessionId })

  handler.dispose()
  pty.emitData(pty.records[0], 'after-dispose')
  assert.equal(sender.received.filter(payload => payload.event.type === 'output').length, 0)
  assert.equal(service.list().length, 1, 'dispose 只释放 IPC 订阅，不销毁 PTY 会话')
})

test('preload 只暴露窄终端接口，没有通用执行或文件系统能力', async () => {
  const preload = await load('/src/preload/index.ts').catch(() => assert.fail('preload 尚未接线'))
  const stub = await load('/tests/fixtures/electron-stub.ts')
  assert.equal(typeof preload, 'object')
  const bridge = stub.exposed.find((entry: { key: string }) => entry.key === 'sailor')
  assert.ok(bridge, 'preload 应只暴露 window.sailor')
  const api = bridge.api as Record<string, any>
  assert.deepEqual(Object.keys(api).sort(), ['agent', 'app', 'settings', 'terminal', 'workspaces'])
  assert.deepEqual(
    Object.keys(api.terminal).sort(),
    ['attach', 'create', 'detach', 'list', 'resize', 'subscribe', 'terminate', 'write'],
  )
  for (const forbidden of ['exec', 'spawn', 'shell', 'fs', 'node', 'eval', 'run']) {
    assert.equal(api.terminal[forbidden], undefined, `终端接口不能暴露 ${forbidden}`)
    assert.equal(api[forbidden], undefined, `window.sailor 不能暴露 ${forbidden}`)
  }
})

test('窗口保持 renderer sandbox，agent 侧不接入终端能力', async () => {
  const windowSource = await readFile('src/main/window.ts', 'utf8')
  assert.match(windowSource, /sandbox:\s*true/, 'renderer 必须保持 sandbox')
  assert.match(windowSource, /contextIsolation:\s*true/, 'renderer 必须保持 contextIsolation')
  assert.match(windowSource, /nodeIntegration:\s*false/, 'renderer 不得获得 Node 权限')

  const agentDirectory = join('src', 'main', 'agent')
  const files: string[] = []
  const walk = async (directory: string) => {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const path = join(directory, entry.name)
      if (entry.isDirectory()) await walk(path)
      else if (entry.name.endsWith('.ts')) files.push(path)
    }
  }
  await walk(agentDirectory)
  assert.ok(files.length > 0, '应能读取 agent 源码')
  for (const file of files) {
    const source = await readFile(file, 'utf8')
    assert.doesNotMatch(source, /node-pty|TerminalService|terminal:open/, `${file} 不得接入终端能力`)
  }
})
