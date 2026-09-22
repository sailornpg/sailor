import assert from 'node:assert/strict'
import { mkdtemp, mkdir, readFile, realpath, rm, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import test from 'node:test'
import { createServer } from 'vite'

async function fixture(t: test.TestContext) {
  const directory = await mkdtemp(join(tmpdir(), 'sailor-tool-scope-'))
  t.after(() => rm(directory, { recursive: true, force: true }))
  const vite = await createServer({
    logLevel: 'silent',
    resolve: { alias: { '@shared': resolve(process.cwd(), 'src/shared') } },
    server: { middlewareMode: true },
  })
  t.after(() => vite.close())
  const { WorkspaceStore } = await vite.ssrLoadModule('/src/main/workspaces/WorkspaceStore.ts')
  const { WorkspaceService } = await vite.ssrLoadModule('/src/main/workspaces/WorkspaceService.ts')
  const firstRoot = join(directory, 'first')
  const secondRoot = join(directory, 'second')
  const outsideRoot = join(directory, 'outside')
  await Promise.all([mkdir(join(firstRoot, 'src'), { recursive: true }), mkdir(secondRoot), mkdir(outsideRoot)])
  await Promise.all([
    writeFile(join(firstRoot, 'src/app.ts'), 'export const app = true\n'),
    writeFile(join(secondRoot, 'same.txt'), 'second\n'),
    writeFile(join(outsideRoot, 'secret.txt'), 'outside\n'),
    writeFile(join(firstRoot, '.env'), 'TOKEN=secret\n'),
  ])
  await symlink(join(outsideRoot, 'secret.txt'), join(firstRoot, 'outside-link'))
  const store = new WorkspaceStore(join(directory, 'state.json'))
  const firstProject = await store.addProject(firstRoot)
  const secondProject = await store.addProject(secondRoot)
  const firstChat = await store.createChat(firstProject.id)
  const secondChat = await store.createChat(secondProject.id)
  const service = new WorkspaceService(store, async () => null)
  return { directory, firstRoot, secondRoot, firstChat, secondChat, service }
}

async function rejectsWithCode(operation: Promise<unknown>, code: string) {
  await assert.rejects(operation, (error: any) => {
    assert.equal(error.code, code)
    assert.ok(Array.isArray(error.recovery) && error.recovery.length > 0)
    return true
  })
}

test('resolves a canonical read-only scope from chatId and isolates chats', async t => {
  const { firstRoot, secondRoot, firstChat, secondChat, service } = await fixture(t)
  const first = await service.resolveToolContext(firstChat.id, new AbortController().signal)
  const second = await service.resolveToolContext(secondChat.id, new AbortController().signal)

  assert.equal(first.chatId, firstChat.id)
  assert.equal(first.rootPath, await realpath(firstRoot))
  assert.equal(await first.scope.resolvePath('src/app.ts', 'file'), join(first.rootPath, 'src/app.ts'))
  assert.equal(await second.scope.resolvePath('same.txt', 'file'), join(await realpath(secondRoot), 'same.txt'))
  await rejectsWithCode(second.scope.resolvePath('src/app.ts', 'file'), 'NOT_FOUND')
  await assert.rejects(service.resolveToolContext('missing-chat', new AbortController().signal), /会话/)
})

test('rejects absolute traversal, symlink escape and sensitive paths', async t => {
  const { firstRoot, firstChat, service } = await fixture(t)
  const { scope } = await service.resolveToolContext(firstChat.id, new AbortController().signal)

  await rejectsWithCode(scope.resolvePath(join(firstRoot, 'src/app.ts'), 'file'), 'INVALID_ARGUMENT')
  await rejectsWithCode(scope.resolvePath('../outside/secret.txt', 'file'), 'OUTSIDE_WORKSPACE')
  await rejectsWithCode(scope.resolvePath('outside-link', 'file'), 'OUTSIDE_WORKSPACE')
  await rejectsWithCode(scope.resolvePath('.env', 'file'), 'SENSITIVE_PATH')
  await rejectsWithCode(scope.resolvePath('.git/config', 'file'), 'SENSITIVE_PATH')
})

test('reports invalid workspaces and cancellation without crossing sessions', async t => {
  const { firstRoot, firstChat, secondChat, service } = await fixture(t)
  const controller = new AbortController()
  controller.abort()
  await rejectsWithCode(service.resolveToolContext(firstChat.id, controller.signal), 'CANCELLED')

  await rm(firstRoot, { recursive: true })
  await rejectsWithCode(service.resolveToolContext(firstChat.id, new AbortController().signal), 'WORKSPACE_UNAVAILABLE')
  const second = await service.resolveToolContext(secondChat.id, new AbortController().signal)
  assert.equal(await second.scope.resolvePath('.', 'directory'), second.rootPath)
})

test('does not expose generic filesystem access to the renderer bridge', async () => {
  const [contracts, preload] = await Promise.all([
    readFile('src/shared/contracts.ts', 'utf8'),
    readFile('src/preload/index.ts', 'utf8'),
  ])
  assert.doesNotMatch(contracts, /\b(?:readFile|readdir|realpath|writeFile)\s*\(/)
  assert.doesNotMatch(preload, /\b(?:readFile|readdir|realpath|writeFile)\s*\(/)
})
