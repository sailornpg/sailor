import assert from 'node:assert/strict'
import { mkdir, mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import test from 'node:test'
import { createServer } from 'vite'

async function fixture(t: test.TestContext) {
  const dir = await mkdtemp(join(tmpdir(), 'sailor-side-lifecycle-'))
  t.after(() => rm(dir, { recursive: true, force: true }))
  const vite = await createServer({
    logLevel: 'silent',
    server: { middlewareMode: true },
    resolve: { alias: { '@shared': resolve('src/shared') } },
  })
  t.after(() => vite.close())
  const { WorkspaceStore } = await vite.ssrLoadModule('/src/main/workspaces/WorkspaceStore.ts')
  const { WorkspaceService } = await vite.ssrLoadModule('/src/main/workspaces/WorkspaceService.ts')
  const file = join(dir, 'workspaces.json')
  const store = new WorkspaceStore(file)
  const projectRoot = join(dir, 'project')
  await mkdir(projectRoot)
  const project = await store.addProject(projectRoot)
  const parent = await store.createChat(project.id)
  await store.updateChat(parent.id, {
    status: 'completed',
    messages: [
      { id: 'u1', role: 'user', parts: [{ type: 'text', text: '主问题' }] },
      { id: 'a1', role: 'assistant', parts: [{ type: 'text', text: '主回答' }] },
    ],
  })
  const service = new WorkspaceService(store, async () => projectRoot)
  const side = await service.createSideChat(parent.id)
  return { file, store, service, parent, side, Store: WorkspaceStore, Service: WorkspaceService }
}

test('父会话归档和恢复同步侧聊，重启后关系仍有效', async (t) => {
  const { file, service, parent, side, Store } = await fixture(t)
  await service.manageChat(parent.id, { action: 'archive' })
  const archived = new Store(file)
  assert.equal((await archived.getChat(parent.id)).archived, true)
  assert.equal((await archived.getChat(side.id)).archived, true)
  await service.manageChat(parent.id, { action: 'unarchive' })
  const restored = new Store(file)
  assert.equal((await restored.getChat(side.id)).archived, false)
})

test('删除父会话原子清理全部侧聊记录并返回待删 Pi 状态 ID', async (t) => {
  const { file, service, parent, side, Store } = await fixture(t)
  const other = await service.createSideChat(parent.id)
  const deleted = await service.manageChat(parent.id, { action: 'delete' })
  assert.deepEqual(new Set(deleted), new Set([parent.id, side.id, other.id]))
  const restarted = new Store(file)
  assert.deepEqual((await restarted.snapshot()).chats, [])
  await assert.rejects(restarted.getChat(side.id), /不存在/)
})

test('忙碌或未保存的侧聊阻止父会话归档删除；单独删除侧聊不影响父会话', async (t) => {
  const { file, store, service, parent, side, Store } = await fixture(t)
  await service.beginRun({
    chatId: side.id,
    runId: 'side-run',
    reasoning: 'provider-default',
    messages: [{ id: 'side-u1', role: 'user', parts: [{ type: 'text', text: '补充问题' }] }],
  })
  await assert.rejects(service.manageChat(parent.id, { action: 'archive' }), /侧聊|停止/)
  await assert.rejects(service.manageChat(parent.id, { action: 'delete' }), /侧聊|停止/)
  assert.equal((await new Store(file).getChat(parent.id)).archived, false)
  await service.finishRun(side.id, 'side-run', 'completed')

  const update = store.updateChat.bind(store)
  await service.beginRun({
    chatId: side.id,
    runId: 'side-run-2',
    reasoning: 'provider-default',
    messages: [{ id: 'side-u2', role: 'user', parts: [{ type: 'text', text: '继续' }] }],
  })
  store.updateChat = async () => {
    throw new Error('disk full')
  }
  await service.finishRun(side.id, 'side-run-2', 'completed')
  await assert.rejects(service.manageChat(parent.id, { action: 'delete' }), /侧聊|保存/)
  store.updateChat = update
  await service.retrySave(side.id)
  assert.deepEqual(await service.manageChat(side.id, { action: 'delete' }), [side.id])
  assert.equal((await new Store(file).getChat(parent.id)).id, parent.id)
})
