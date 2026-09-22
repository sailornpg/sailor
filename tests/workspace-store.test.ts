import assert from 'node:assert/strict'
import { mkdtemp, mkdir, readFile, writeFile, symlink, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import test from 'node:test'
import { createServer } from 'vite'

async function fixture(t: test.TestContext) {
  const dir = await mkdtemp(join(tmpdir(), 'sailor-store-'))
  t.after(() => rm(dir, { recursive: true, force: true }))
  const vite = await createServer({ logLevel: 'silent', server: { middlewareMode: true }, resolve: { alias: { '@shared': resolve('src/shared') } } })
  t.after(() => vite.close())
  const mod = await vite.ssrLoadModule('/src/main/workspaces/WorkspaceStore.ts').catch(() => ({}))
  assert.equal(typeof mod.WorkspaceStore, 'function', '需要实现工作区仓库')
  const file = join(dir, 'state.json')
  const project = join(dir, 'project'); await mkdir(project)
  return { dir, file, project, Store: mod.WorkspaceStore, store: new mod.WorkspaceStore(file) }
}
const message = (text: string) => [{ id: 'u1', role: 'user', parts: [{ type: 'text', text }] }]

test('真实目录去重，包括符号链接；取消外的无效目录不能注册', async t => {
  const { store, project, dir } = await fixture(t)
  await symlink(project, join(dir, 'alias'))
  const a = await store.addProject(project)
  const b = await store.addProject(join(dir, 'alias'))
  assert.equal(a.id, b.id)
  assert.equal((await store.snapshot()).projects.length, 1)
  await assert.rejects(store.addProject(join(dir, 'missing')), /目录/)
})

test('会话外键、首条标题限长、完整 parts 和偏好在重启后恢复', async t => {
  const { store, project, Store, file } = await fixture(t)
  await assert.rejects(store.createChat('missing'), /工作区/)
  const p = await store.addProject(project)
  const c = await store.createChat(p.id)
  const messages = [...message('标题'.repeat(50)), { id: 'a1', role: 'assistant', parts: [{ type: 'reasoning', text: '摘要' }, { type: 'tool-updatePlan', toolCallId: 't1', state: 'output-available', input: { steps: [] }, output: { steps: [] } }] }]
  await store.updateChat(c.id, { messages, runId: 'r1', status: 'completed', unread: true })
  await store.setPreferences({ activeChatId: c.id, collapsedProjectIds: [p.id] })
  const restarted = new Store(file)
  assert.deepEqual((await restarted.getChat(c.id)).messages, messages)
  assert.equal((await restarted.getChat(c.id)).title.length, 40)
  assert.equal((await restarted.snapshot()).activeChatId, c.id)
  assert.deepEqual((await restarted.snapshot()).collapsedProjectIds, [p.id])
})

test('并发写入不丢会话，旧 run 不能覆盖新 run', async t => {
  const { store, project } = await fixture(t)
  const p = await store.addProject(project)
  const [a, b] = await Promise.all([store.createChat(p.id), store.createChat(p.id)])
  await Promise.all([store.updateChat(a.id, { runId: 'a', messages: message('A') }), store.updateChat(b.id, { runId: 'b', messages: message('B') })])
  assert.equal((await store.getChat(a.id)).messages[0].parts[0].text, 'A')
  assert.equal((await store.getChat(b.id)).messages[0].parts[0].text, 'B')
  await assert.rejects(store.updateChat(a.id, { messages: message('late') }, 'old'), /过期/)
  assert.equal((await store.snapshot()).chats.length, 2)
})

test('损坏和非法外键文件不被覆盖', async t => {
  const { file, project, Store } = await fixture(t)
  for (const data of ['{broken', JSON.stringify({ version: 1, projects: [], chats: [{ id: 'x', projectId: 'missing' }] })]) {
    await writeFile(file, data)
    const store = new Store(file)
    await assert.rejects(store.addProject(project), /工作区数据/)
    assert.equal(await readFile(file, 'utf8'), data)
  }
})

test('手动重命名不被后续消息覆盖，归档恢复与删除在重启后保留', async t => {
  const { store, project, Store, file } = await fixture(t)
  const p = await store.addProject(project)
  const c = await store.createChat(p.id)
  await store.manageChat(c.id, { action: 'rename', title: '固定标题' })
  await store.updateChat(c.id, { messages: message('新的消息') })
  assert.equal((await new Store(file).getChat(c.id)).title, '固定标题')
  await store.manageChat(c.id, { action: 'archive' })
  assert.equal((await new Store(file).getChat(c.id)).archived, true)
  assert.equal((await store.snapshot()).activeChatId, null)
  await store.manageChat(c.id, { action: 'unarchive' })
  assert.equal((await store.getChat(c.id)).archived, false)
  await store.manageChat(c.id, { action: 'delete' })
  await assert.rejects(new Store(file).getChat(c.id), /不存在/)
  assert.equal((await store.snapshot()).chats.length, 0)
})
