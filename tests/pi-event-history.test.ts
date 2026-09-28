import assert from 'node:assert/strict'
import test from 'node:test'
import { createServer } from 'vite'
import { convertToModelMessages, readUIMessageStream, type UIMessage } from 'ai'
import { mkdtemp, mkdir, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const started = {
  chatId: 'chat',
  runId: 'run',
  id: 'event-1',
  event: {
    id: 'event-1',
    kind: 'compaction',
    phase: 'started',
    trigger: 'threshold',
    at: 1,
  },
}
const succeeded = { ...started, event: { ...started.event, phase: 'succeeded', at: 2 } }

test('terminal event waits for checkpoint and persists once as data-pi-event', async (t) => {
  const vite = await createServer({ logLevel: 'silent', server: { middlewareMode: true } })
  t.after(() => vite.close())
  const module = await vite.ssrLoadModule('/src/main/agent/pi/PiEventHistory.ts').catch(() => null)
  assert.ok(module, 'PiEventHistory must exist')
  const live: unknown[] = []
  const history = new module.PiEventHistory((event: unknown) => live.push(event))
  history.accept(started)
  history.accept(succeeded)
  history.accept(succeeded)
  assert.equal(live.length, 1, 'terminal state is withheld until checkpoint saves')
  let release!: () => void
  const checkpoint = new Promise<void>((resolve) => {
    release = resolve
  })
  const pending = history.commitAfter(() => checkpoint)
  await Promise.resolve()
  assert.equal(live.length, 1)
  release()
  const chunks = await pending
  assert.equal(live.length, 2)
  assert.deepEqual(chunks, [{ type: 'data-pi-event', data: succeeded.event }])
  const stream = ReadableStream.from([
    { type: 'start', messageId: 'assistant-1' },
    ...chunks,
    { type: 'finish' },
  ])
  const snapshots: UIMessage[] = []
  for await (const message of readUIMessageStream({ stream })) snapshots.push(message)
  assert.deepEqual(snapshots.at(-1)?.parts, [{ type: 'data-pi-event', data: succeeded.event }])
})

test('checkpoint failure clears live state without committing a success record', async (t) => {
  const vite = await createServer({ logLevel: 'silent', server: { middlewareMode: true } })
  t.after(() => vite.close())
  const { PiEventHistory } = await vite.ssrLoadModule('/src/main/agent/pi/PiEventHistory.ts')
  const live: Array<{ event: { phase: string } }> = []
  const history = new PiEventHistory((event) => live.push(event))
  history.accept(started)
  history.accept(succeeded)
  await assert.rejects(
    history.commitAfter(async () => {
      throw new Error('disk failure')
    }),
    /disk failure/,
  )
  assert.deepEqual(
    live.map(({ event }) => event.phase),
    ['started', 'failed'],
  )
})

test('automatic retry produces one final record across attempt updates', async (t) => {
  const vite = await createServer({ logLevel: 'silent', server: { middlewareMode: true } })
  t.after(() => vite.close())
  const { PiEventHistory } = await vite.ssrLoadModule('/src/main/agent/pi/PiEventHistory.ts')
  const history = new PiEventHistory(() => {})
  const retry = {
    chatId: 'chat',
    runId: 'run',
    id: 'retry-1',
    event: {
      id: 'retry-1',
      kind: 'retry',
      phase: 'started',
      attempt: 1,
      maxAttempts: 3,
      at: 1,
    },
  }
  history.accept(retry)
  history.accept({ ...retry, event: { ...retry.event, attempt: 2, at: 2 } })
  history.accept({ ...retry, event: { ...retry.event, attempt: 2, phase: 'failed', at: 3 } })
  assert.deepEqual(await history.commitAfter(async () => {}), [
    {
      type: 'data-pi-event',
      data: { ...retry.event, attempt: 2, phase: 'failed', at: 3 },
    },
  ])
})

test('restored Pi data stays out of model messages and rejects malformed fields', async (t) => {
  const vite = await createServer({ logLevel: 'silent', server: { middlewareMode: true } })
  t.after(() => vite.close())
  const { validateChatMessages } = await vite.ssrLoadModule(
    '/src/main/workspaces/validateChatMessages.ts',
  )
  const { projectWorkspaceMessages } = await vite.ssrLoadModule(
    '/src/main/agent/pi/workspaceContext.ts',
  )
  const input = [
    {
      id: 'assistant-1',
      role: 'assistant',
      parts: [{ type: 'data-pi-event', data: succeeded.event }],
    },
  ]
  const restored = await validateChatMessages(input)
  assert.deepEqual(restored, input)
  assert.deepEqual(projectWorkspaceMessages(restored), [])
  assert.deepEqual(await convertToModelMessages(projectWorkspaceMessages(restored)), [])
  await assert.rejects(
    validateChatMessages([
      {
        ...input[0],
        parts: [{ type: 'data-pi-event', data: { ...succeeded.event, tokensBefore: -1 } }],
      },
    ]),
  )
})

test('AgentService relays live events and saves one recoverable final part', async (t) => {
  const root = await mkdtemp(join(tmpdir(), 'sailor-pi-events-'))
  t.after(() => rm(root, { recursive: true, force: true }))
  await mkdir(join(root, 'project'))
  const vite = await createServer({ logLevel: 'silent', server: { middlewareMode: true } })
  t.after(() => vite.close())
  const { WorkspaceStore } = await vite.ssrLoadModule('/src/main/workspaces/WorkspaceStore.ts')
  const { WorkspaceService } = await vite.ssrLoadModule('/src/main/workspaces/WorkspaceService.ts')
  const { AgentService } = await vite.ssrLoadModule('/src/main/agent/AgentService.ts')
  const { PiEventHistory } = await vite.ssrLoadModule('/src/main/agent/pi/PiEventHistory.ts')
  const store = new WorkspaceStore(join(root, 'workspaces.json'))
  const workspace = new WorkspaceService(store, async () => join(root, 'project'))
  const project = await workspace.pickProject()
  const chat = await workspace.createChat(project.id)
  const live: unknown[] = []
  let checkpointSaved = false
  const runner = {
    async *run(options: { onPiEvent?: (event: unknown) => void }) {
      const history = new PiEventHistory((event: unknown) => options.onPiEvent?.(event))
      history.accept({ ...started, chatId: chat.id })
      yield { type: 'start', messageId: 'assistant-1' }
      history.accept({ ...succeeded, chatId: chat.id })
      for (const chunk of await history.commitAfter(async () => {
        checkpointSaved = true
      }))
        yield chunk
      yield { type: 'finish' }
    },
  }
  const agent = new AgentService(
    (_runId: string, event: unknown) => live.push(event),
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
    { runner, workspace },
  )
  await agent.start({
    runId: 'run',
    chatId: chat.id,
    thinkingLevel: 'provider-default',
    messages: [{ id: 'user-1', role: 'user', parts: [{ type: 'text', text: 'hello' }] }],
  })
  assert.equal(checkpointSaved, true, JSON.stringify(live))
  assert.deepEqual(
    live
      .filter((item: { type?: string }) => item.type === 'pi-event')
      .map((item: { event: { event: { phase: string } } }) => item.event.event.phase),
    ['started', 'succeeded'],
  )
  const reopened = await store.getChat(chat.id)
  const parts = reopened.messages
    .flatMap((message: UIMessage) => message.parts)
    .filter((part: { type: string }) => part.type === 'data-pi-event')
  assert.deepEqual(parts, [{ type: 'data-pi-event', data: succeeded.event }])
})
