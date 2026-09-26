import assert from 'node:assert/strict'
import { mkdtemp, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import { createServer } from 'vite'

async function load(t: test.TestContext) {
  const root = await mkdtemp(join(tmpdir(), 'sailor-permissions-'))
  const vite = await createServer({ logLevel: 'silent', server: { middlewareMode: true } })
  t.after(async () => {
    await vite.close()
    await import('node:fs/promises').then(({ rm }) => rm(root, { recursive: true, force: true }))
  })
  return {
    root,
    ...(await vite.ssrLoadModule('/src/main/workspaces/WorkspaceStore.ts')),
    WorkspaceService: (await vite.ssrLoadModule('/src/main/workspaces/WorkspaceService.ts'))
      .WorkspaceService,
  }
}

test('defaults legacy projects to allow-all and persists validated permission modes', async (t) => {
  const { root, WorkspaceStore, WorkspaceService } = await load(t)
  const file = join(root, 'workspaces.json')
  await writeFile(
    file,
    JSON.stringify({
      version: 1,
      projects: [{ id: 'p1', name: 'Project', rootPath: root }],
      chats: [],
      activeChatId: null,
      collapsedProjectIds: [],
    }),
  )
  const store = new WorkspaceStore(file)
  const service = new WorkspaceService(store, async () => root)
  assert.equal((await service.snapshot()).projects[0].permissionMode, 'allow-all')
  await service.setPermission({ projectId: 'p1', mode: 'allow-edits' })
  assert.equal((await service.snapshot()).projects[0].permissionMode, 'allow-edits')
  const project = await service.createChat('p1')
  assert.equal(
    (await service.resolveToolContext(project.id, new AbortController().signal)).permissionMode,
    'allow-edits',
  )
  assert.match(await readFile(file, 'utf8'), /allow-edits/)
  await assert.rejects(
    service.setPermission({ projectId: 'missing', mode: 'allow-all' }),
    /工作区不存在/,
  )
  await assert.rejects(
    service.setPermission({ projectId: 'p1', mode: 'unsafe' as never }),
    /无效|Invalid/,
  )
})
