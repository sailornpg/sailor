import assert from 'node:assert/strict'
import { resolve } from 'node:path'
import test, { after } from 'node:test'
import { createServer, type ViteDevServer } from 'vite'

const ALIASES = { '@shared': resolve('src/shared') }

let server: ViteDevServer | null = null

async function load(path: string): Promise<Record<string, any>> {
  server ??= await createServer({
    logLevel: 'silent',
    server: { middlewareMode: true },
    resolve: { alias: ALIASES },
  })
  return server.ssrLoadModule(path)
}

after(async () => {
  await server?.close()
})

async function loadTerminal() {
  const shared = await load('/src/shared/terminal.ts').catch(() =>
    assert.fail('共享终端契约尚未实现'),
  )
  const shell = await load('/src/main/terminal/TerminalShell.ts').catch(() =>
    assert.fail('终端 shell 与环境解析尚未实现'),
  )
  const serviceModule = await load('/src/main/terminal/TerminalService.ts').catch(() =>
    assert.fail('工作区单终端服务尚未实现'),
  )
  assert.equal(typeof serviceModule.TerminalService, 'function', '需要可测试的工作区单终端服务')
  assert.equal(typeof serviceModule.TerminalError, 'function', '需要可区分的终端错误类型')
  return { shared, shell, serviceModule }
}

interface SpawnRecord {
  pid: number
  options: {
    file: string
    args: string[]
    cwd: string
    env: Record<string, string>
    cols: number
    rows: number
    name: string
  }
  written: string[]
  resizes: Array<{ cols: number; rows: number }>
  groupSignals: string[]
  kills: Array<string | undefined>
  dataListeners: Set<(data: string) => void>
  exitListeners: Set<(event: { code: number | null; signal: number | null }) => void>
}

interface FakeAdapterOptions {
  failSpawn?: (options: SpawnRecord['options']) => Error | null
}

/** Controllable PTY double: tests drive data/exit and observe every call. */
function createFakeAdapter(options: FakeAdapterOptions = {}) {
  const records: SpawnRecord[] = []
  let spawnAttempts = 0

  const adapter = {
    spawn(spawnOptions: SpawnRecord['options']) {
      spawnAttempts += 1
      const failure = options.failSpawn?.(spawnOptions)
      if (failure) throw failure
      const record: SpawnRecord = {
        pid: 4000 + records.length,
        options: spawnOptions,
        written: [],
        resizes: [],
        groupSignals: [],
        kills: [],
        dataListeners: new Set(),
        exitListeners: new Set(),
      }
      records.push(record)
      const emitPtyExit = (exitCode: number, signal?: number) => {
        for (const listener of [...record.exitListeners])
          listener({ code: exitCode, signal: signal ?? null })
      }
      return {
        pid: record.pid,
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
          emitPtyExit(0, 9)
        },
      }
    },
  }

  return {
    adapter,
    records,
    spawnAttempts: () => spawnAttempts,
    emitData(record: SpawnRecord, data: string) {
      for (const listener of [...record.dataListeners]) listener(data)
    },
    emitExit(record: SpawnRecord, exitCode = 0, signal?: number) {
      for (const listener of [...record.exitListeners])
        listener({ code: exitCode, signal: signal ?? null })
    },
  }
}

async function createHarness(
  config: {
    roots?: Record<string, string>
    failResolve?: (projectId: string) => Error | null
    failSpawn?: FakeAdapterOptions['failSpawn']
    limits?: Record<string, number>
    env?: Record<string, string>
    platform?: NodeJS.Platform
  } = {},
) {
  const { shared, shell, serviceModule } = await loadTerminal()
  const fake = createFakeAdapter({ failSpawn: config.failSpawn })
  const resolved: string[] = []
  const service = new serviceModule.TerminalService({
    resolveProjectRoot: async (projectId: string) => {
      const failure = config.failResolve?.(projectId)
      if (failure) throw failure
      const root = config.roots?.[projectId]
      if (!root) throw new Error(`工作区不存在：${projectId}`)
      resolved.push(projectId)
      return root
    },
    adapter: fake.adapter,
    env: config.env ?? { SHELL: '/bin/zsh', PATH: '/usr/bin:/bin', HOME: '/Users/tester' },
    platform: config.platform,
    limits: { maxSessions: 8, exitGraceMs: 20, ...config.limits },
  })
  return { shared, shell, serviceModule, service, ...fake, resolved }
}

function collectEvents(service: any) {
  const events: any[] = []
  const unsubscribe = service.subscribe((event: any) => events.push(event))
  return { events, unsubscribe }
}

async function waitFor(predicate: () => boolean, message: string, timeoutMs = 1000) {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    if (predicate()) return
    await new Promise((resolveWait) => setTimeout(resolveWait, 5))
  }
  assert.fail(message)
}

test('默认 shell 来自 $SHELL 并用 login shell 启动，环境变量剔除 Electron/Node 注入', async () => {
  const { shell } = await createHarness()
  assert.deepEqual(shell.resolveShell({ SHELL: '/opt/homebrew/bin/fish' }), {
    file: '/opt/homebrew/bin/fish',
    args: ['-l'],
  })
  assert.deepEqual(shell.resolveShell({}), { file: '/bin/sh', args: [] })
  assert.deepEqual(
    shell.resolveShell({ SHELL: 'zsh' }),
    { file: '/bin/sh', args: [] },
    '非绝对路径的 $SHELL 不可执行',
  )
  assert.deepEqual(shell.resolveShell({ SHELL: '/bin/sh' }, 'linux'), { file: '/bin/sh', args: [] })

  const env = shell.buildTerminalEnv({
    PATH: '/usr/bin',
    HOME: '/Users/tester',
    SHELL: '/bin/zsh',
    TERM: 'dumb',
    ELECTRON_RUN_AS_NODE: '1',
    NODE_OPTIONS: '--max-old-space-size=64',
  })
  assert.equal(env.PATH, '/usr/bin')
  assert.equal(env.HOME, '/Users/tester')
  assert.equal(env.TERM, 'xterm-256color')
  assert.equal(env.ELECTRON_RUN_AS_NODE, undefined, '不能把 Electron 注入变量交给终端')
  assert.equal(env.NODE_OPTIONS, undefined, '不能把 Node 注入变量交给终端')
})

test('Windows 终端使用 ComSpec，缺失时通过 PATH 启动 cmd.exe', async () => {
  const { shell } = await loadTerminal()
  assert.deepEqual(
    shell.resolveShell({ SHELL: '/bin/zsh', ComSpec: 'C:\\Windows\\System32\\cmd.exe' }, 'win32'),
    {
      file: 'C:\\Windows\\System32\\cmd.exe',
      args: [],
    },
  )
  assert.deepEqual(shell.resolveShell({ ComSpec: 'relative\\cmd.exe' }, 'win32'), {
    file: 'cmd.exe',
    args: [],
  })
  assert.deepEqual(shell.resolveShell({ COMSPEC: 'C:\\Windows\\System32\\cmd.exe' }, 'win32'), {
    file: 'C:\\Windows\\System32\\cmd.exe',
    args: [],
  })
  assert.deepEqual(shell.resolveShell({}, 'win32'), { file: 'cmd.exe', args: [] })

  const harness = await createHarness({
    roots: { p1: 'C:\\projects\\one' },
    env: { SHELL: '/bin/zsh', ComSpec: 'C:\\Windows\\System32\\cmd.exe' },
    platform: 'win32',
  })
  await harness.service.create('p1')
  assert.equal(harness.records[0].options.file, 'C:\\Windows\\System32\\cmd.exe')
  assert.deepEqual(harness.records[0].options.args, [])
})

test('Windows 关闭终端直接释放 PTY，不发送 POSIX 进程组信号', async () => {
  const harness = await createHarness({ roots: { p1: 'C:\\projects\\one' }, platform: 'win32' })
  const info = await harness.service.create('p1')
  await harness.service.terminate('p1', info.sessionId)
  assert.deepEqual(harness.records[0].groupSignals, [])
  assert.deepEqual(harness.records[0].kills, [undefined])
})

test('每个会话都在可信根目录启动，并拒绝 renderer 指定执行路径', async () => {
  const harness = await createHarness({ roots: { p1: '/projects/one', p2: '/projects/two' } })
  const info = await harness.service.create('p1', {
    cols: 100,
    rows: 30,
    file: '/bin/evil',
    cwd: '/etc',
  })

  assert.equal(harness.records.length, 1)
  const record = harness.records[0]
  assert.equal(record.options.file, '/bin/zsh')
  assert.deepEqual(record.options.args, ['-l'])
  assert.equal(record.options.cwd, '/projects/one', 'cwd 只能来自主进程解析的项目根目录')
  assert.equal(record.options.cols, 100)
  assert.equal(record.options.rows, 30)
  assert.equal(record.options.env.TERM, 'xterm-256color')
  assert.equal(record.options.name, 'xterm-256color')
  assert.equal(info.projectId, 'p1')
  assert.equal(info.status, 'running')
  assert.equal(info.shell, 'zsh')
  assert.equal(info.pid, record.pid)
})

test('附着与切换不会重建进程，重复 create 才会新建会话', async () => {
  const harness = await createHarness({ roots: { p1: '/projects/one' } })
  const first = await harness.service.create('p1')
  harness.service.markActive('p1', first.sessionId)
  const again = harness.service.find('p1', first.sessionId)

  assert.equal(again?.sessionId, first.sessionId)
  assert.equal(harness.spawnAttempts(), 1, '隐藏、切换或重新附着不销毁进程')
  assert.deepEqual(harness.records[0].groupSignals, [])
  assert.deepEqual(harness.records[0].kills, [])

  const second = await harness.service.create('p1')
  assert.notEqual(second.sessionId, first.sessionId)
  assert.equal(harness.spawnAttempts(), 2, 'create 明确表示新增一个终端')
})

test('不同工作区的会话互相隔离，输入与尺寸只发给所属会话', async () => {
  const harness = await createHarness({ roots: { p1: '/projects/one', p2: '/projects/two' } })
  const one = await harness.service.create('p1')
  const two = await harness.service.create('p2')
  assert.notEqual(one.sessionId, two.sessionId)
  assert.equal(harness.records.length, 2)

  await harness.service.write('p1', one.sessionId, 'echo one\r')
  await harness.service.write('p2', two.sessionId, 'echo two\r')
  await harness.service.resize('p1', one.sessionId, 90, 25)

  assert.deepEqual(harness.records[0].written, ['echo one\r'])
  assert.deepEqual(harness.records[1].written, ['echo two\r'])
  assert.deepEqual(harness.records[1].resizes, [])
  assert.equal(harness.service.find('p1', one.sessionId)?.cols, 90)
  assert.equal(harness.service.find('p1', one.sessionId)?.rows, 25)
})

test('跨工作区或未知 sessionId 的写操作被拒绝', async () => {
  const harness = await createHarness({ roots: { p1: '/projects/one', p2: '/projects/two' } })
  const one = await harness.service.create('p1')
  await harness.service.create('p2')

  await assert.rejects(
    harness.service.write('p2', one.sessionId, 'x'),
    (error: any) => error.code === 'SESSION_NOT_FOUND',
  )
  await assert.rejects(
    harness.service.resize('p2', one.sessionId, 90, 25),
    (error: any) => error.code === 'SESSION_NOT_FOUND',
  )
  await assert.rejects(
    harness.service.terminate('p2', one.sessionId),
    (error: any) => error.code === 'SESSION_NOT_FOUND',
  )
  assert.deepEqual(harness.records[1].written, [])
})

test('工作区目录无法解析时拒绝创建，且不启动进程', async () => {
  const harness = await createHarness({
    failResolve: (projectId) => new Error(`工作区不存在：${projectId}`),
  })
  await assert.rejects(harness.service.create('missing'), (error: any) => {
    assert.equal(error.code, 'WORKSPACE_UNAVAILABLE')
    assert.match(error.message, /工作区/)
    return true
  })
  assert.equal(harness.spawnAttempts(), 0)
  assert.deepEqual(harness.service.list('missing'), [])
})

test('PTY 启动失败进入 failed 状态并可重试', async () => {
  let fail = true
  const harness = await createHarness({
    roots: { p1: '/projects/one' },
    failSpawn: () => (fail ? new Error('posix_spawnp failed') : null),
  })
  const failed = await harness.service.create('p1')
  assert.equal(failed.status, 'failed')
  assert.match(failed.failure ?? '', /posix_spawnp failed/)
  assert.equal(harness.service.find('p1', failed.sessionId)?.status, 'failed')

  fail = false
  const retried = await harness.service.create('p1')
  assert.equal(retried.status, 'running')
  assert.notEqual(retried.sessionId, failed.sessionId, '失败会话不可复用')
  assert.equal(harness.spawnAttempts(), 2)
})

test('shell 退出后状态为 exited，写操作被拒绝，迟到事件不会回退状态', async () => {
  const harness = await createHarness({ roots: { p1: '/projects/one' } })
  const info = await harness.service.create('p1')
  const { events } = collectEvents(harness.service)

  harness.emitExit(harness.records[0], 130, undefined)
  harness.emitExit(harness.records[0], 130, undefined)
  await waitFor(
    () => harness.service.find('p1', info.sessionId)?.status === 'exited',
    '退出事件应更新会话状态',
  )

  const current = harness.service.find('p1', info.sessionId)
  assert.equal(current.status, 'exited')
  assert.deepEqual(current.exit, { code: 130, signal: null })
  assert.equal(
    events.filter((event) => event.type === 'state' && event.info.status === 'exited').length,
    1,
    '重复退出事件是幂等的',
  )

  await assert.rejects(
    harness.service.write('p1', info.sessionId, 'echo late\r'),
    (error: any) => error.code === 'SESSION_EXITED',
  )
  await assert.rejects(
    harness.service.resize('p1', info.sessionId, 90, 25),
    (error: any) => error.code === 'SESSION_EXITED',
  )
  assert.deepEqual(harness.records[0].written, [])

  harness.emitData(harness.records[0], 'late output')
  await new Promise((resolveWait) => setTimeout(resolveWait, 30))
  assert.equal(events.filter((event) => event.type === 'output').length, 0, '退出后的输出不再派发')
})

test('显式终止先向进程组发 SIGHUP，宽限后升级为 SIGKILL，并移除会话记录', async () => {
  const harness = await createHarness({
    roots: { p1: '/projects/one' },
    limits: { exitGraceMs: 15 },
  })
  const info = await harness.service.create('p1')
  const record = harness.records[0]

  await harness.service.terminate('p1', info.sessionId)
  assert.deepEqual(record.groupSignals, ['SIGHUP', 'SIGKILL'], '宽限期内未退出时先按进程组强杀')
  assert.deepEqual(record.kills, ['SIGKILL'], 'node-pty 的 kill 负责释放 PTY')
  assert.equal(harness.service.find('p1', info.sessionId), null, '显式终止会移除会话记录')

  await assert.rejects(
    harness.service.terminate('p1', info.sessionId),
    (error: any) => error.code === 'SESSION_NOT_FOUND',
  )
  assert.deepEqual(record.kills, ['SIGKILL'], '重复终止不重复发信号')
})

test('shell 在 SIGHUP 后自行退出时不再发送 SIGKILL', async () => {
  const harness = await createHarness({
    roots: { p1: '/projects/one' },
    limits: { exitGraceMs: 200 },
  })
  const info = await harness.service.create('p1')
  const record = harness.records[0]

  const terminating = harness.service.terminate('p1', info.sessionId)
  harness.emitExit(record, 0, 1)
  await terminating
  assert.deepEqual(record.groupSignals, ['SIGHUP'])
  assert.deepEqual(record.kills, [])
})

test('终止后可重建新会话，旧 sessionId 失效', async () => {
  const harness = await createHarness({ roots: { p1: '/projects/one' } })
  const first = await harness.service.create('p1')
  await harness.service.terminate('p1', first.sessionId)

  const second = await harness.service.create('p1')
  assert.notEqual(second.sessionId, first.sessionId)
  assert.equal(second.status, 'running')
  assert.equal(harness.records.length, 2)

  await assert.rejects(
    harness.service.write('p1', first.sessionId, 'stale\r'),
    (error: any) => error.code === 'SESSION_NOT_FOUND',
  )
  await harness.service.write('p1', second.sessionId, 'fresh\r')
  assert.deepEqual(harness.records[1].written, ['fresh\r'])
})

test('输入字节与尺寸有上限，越界值被拒绝或收敛到边界', async () => {
  const harness = await createHarness({
    roots: { p1: '/projects/one' },
    limits: { maxWriteBytes: 6 },
  })
  const info = await harness.service.create('p1')

  await assert.rejects(
    harness.service.write('p1', info.sessionId, '1234567'),
    (error: any) => error.code === 'INVALID_INPUT',
  )
  await assert.rejects(
    harness.service.write('p1', info.sessionId, 42 as unknown as string),
    (error: any) => error.code === 'INVALID_INPUT',
  )
  await harness.service.write('p1', info.sessionId, '你好')
  assert.deepEqual(harness.records[0].written, ['你好'], '上限按 UTF-8 字节而不是字符数计算')

  const clamped = await harness.service.create('p1', { cols: 0, rows: Number.NaN })
  assert.ok(clamped.cols >= harness.shared.TERMINAL_LIMITS.minCols)
  assert.ok(clamped.rows >= harness.shared.TERMINAL_LIMITS.minRows)
  await harness.service.resize('p1', info.sessionId, 100000, 100000)
  assert.equal(
    harness.service.find('p1', info.sessionId)?.cols,
    harness.shared.TERMINAL_LIMITS.maxCols,
  )
  assert.equal(
    harness.service.find('p1', info.sessionId)?.rows,
    harness.shared.TERMINAL_LIMITS.maxRows,
  )
})

test('输出按会话派发并可携带单调序号，取消订阅后不再收到事件', async () => {
  const harness = await createHarness({ roots: { p1: '/projects/one' } })
  const info = await harness.service.create('p1')
  const { events, unsubscribe } = collectEvents(harness.service)

  harness.emitData(harness.records[0], 'first ')
  harness.emitData(harness.records[0], 'second')
  await waitFor(
    () =>
      events
        .filter((event) => event.type === 'output')
        .map((event) => event.data)
        .join('') === 'first second',
    '批量输出最终应按顺序到达',
  )

  const output = events.filter((event) => event.type === 'output')
  assert.ok(output.length >= 1)
  assert.equal(output[0].sessionId, info.sessionId)
  for (let index = 1; index < output.length; index += 1) {
    assert.ok(output[index].seq > output[index - 1].seq, '序号必须单调递增')
  }

  unsubscribe()
  const before = events.length
  harness.emitData(harness.records[0], 'ignored')
  await new Promise((resolveWait) => setTimeout(resolveWait, 30))
  assert.equal(events.length, before)
})

test('应用退出清理所有会话并释放 PTY 监听', async () => {
  const harness = await createHarness({
    roots: { p1: '/projects/one', p2: '/projects/two' },
    limits: { exitGraceMs: 5 },
  })
  await harness.service.create('p1')
  await harness.service.create('p2')
  assert.equal(harness.records.length, 2)

  await harness.service.disposeAll()

  assert.deepEqual(harness.service.list(), [])
  for (const record of harness.records) {
    assert.ok(record.groupSignals.includes('SIGHUP'), '清理时按进程组发信号，覆盖普通子进程')
    assert.equal(record.dataListeners.size, 0, '清理后必须释放 PTY 数据监听')
    assert.equal(record.exitListeners.size, 0, '清理后必须释放 PTY 退出监听')
  }
  await harness.service.disposeAll()
})
