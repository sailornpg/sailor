import assert from 'node:assert/strict'
import { mkdtemp, mkdir, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import test from 'node:test'
import { createServer } from 'vite'

const delay = (ms: number) => new Promise((done) => setTimeout(done, ms))

async function fixture(t: test.TestContext) {
  const dir = await mkdtemp(join(tmpdir(), 'sailor-notify-'))
  t.after(() => rm(dir, { recursive: true, force: true }))
  const vite = await createServer({
    logLevel: 'silent',
    server: { middlewareMode: true },
    resolve: { alias: { '@shared': resolve('src/shared') } },
  })
  t.after(() => vite.close())
  const { WorkspaceStore } = await vite.ssrLoadModule('/src/main/workspaces/WorkspaceStore.ts')
  const { WorkspaceService } = await vite.ssrLoadModule('/src/main/workspaces/WorkspaceService.ts')
  const project = join(dir, 'project')
  await mkdir(project)
  const notifications: number[] = []
  const service = new WorkspaceService(
    new WorkspaceStore(join(dir, 'state.json')),
    async () => project,
    () => {
      notifications.push(Date.now())
    },
  )
  const first = await service.pickProject()
  return { service, notifications, projectId: first.id }
}

const request = (chatId: string, runId: string) => ({
  chatId,
  runId,
  reasoning: 'provider-default',
  messages: [{ id: 'u1', role: 'user', parts: [{ type: 'text', text: '你好' }] }],
})

const history = (text: string) => [
  { id: 'u1', role: 'user', parts: [{ type: 'text', text: '你好' }] },
  { id: 'a1', role: 'assistant', parts: [{ type: 'text', text }] },
]

test('流式期间的多次持久化在节流窗口内只广播一次', async (t) => {
  const { service, notifications, projectId } = await fixture(t)
  const chat = await service.createChat(projectId)
  const runId = 'run-stream'

  await service.beginRun(request(chat.id, runId))
  for (let index = 0; index < 20; index += 1) {
    await service.updateRun(chat.id, runId, history(`第${index}次快照`))
  }
  await delay(200)

  assert.ok(
    notifications.length <= 4,
    `expected coalesced broadcasts, got ${notifications.length} for 20 persisted snapshots`,
  )
})

test('run 终态一定在合并后广播到 renderer', async (t) => {
  const { service, notifications, projectId } = await fixture(t)
  for (const round of ['一', '二']) {
    const chat = await service.createChat(projectId)
    const runId = `run-${round}`
    await service.beginRun(request(chat.id, runId))
    for (let index = 0; index < 8; index += 1) {
      await service.updateRun(chat.id, runId, history(`第${round}轮 ${index}`))
    }
    await service.finishRun(chat.id, runId, 'completed')
  }
  const finishedAt = Date.now()
  await delay(250)

  assert.ok(
    notifications.some((at) => at >= finishedAt),
    'the terminal run state was never broadcast',
  )
  const snapshot = await service.snapshot()
  assert.deepEqual(
    snapshot.chats.map((chat) => chat.status),
    ['completed', 'completed'],
  )
})
