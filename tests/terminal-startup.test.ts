import assert from 'node:assert/strict'
import { resolve } from 'node:path'
import test, { after } from 'node:test'
import { createServer, type ViteDevServer } from 'vite'

const ALIASES = {
  '@': resolve('src/renderer/src'),
  '@shared': resolve('src/shared'),
}

let server: ViteDevServer | null = null

async function load(path: string): Promise<Record<string, any>> {
  server ??= await createServer({ logLevel: 'silent', server: { middlewareMode: true }, resolve: { alias: ALIASES } })
  return server.ssrLoadModule(path)
}

after(async () => {
  await server?.close()
})

async function loadStartup() {
  const startup = await load('/src/renderer/src/lib/terminal/terminalStartup.ts').catch(() => assert.fail('终端自动启动逻辑尚未实现'))
  assert.equal(typeof startup.needsAutoStart, 'function', '需要可测试的启动判定')
  assert.equal(typeof startup.startFirstSession, 'function', '需要带并发去重的启动函数')
  return startup
}

const info = (ordinal: number) => ({
  projectId: 'p1',
  sessionId: `s${ordinal}`,
  ordinal,
  status: 'running',
  shell: 'zsh',
  pid: 4000 + ordinal,
  cols: 80,
  rows: 24,
  exit: null,
  failure: null,
})

test('只有完全没有会话时才需要自动启动', async () => {
  const { needsAutoStart } = await loadStartup()
  assert.equal(needsAutoStart([]), true)
  assert.equal(needsAutoStart([info(1)]), false)
  assert.equal(needsAutoStart([info(1), info(2)]), false)
  assert.equal(
    needsAutoStart([{ ...info(1), status: 'exited', exit: { code: 0, signal: null } }]),
    false,
    '已退出的 tab 仍然算已有会话，重开面板不能偷偷新建 shell',
  )
})

test('同一工作区的并发启动只发起一次创建', async () => {
  const { startFirstSession } = await loadStartup()
  const calls: any[] = []
  let resolveCreate: (value: any) => void = () => undefined
  const api = {
    create: (input: any) => {
      calls.push(input)
      return new Promise(resolve => {
        resolveCreate = resolve
      })
    },
  }

  const first = startFirstSession(api, 'p1')
  const second = startFirstSession(api, 'p1')
  assert.equal(calls.length, 1, '重复挂载或并发调用不能创建两个终端')

  resolveCreate(info(1))
  const [a, b] = await Promise.all([first, second])
  assert.equal(a.sessionId, 's1')
  assert.equal(b.sessionId, 's1')
  assert.deepEqual(calls[0], { projectId: 'p1', cols: 80, rows: 24 })
})

test('创建失败后可以重试，且不同工作区互不影响', async () => {
  const { startFirstSession } = await loadStartup()
  const calls: string[] = []
  let fail = true
  const api = {
    create: async (input: any) => {
      calls.push(input.projectId)
      if (fail && input.projectId === 'p1') throw new Error('无法启动终端：boom')
      return { ...info(calls.length), projectId: input.projectId }
    },
  }

  await assert.rejects(startFirstSession(api, 'p1'), /boom/)
  const other = await startFirstSession(api, 'p2')
  assert.equal(other.projectId, 'p2')
  assert.deepEqual(calls, ['p1', 'p2'])

  fail = false
  const retried = await startFirstSession(api, 'p1')
  assert.equal(retried.projectId, 'p1', '失败后必须允许重试')
  assert.deepEqual(calls, ['p1', 'p2', 'p1'])
})
