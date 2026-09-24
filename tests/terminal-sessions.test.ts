import assert from 'node:assert/strict'
import { resolve } from 'node:path'
import test, { after } from 'node:test'
import { createServer, type ViteDevServer } from 'vite'

const ALIASES = { '@shared': resolve('src/shared') }

let server: ViteDevServer | null = null

async function load(path: string): Promise<Record<string, any>> {
  server ??= await createServer({ logLevel: 'silent', server: { middlewareMode: true }, resolve: { alias: ALIASES } })
  return server.ssrLoadModule(path)
}

after(async () => {
  await server?.close()
})

async function loadService() {
  const shared = await load('/src/shared/terminal.ts').catch(() => assert.fail('共享终端契约尚未实现'))
  const serviceModule = await load('/src/main/terminal/TerminalService.ts').catch(() => assert.fail('工作区终端服务尚未实现'))
  assert.equal(typeof serviceModule.TerminalService, 'function')
  return { shared, serviceModule }
}

interface SpawnRecord {
  pid: number
  written: string[]
  groupSignals: string[]
  kills: Array<string | undefined>
  dataListeners: Set<(data: string) => void>
  exitListeners: Set<(event: { code: number | null; signal: number | null }) => void>
}

function createPtyDouble() {
  const records: SpawnRecord[] = []
  const adapter = {
    spawn() {
      const record: SpawnRecord = {
        pid: 5000 + records.length,
        written: [],
        groupSignals: [],
        kills: [],
        dataListeners: new Set(),
        exitListeners: new Set(),
      }
      records.push(record)
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
        resize() {},
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
    emitData(record: SpawnRecord, data: string) {
      for (const listener of [...record.dataListeners]) listener(data)
    },
    emitExit(record: SpawnRecord, code = 0) {
      for (const listener of [...record.exitListeners]) listener({ code, signal: null })
    },
  }
}

const ROOTS: Record<string, string> = { p1: '/projects/one', p2: '/projects/two', p3: '/projects/three' }

async function createHarness(limits: Record<string, number> = {}) {
  const { shared, serviceModule } = await loadService()
  const pty = createPtyDouble()
  const service = new serviceModule.TerminalService({
    resolveProjectRoot: async (projectId: string) => {
      const root = ROOTS[projectId]
      if (!root) throw new Error(`工作区不存在：${projectId}`)
      return root
    },
    adapter: pty.adapter,
    env: { SHELL: '/bin/zsh' },
    limits: { exitGraceMs: 5, ...limits },
  })
  return { shared, serviceModule, service, pty }
}

const size = { cols: 80, rows: 24 }

test('每次 create 都新建独立会话，并按创建顺序给出稳定 ordinal', async () => {
  const { service, pty } = await createHarness()
  const first = await service.create('p1', size)
  const second = await service.create('p1', size)

  assert.notEqual(first.sessionId, second.sessionId)
  assert.notEqual(first.pid, second.pid)
  assert.equal(pty.records.length, 2)
  assert.equal(first.ordinal, 1)
  assert.equal(second.ordinal, 2)

  const list = service.list('p1')
  assert.deepEqual(list.map((entry: any) => entry.sessionId), [first.sessionId, second.sessionId])
  assert.deepEqual(list.map((entry: any) => entry.ordinal), [1, 2])
  assert.equal(list.every((entry: any) => entry.status === 'running'), true)
})

test('会话列表与归属按工作区隔离', async () => {
  const { service } = await createHarness()
  const one = await service.create('p1', size)
  const two = await service.create('p2', size)

  assert.deepEqual(service.list('p1').map((entry: any) => entry.sessionId), [one.sessionId])
  assert.deepEqual(service.list('p2').map((entry: any) => entry.sessionId), [two.sessionId])
  assert.equal(service.list().length, 2, '不带参数时返回全部工作区会话')
  assert.equal(service.find('p1', one.sessionId)?.sessionId, one.sessionId)
  assert.equal(service.find('p2', one.sessionId), null, '跨工作区查找必须失败')
  assert.equal(service.find('p1', 'made-up'), null)
  assert.equal(service.find('missing-project', 'anything'), null)
})

test('每工作区同时存活上限可配置，超限时给出可读错误且不启动进程', async () => {
  const { service, pty } = await createHarness({ maxSessionsPerProject: 2 })
  const first = await service.create('p1', size)
  await service.create('p1', size)

  await assert.rejects(service.create('p1', size), (error: any) => {
    assert.equal(error.code, 'SESSION_LIMIT')
    assert.match(error.message, /2/)
    return true
  })
  assert.equal(pty.records.length, 2, '超限请求不能偷偷启动第三个 shell')

  await service.terminate('p1', first.sessionId)
  const third = await service.create('p1', size)
  assert.equal(third.status, 'running')
  assert.equal(pty.records.length, 3, '关闭一个 tab 后必须能再新建')
})

test('全局上限回收最久未使用的会话，其它工作区会话继续存活', async () => {
  const { service, pty } = await createHarness({ maxSessions: 2, maxSessionsPerProject: 4 })
  const first = await service.create('p1', size)
  await new Promise(resolveWait => setTimeout(resolveWait, 5))
  const second = await service.create('p2', size)
  await new Promise(resolveWait => setTimeout(resolveWait, 5))
  const third = await service.create('p2', size)

  assert.equal(service.find('p1', first.sessionId), null, '最久未使用的会话被回收')
  assert.ok(service.find('p2', second.sessionId))
  assert.ok(service.find('p2', third.sessionId))
  assert.ok(pty.records[0].groupSignals.includes('SIGHUP'))
  await assert.rejects(service.write('p1', first.sessionId, 'x'), (error: any) => error.code === 'SESSION_NOT_FOUND')
})

test('shell 自行退出后会话保留可读状态与尾部输出，显式关闭才移除记录', async () => {
  const { service, pty } = await createHarness()
  const info = await service.create('p1', size)

  pty.emitData(pty.records[0], 'bye\n')
  pty.emitExit(pty.records[0], 0)

  const exited = service.find('p1', info.sessionId)
  assert.equal(exited?.status, 'exited')
  assert.deepEqual(exited?.exit, { code: 0, signal: null })
  assert.equal(service.outputSnapshot('p1', info.sessionId, 0).chunks.map((chunk: any) => chunk.data).join(''), 'bye\n')
  assert.equal(service.list('p1').length, 1, '退出的 tab 仍应保留给用户查看')

  await service.terminate('p1', info.sessionId)
  assert.equal(service.list('p1').length, 0, '关闭已退出的 tab 必须移除记录')
})

test('终止只影响目标会话，另一个终端继续运行', async () => {
  const { service, pty } = await createHarness()
  const first = await service.create('p1', size)
  const second = await service.create('p1', size)

  await service.terminate('p1', first.sessionId)

  assert.equal(service.find('p1', first.sessionId), null)
  assert.equal(service.find('p1', second.sessionId)?.status, 'running')
  assert.deepEqual(pty.records[1].groupSignals, [], '另一个终端不能被牵连')
  assert.deepEqual(pty.records[1].kills, [])

  await service.write('p1', second.sessionId, 'still-alive\r')
  assert.deepEqual(pty.records[1].written, ['still-alive\r'])
})

test('切换与附着不重建进程，只更新最近使用顺序', async () => {
  const { service, pty } = await createHarness({ maxSessions: 2, maxSessionsPerProject: 4 })
  const first = await service.create('p1', size)
  const second = await service.create('p2', size)

  service.markActive('p1', first.sessionId)
  assert.equal(service.find('p1', first.sessionId)?.pid, first.pid)
  assert.equal(pty.records.length, 2, '附着不能新建 shell')
  assert.deepEqual(pty.records[0].groupSignals, [])
  assert.deepEqual(pty.records[1].groupSignals, [])

  await new Promise(resolveWait => setTimeout(resolveWait, 5))
  await service.create('p2', size)
  assert.ok(service.find('p1', first.sessionId), '刚附着过的会话不应被回收')
  assert.equal(service.find('p2', second.sessionId), null, '未附着的旧会话被回收')
})

test('退出的会话不占存活上限，但记录数量受上限约束', async () => {
  const { service, pty } = await createHarness({ maxSessionsPerProject: 1, maxTrackedSessionsPerProject: 2 })
  const first = await service.create('p1', size)
  pty.emitExit(pty.records[0], 0)
  assert.equal(service.find('p1', first.sessionId)?.status, 'exited')

  const second = await service.create('p1', size)
  assert.equal(second.status, 'running', '已退出的会话不占用存活上限')
  assert.equal(service.list('p1').length, 2, '退出的 tab 仍在列表里')

  pty.emitExit(pty.records[1], 0)
  const third = await service.create('p1', size)
  assert.equal(third.status, 'running')
  assert.equal(service.list('p1').length, 2, '跟踪的记录数不能无限增长，最旧的已退出记录被回收')
  assert.equal(service.find('p1', first.sessionId), null)
})
