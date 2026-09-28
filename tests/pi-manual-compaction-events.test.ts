import assert from 'node:assert/strict'
import test from 'node:test'
import { mkdtemp, mkdir, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { createServer } from 'vite'

async function fixture(t: import('node:test').TestContext) {
  const root = await mkdtemp(join(tmpdir(), 'sailor-manual-pi-'))
  t.after(() => rm(root, { recursive: true, force: true }))
  await mkdir(join(root, 'project'))
  const vite = await createServer({
    logLevel: 'silent',
    resolve: { alias: { '@shared': resolve(process.cwd(), 'src/shared') } },
    server: { middlewareMode: true },
  })
  t.after(() => vite.close())
  const { WorkspaceStore } = await vite.ssrLoadModule('/src/main/workspaces/WorkspaceStore.ts')
  const { WorkspaceService } = await vite.ssrLoadModule('/src/main/workspaces/WorkspaceService.ts')
  const { AgentService } = await vite.ssrLoadModule('/src/main/agent/AgentService.ts')
  const store = new WorkspaceStore(join(root, 'workspaces.json'))
  const workspace = new WorkspaceService(store, async () => join(root, 'project'))
  const project = await workspace.pickProject()
  const chat = await workspace.createChat(project.id)
  await store.updateChat(chat.id, {
    messages: [{ id: 'user-1', role: 'user', parts: [{ type: 'text', text: 'compress this' }] }],
  })
  return { vite, store, workspace, chat, AgentService }
}

const event = { id: 'manual-1', kind: 'compaction', phase: 'succeeded', trigger: 'manual', at: 2 }

test('manual compact saves an event-only assistant message and returns it for the open Chat', async (t) => {
  const f = await fixture(t)
  const live: unknown[] = []
  const runner = {
    compact: async (options: { operationId: string; onPiEvent?: (event: unknown) => void }) => {
      options.onPiEvent?.({
        chatId: f.chat.id,
        runId: options.operationId,
        id: event.id,
        event: { ...event, phase: 'started' },
      })
      options.onPiEvent?.({ chatId: f.chat.id, runId: options.operationId, id: event.id, event })
      return { event }
    },
  }
  const agent = new f.AgentService(
    (_runId: string, item: unknown) => live.push(item),
    {
      resolveActiveModel: async () => ({
        providerId: 'test',
        providerName: 'Test',
        modelId: 'test',
        apiKey: 'test',
        baseUrl: 'http://127.0.0.1:1',
        protocol: 'openai-completions',
        reasoningLevels: [],
      }),
    },
    { runner, workspace: f.workspace },
  )
  const messages = await agent.compact(f.chat.id)
  assert.deepEqual(messages.at(-1).parts, [{ type: 'data-pi-event', data: event }])
  assert.equal(messages.at(-1).role, 'assistant')
  assert.deepEqual((await f.store.getChat(f.chat.id)).messages, messages)
  assert.deepEqual(
    live
      .filter((item: { type?: string }) => item.type === 'pi-event')
      .map((item: { event: { event: { phase: string } } }) => item.event.event.phase),
    ['started', 'succeeded'],
  )

  const { WorkspaceChats } = await f.vite.ssrLoadModule('/src/renderer/src/lib/WorkspaceChats.ts')
  const registry = new WorkspaceChats({
    getChat: (id: string) => f.workspace.getChat(id),
    setPreferences: async () => {},
  })
  const opened = await registry.get(f.chat.id)
  await registry.applyMessages(f.chat.id, messages)
  assert.equal(await registry.get(f.chat.id), opened)
  assert.deepEqual(opened.messages, messages)
  opened.messages = []
  await registry.refreshMessages(f.chat.id)
  assert.deepEqual(
    opened.messages
      .flatMap((message: { parts: unknown[] }) => message.parts)
      .filter((part: { type: string }) => part.type === 'data-pi-event'),
    [{ type: 'data-pi-event', data: event }],
  )
})

test('manual compact is mutually exclusive and checkpoint failure leaves history unchanged', async (t) => {
  const f = await fixture(t)
  let release!: () => void
  const pending = new Promise<void>((resolve) => {
    release = resolve
  })
  let entered!: () => void
  const running = new Promise<void>((resolve) => {
    entered = resolve
  })
  const agent = new f.AgentService(
    () => {},
    {
      resolveActiveModel: async () => ({
        providerId: 'test',
        providerName: 'Test',
        modelId: 'test',
        apiKey: 'test',
        baseUrl: 'http://127.0.0.1:1',
        protocol: 'openai-completions',
        reasoningLevels: [],
      }),
    },
    {
      runner: {
        compact: async () => {
          entered()
          await pending
          throw new Error('checkpoint failed')
        },
      },
      workspace: f.workspace,
    },
  )
  const first = agent.compact(f.chat.id)
  await running
  await assert.rejects(agent.compact(f.chat.id), /压缩|运行中/)
  release()
  await assert.rejects(first, /checkpoint failed/)
  assert.equal((await f.store.getChat(f.chat.id)).messages.length, 1)
})

test('simultaneous manual compactions reserve the chat before settings resolve', async (t) => {
  const f = await fixture(t)
  let resolveModel!: (value: unknown) => void
  const model = new Promise((resolve) => {
    resolveModel = resolve
  })
  let calls = 0
  const agent = new f.AgentService(
    () => {},
    { resolveActiveModel: () => model },
    {
      runner: {
        compact: async () => {
          calls++
          return { event }
        },
      },
      workspace: f.workspace,
    },
  )
  const first = agent.compact(f.chat.id)
  const second = assert.rejects(agent.compact(f.chat.id), /压缩|运行中/)
  const resolved = {
    providerId: 'test',
    providerName: 'Test',
    modelId: 'test',
    apiKey: 'test',
    baseUrl: 'http://127.0.0.1:1',
    protocol: 'openai-completions',
    reasoningLevels: [],
  }
  resolveModel(resolved)
  await first
  await second
  assert.equal(calls, 1)
})
