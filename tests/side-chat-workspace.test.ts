import assert from 'node:assert/strict'
import { mkdtemp, mkdir, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import test from 'node:test'
import { createServer } from 'vite'

async function fixture(t: test.TestContext) {
  const dir = await mkdtemp(join(tmpdir(), 'sailor-side-chat-'))
  t.after(() => rm(dir, { recursive: true, force: true }))
  const vite = await createServer({
    logLevel: 'silent',
    server: { middlewareMode: true },
    resolve: { alias: { '@shared': resolve('src/shared') } },
  })
  t.after(() => vite.close())
  const { WorkspaceStore } = await vite.ssrLoadModule('/src/main/workspaces/WorkspaceStore.ts')
  const { WorkspaceService } = await vite.ssrLoadModule('/src/main/workspaces/WorkspaceService.ts')
  const store = new WorkspaceStore(join(dir, 'workspaces.json'))
  const projectRoot = join(dir, 'project')
  await mkdir(projectRoot)
  const project = await store.addProject(projectRoot)
  const parent = await store.createChat(project.id)
  const service = new WorkspaceService(store, async () => projectRoot)
  return { store, service, parent, project, WorkspaceService }
}

const completedMessages = [
  { id: 'u1', role: 'user', parts: [{ type: 'text', text: '项目目标是什么？' }] },
  {
    id: 'a1',
    role: 'assistant',
    parts: [
      { type: 'reasoning', text: '不应进入快照' },
      { type: 'text', text: '目标是建立桌面工作区。' },
      {
        type: 'dynamic-tool',
        toolName: 'read',
        toolCallId: 'call-1',
        state: 'output-available',
        input: { file_path: 'x' },
        output: '不应进入快照',
      },
    ],
  },
]

test('从已完成主会话原子创建独立侧聊，保留冻结文本且不改变父记录或选择', async (t) => {
  const { store, service, parent } = await fixture(t)
  await store.updateChat(parent.id, { messages: completedMessages, status: 'completed' })
  const before = await store.getChat(parent.id)
  const activeBefore = (await store.snapshot()).activeChatId
  assert.equal(typeof service.createSideChat, 'function', '应提供 main-owned 侧聊创建操作')
  const side = await service.createSideChat(parent.id)
  assert.equal(side.projectId, parent.projectId)
  assert.equal(side.parentChatId, parent.id)
  assert.equal(side.forkMessageId, 'a1')
  assert.deepEqual(side.messages, [])
  assert.deepEqual(JSON.parse(side.contextSnapshot), [
    { role: 'user', text: '项目目标是什么？' },
    { role: 'assistant', text: '目标是建立桌面工作区。' },
  ])
  assert.deepEqual(await store.getChat(parent.id), before)
  assert.equal((await store.snapshot()).activeChatId, activeBefore)
  assert.deepEqual(await service.getChat(side.id), side)
})

test('运行中、未保存、无完整回答和侧聊父节点不能分叉', async (t) => {
  const { store, service, parent } = await fixture(t)
  assert.equal(typeof service.createSideChat, 'function')
  await assert.rejects(service.createSideChat(parent.id), /完成|回答/)
  await store.updateChat(parent.id, { messages: completedMessages, status: 'running' })
  await assert.rejects(service.createSideChat(parent.id), /运行|完成/)
  await store.updateChat(parent.id, { status: 'completed' })
  const side = await service.createSideChat(parent.id)
  await assert.rejects(service.createSideChat(side.id), /主会话|侧聊/)
  await assert.rejects(service.createSideChat('missing'), /会话/)
})

test('文本快照超限时拒绝且不创建侧聊', async (t) => {
  const { store, service, parent } = await fixture(t)
  assert.equal(typeof service.createSideChat, 'function')
  await store.updateChat(parent.id, {
    messages: [
      { id: 'u1', role: 'user', parts: [{ type: 'text', text: 'x'.repeat(70 * 1024) }] },
      { id: 'a1', role: 'assistant', parts: [{ type: 'text', text: '完成' }] },
    ],
    status: 'completed',
  })
  await assert.rejects(service.createSideChat(parent.id), /64 KiB|过大|超限/)
  assert.equal((await store.snapshot()).chats.length, 1)
})

test('原生 Pi 分叉可越过旧文本快照上限，分叉失败不留下侧聊', async (t) => {
  const { store, parent, WorkspaceService } = await fixture(t)
  await store.updateChat(parent.id, {
    messages: [
      { id: 'u1', role: 'user', parts: [{ type: 'text', text: 'x'.repeat(70 * 1024) }] },
      { id: 'a1', role: 'assistant', parts: [{ type: 'text', text: '完成' }] },
    ],
    status: 'completed',
  })
  const service = new WorkspaceService(
    store,
    async () => null,
    () => {},
    async () => true,
  )
  const side = await service.createSideChat(parent.id)
  assert.equal(side.contextSnapshot, undefined)
  assert.equal((await store.getChat(side.id)).parentChatId, parent.id)
  const withoutCheckpoint = new WorkspaceService(
    store,
    async () => null,
    () => {},
    async () => false,
  )
  await assert.rejects(withoutCheckpoint.createSideChat(parent.id), /64 KiB|Pi 状态/)
  assert.equal((await store.snapshot()).chats.length, 2)
})

test('没有原生 Pi 状态的图片会话不能伪装为完整侧聊', async (t) => {
  const { store, service, parent } = await fixture(t)
  await store.updateChat(parent.id, {
    messages: [
      {
        id: 'u1',
        role: 'user',
        parts: [
          { type: 'file', mediaType: 'image/png', url: 'data:image/png;base64,AA==' },
          { type: 'text', text: '图片是什么？' },
        ],
      },
      { id: 'a1', role: 'assistant', parts: [{ type: 'text', text: '绿色图标。' }] },
    ],
    status: 'completed',
  })
  await assert.rejects(service.createSideChat(parent.id), /图片|Pi 状态|完整继承/)
  assert.equal((await store.snapshot()).chats.length, 1)
})
