import assert from 'node:assert/strict'
import { mkdtemp, mkdir, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import test from 'node:test'
import { createServer } from 'vite'

async function fixture(t: test.TestContext) {
  const dir = await mkdtemp(join(tmpdir(), 'sailor-ipc-'))
  t.after(() => rm(dir, { recursive: true, force: true }))
  const vite = await createServer({ logLevel: 'silent', server: { middlewareMode: true }, resolve: { alias: { '@shared': resolve('src/shared') } } })
  t.after(() => vite.close())
  const mod = await vite.ssrLoadModule('/src/main/workspaces/WorkspaceService.ts').catch(() => ({}))
  assert.equal(typeof mod.WorkspaceService, 'function', '需要目录选择与输入校验服务')
  const { WorkspaceStore } = await vite.ssrLoadModule('/src/main/workspaces/WorkspaceStore.ts')
  const project = join(dir, 'project'); await mkdir(project)
  let selected: string | null = null
  const store = new WorkspaceStore(join(dir, 'state.json'))
  const service = new mod.WorkspaceService(store, async () => selected)
  return { service, store, project, choose: () => { selected = project } }
}
const request = (chatId: string) => ({ chatId, runId: 'run-1', reasoning: 'provider-default', messages: [{ id: 'u', role: 'user', parts: [{ type: 'text', text: '你好' }] }] })

test('取消目录选择无记录，选择后可创建并读取会话', async t => {
  const { service, choose } = await fixture(t)
  assert.equal(await service.pickProject(), null)
  assert.equal((await service.snapshot()).projects.length, 0)
  choose()
  const p = await service.pickProject()
  const c = await service.createChat(p.id)
  assert.equal((await service.getChat(c.id)).projectId, p.id)
  await assert.rejects(service.createChat({ malicious: true }))
})

test('根据 chatId 解析真实目录，拒绝非法消息和不存在会话', async t => {
  const { service, choose } = await fixture(t)
  choose(); const p = await service.pickProject(); const c = await service.createChat(p.id)
  const valid = await service.validateRequest({ ...request(c.id), rootPath: '/untrusted' })
  assert.equal(valid.chatId, c.id)
  assert.equal(valid.rootPath, undefined)
  await assert.rejects(service.validateRequest(request('unknown')), /会话/)
  await assert.rejects(service.validateRequest({ ...request(c.id), messages: [{ role: 'user', parts: [{ type: 'text', text: 9 }] }] }), /消息|输入/)
})

test('目录失效可读历史，但禁止运行；恢复消息用 SDK 验证', async t => {
  const { service, store, project, choose } = await fixture(t)
  choose(); const p = await service.pickProject(); const c = await service.createChat(p.id)
  await rm(project, { recursive: true })
  assert.equal((await service.getChat(c.id)).id, c.id)
  await assert.rejects(service.validateRequest(request(c.id)), /目录/)
  await store.updateChat(c.id, { messages: [{ id: 'bad', role: 'assistant', parts: [{ type: 'nonsense' }] }] })
  await assert.rejects(service.getChat(c.id), /消息/)
})
