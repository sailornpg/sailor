import assert from 'node:assert/strict'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
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

test('在工作区根目录执行真实命令并返回 stdout、stderr 和退出码', async (t) => {
  const root = await mkdtemp(join(tmpdir(), 'sailor-host-command-'))
  t.after(() => rm(root, { recursive: true, force: true }))
  const module = await load('/src/main/agent/host/HostCommandExecutor.ts').catch(() =>
    assert.fail('HostCommandExecutor 尚未实现'),
  )
  const executor = new module.HostCommandExecutor({
    env: { SHELL: '/bin/sh', PATH: process.env.PATH ?? '/usr/bin:/bin', HOME: root },
  })

  const result = await executor.run({
    rootPath: root,
    command: 'printf out; printf err >&2; exit 7',
  })

  assert.equal(result.cwd, root)
  assert.equal(result.stdout, 'out')
  assert.equal(result.stderr, 'err')
  assert.equal(result.exitCode, 7)
  assert.equal(result.timedOut, false)
  assert.equal(result.aborted, false)
})

test('login shell 会加载用户交互配置，以便取得 nvm 等初始化的 PATH', async (t) => {
  const root = await mkdtemp(join(tmpdir(), 'sailor-host-command-'))
  t.after(() => rm(root, { recursive: true, force: true }))
  await writeFile(join(root, '.zshrc'), 'export SAILOR_HOST_EXEC_PROFILE=loaded\n')
  const module = await load('/src/main/agent/host/HostCommandExecutor.ts')
  const executor = new module.HostCommandExecutor({
    env: { SHELL: '/bin/zsh', PATH: process.env.PATH ?? '/usr/bin:/bin', HOME: root },
  })

  const result = await executor.run({
    rootPath: root,
    command: 'printf %s "$SAILOR_HOST_EXEC_PROFILE"',
  })

  assert.equal(result.exitCode, 0)
  assert.equal(result.stdout, 'loaded')
})

test('拒绝离开工作区的 cwd，并在超时或取消时终止宿主进程', async (t) => {
  const root = await mkdtemp(join(tmpdir(), 'sailor-host-command-'))
  t.after(() => rm(root, { recursive: true, force: true }))
  const module = await load('/src/main/agent/host/HostCommandExecutor.ts')
  const executor = new module.HostCommandExecutor({
    env: { SHELL: '/bin/sh', PATH: process.env.PATH ?? '/usr/bin:/bin', HOME: root },
    limits: { timeoutMs: 100 },
  })

  await assert.rejects(
    executor.run({ rootPath: root, cwd: '..', command: 'printf should-not-run' }),
    /工作区|cwd|目录/i,
  )

  const controller = new AbortController()
  const pending = executor.run({ rootPath: root, command: 'sleep 10', signal: controller.signal })
  setTimeout(() => controller.abort(), 20)
  const result = await pending
  assert.equal(result.aborted, true)
  assert.equal(result.timedOut, false)

  const timeoutExecutor = new module.HostCommandExecutor({
    env: { SHELL: '/bin/sh', PATH: process.env.PATH ?? '/usr/bin:/bin', HOME: root },
    limits: { timeoutMs: 20, killGraceMs: 20 },
  })
  const timedOut = await timeoutExecutor.run({ rootPath: root, command: 'sleep 10' })
  assert.equal(timedOut.timedOut, true)
  assert.equal(timedOut.aborted, false)
})

test('输出超过上限时返回截断结果并停止命令', async (t) => {
  const root = await mkdtemp(join(tmpdir(), 'sailor-host-command-'))
  t.after(() => rm(root, { recursive: true, force: true }))
  const module = await load('/src/main/agent/host/HostCommandExecutor.ts')
  const executor = new module.HostCommandExecutor({
    env: { SHELL: '/bin/sh', PATH: process.env.PATH ?? '/usr/bin:/bin', HOME: root },
    limits: { maxOutputBytes: 32 },
  })

  const result = await executor.run({
    rootPath: root,
    command: 'printf 1234567890123456789012345678901234567890',
  })
  assert.equal(result.truncated, true)
  assert.ok(Buffer.byteLength(result.stdout) <= 32)
})
