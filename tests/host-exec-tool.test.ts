import assert from 'node:assert/strict'
import { join } from 'node:path'
import test from 'node:test'
import { createServer, type ViteDevServer } from 'vite'

const ALIASES = { '@shared': join(process.cwd(), 'src/shared') }
let server: ViteDevServer | null = null

async function load(path: string): Promise<Record<string, any>> {
  server ??= await createServer({
    logLevel: 'silent',
    server: { middlewareMode: true },
    resolve: { alias: ALIASES },
  })
  return server.ssrLoadModule(path)
}

test.after(async () => {
  await server?.close()
})

test('host_exec 使用主进程解析的工作区目录执行命令，并复用权限模式映射', async () => {
  const module = await load('/src/main/agent/host/hostExecTool.ts').catch(() =>
    assert.fail('host_exec 工具尚未实现'),
  )
  const calls: any[] = []
  const runSignal = new AbortController().signal
  const tools = module.createHostExecTool({
    rootPath: '/workspace/project',
    signal: runSignal,
    resolveCwd: async (cwd: string) => {
      calls.push(['resolveCwd', cwd])
      return `/workspace/project/${cwd}`
    },
    executor: {
      run: async (input: unknown) => {
        calls.push(['run', input])
        return { exitCode: 0, stdout: 'node-v', stderr: '', cwd: '/workspace/project/scripts' }
      },
    },
  })

  const result = await tools.host_exec.execute(
    { command: 'node --version', cwd: 'scripts' },
    { toolCallId: 'call-1', abortSignal: new AbortController().signal },
  )
  assert.equal(result.stdout, 'node-v')
  assert.deepEqual(calls, [
    ['resolveCwd', 'scripts'],
    [
      'run',
      {
        rootPath: '/workspace/project',
        cwd: '/workspace/project/scripts',
        command: 'node --version',
        signal: runSignal,
      },
    ],
  ])
  assert.equal(module.hostExecApprovalFor('allow-all'), 'approved')
  assert.equal(module.hostExecApprovalFor('allow-edits'), 'user-approval')
  assert.equal(module.hostExecApprovalFor('allow-reads'), 'user-approval')
})

test('侧聊不会注册 host_exec', async () => {
  const module = await load('/src/main/agent/host/hostExecTool.ts')
  const tools = module.createHostExecTool({
    enabled: false,
    rootPath: '/workspace/project',
    signal: new AbortController().signal,
    resolveCwd: async () => '/workspace/project',
    executor: { run: async () => ({}) },
  })
  assert.equal(Object.prototype.hasOwnProperty.call(tools, 'host_exec'), false)
})
