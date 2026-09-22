import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import test from 'node:test'
import { createServer } from 'vite'

test('会话管理校验输入、阻止运行和未保存时修改，并清理 live 缓存', async t => {
  const dir = await mkdtemp(join(tmpdir(), 'sailor-manage-'))
  t.after(() => rm(dir, { recursive: true, force: true }))
  const vite = await createServer({ logLevel: 'silent', server: { middlewareMode: true }, resolve: { alias: { '@shared': resolve('src/shared') } } })
  t.after(() => vite.close())
  const { WorkspaceStore } = await vite.ssrLoadModule('/src/main/workspaces/WorkspaceStore.ts')
  const { WorkspaceService } = await vite.ssrLoadModule('/src/main/workspaces/WorkspaceService.ts')
  const store = new WorkspaceStore(join(dir, 'state.json'))
  const service = new WorkspaceService(store, async () => dir)
  const project = await service.pickProject()
  const chat = await service.createChat(project.id)
  for (const change of [{ action: 'rename', title: '' }, { action: 'rename', title: 'a'.repeat(121) }, { action: 'invalid' }]) await assert.rejects(service.manageChat(chat.id, change))
  const request = { chatId: chat.id, runId: 'run', messages: [], reasoning: 'provider-default' }
  await service.beginRun(request)
  for (const action of ['rename', 'archive', 'delete']) await assert.rejects(service.manageChat(chat.id, { action, title: '改名' }), /停止/)
  await service.finishRun(chat.id, 'run', 'completed')
  await service.manageChat(chat.id, { action: 'rename', title: '  我的任务  ' })
  assert.equal((await service.snapshot()).chats[0].title, '我的任务')
  await service.manageChat(chat.id, { action: 'archive' })
  await assert.rejects(service.beginRun(request), /恢复/)
  await service.manageChat(chat.id, { action: 'unarchive' })
  await service.beginRun(request)
  const update = store.updateChat.bind(store)
  store.updateChat = async () => { throw new Error('disk full') }
  await service.finishRun(chat.id, 'run', 'completed')
  await assert.rejects(service.manageChat(chat.id, { action: 'delete' }), /保存/)
  store.updateChat = update
  await service.retrySave(chat.id)
  await service.manageChat(chat.id, { action: 'delete' })
  await assert.rejects(service.getChat(chat.id), /不存在/)
  assert.equal((await service.snapshot()).chats.length, 0)
})
