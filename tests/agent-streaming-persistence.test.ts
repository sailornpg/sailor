import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import test from 'node:test'
import { MockLanguageModelV4 } from 'ai/test'
import {
  ToolLoopAgent,
  convertToModelMessages,
  simulateReadableStream,
  toUIMessageStream,
  type LanguageModel,
  type UIMessage,
  type UIMessageChunk,
} from 'ai'
import { createServer } from 'vite'
import type { AgentRunner } from '../src/main/agent/pi/PiRunner.ts'
import type { AgentRunEvent, ResolvedModel } from '../src/shared/contracts.ts'

// The run persists through this narrow surface; the test records how often the
// streamed message reaches it instead of reading the real workspace file.
interface WorkspaceStub {
  validateRequest(input: RunRequest): Promise<RunRequest>
  beginRun(request: RunRequest): Promise<void>
  resolveToolContext(chatId: string, signal: AbortSignal, runId: string): Promise<unknown>
  getChat(chatId: string): Promise<{ id: string; messages: UIMessage[]; status: string }>
  updateRun(chatId: string, runId: string, messages: UIMessage[]): Promise<void>
  finishRun(chatId: string, runId: string, status: string): Promise<void>
  updatePlan(): Promise<void>
}

interface RunRequest {
  runId: string
  chatId: string
  reasoning: 'provider-default'
  messages: UIMessage[]
}

interface AgentServiceInstance {
  start(request: RunRequest): Promise<void>
}

type AgentServiceConstructor = new (
  emit: (runId: string, event: AgentRunEvent) => void,
  settings: { resolveActiveModel(): Promise<ResolvedModel | null> },
  dependencies: {
    runner: AgentRunner
    workspace: WorkspaceStub
    runPersistIntervalMs?: number
  },
) => AgentServiceInstance

async function loadAgentService(): Promise<AgentServiceConstructor> {
  const vite = await createServer({
    logLevel: 'silent',
    resolve: { alias: { '@shared': resolve(process.cwd(), 'src/shared') } },
    server: { middlewareMode: true },
  })
  try {
    const module = await vite.ssrLoadModule('/src/main/agent/AgentService.ts')
    return module.AgentService as AgentServiceConstructor
  } finally {
    await vite.close()
  }
}

const resolvedModel: ResolvedModel = {
  providerId: 'test',
  providerName: 'Test',
  baseUrl: 'http://127.0.0.1:1',
  protocol: 'openai-completions',
  apiKey: 'test-key',
  modelId: 'test-model',
  reasoningLevels: [],
  maxOutputTokens: 256,
}

const createSettings = () => ({ resolveActiveModel: async () => resolvedModel })

const finishChunk = {
  type: 'finish' as const,
  finishReason: { unified: 'stop' as const, raw: undefined },
  logprobs: undefined,
  usage: {
    inputTokens: { total: 1, noCache: 1, cacheRead: undefined, cacheWrite: undefined },
    outputTokens: { total: 12, text: 12, reasoning: undefined },
  },
}

/** Streams one text delta per segment so a run yields as many chunks as asked. */
function createModel(segments: number, chunkDelayInMs: number) {
  const deltas = Array.from({ length: segments }, (_, index) => `第${index}段。`)
  const chunks: UIMessageChunk[] = [
    { type: 'text-start', id: 'text-1' },
    ...deltas.map((delta): UIMessageChunk => ({ type: 'text-delta', id: 'text-1', delta })),
    { type: 'text-end', id: 'text-1' },
    finishChunk,
  ]
  const model: LanguageModel = new MockLanguageModelV4({
    doStream: async () => ({ stream: simulateReadableStream({ chunks, chunkDelayInMs }) }),
  })
  return { model, text: deltas.join('') }
}

const createRunner = (create: () => LanguageModel): AgentRunner => ({
  async *run({ request, signal }) {
    const agent = new ToolLoopAgent({ model: create(), tools: {} })
    const prompt = await convertToModelMessages(request.messages, {
      ignoreIncompleteToolCalls: true,
    })
    const result = await agent.stream({ prompt, abortSignal: signal })
    yield* toUIMessageStream({
      stream: result.stream,
      originalMessages: request.messages,
      generateMessageId: randomUUID,
      sendReasoning: true,
    })
  },
})

const assistantText = (messages: readonly UIMessage[]) =>
  messages
    .filter((message) => message.role === 'assistant')
    .flatMap((message) => message.parts)
    .filter((part) => part.type === 'text')
    .map((part) => part.text)
    .join('')

async function runFixture(
  t: test.TestContext,
  input: { segments: number; chunkDelayInMs?: number; persistIntervalMs: number },
) {
  const AgentService = await loadAgentService()
  const root = await mkdtemp(join(tmpdir(), 'sailor-agent-persist-'))
  t.after(() => rm(root, { recursive: true, force: true }))

  const writes: { chatId: string; messages: UIMessage[] }[] = []
  const finishes: string[] = []
  const events: AgentRunEvent[] = []
  const workspace: WorkspaceStub = {
    validateRequest: async (request) => request,
    beginRun: async () => {},
    resolveToolContext: async (chatId, _signal, runId) => ({
      chatId,
      runId,
      rootPath: root,
      permissionMode: 'allow-all',
    }),
    getChat: async (chatId) => ({ id: chatId, messages: [], status: 'running' }),
    updateRun: async (chatId, _runId, messages) => {
      writes.push({ chatId, messages: structuredClone(messages) })
    },
    finishRun: async (_chatId, _runId, status) => {
      finishes.push(status)
    },
    updatePlan: async () => {},
  }
  const { model, text } = createModel(input.segments, input.chunkDelayInMs ?? 0)
  const service = new AgentService((runId, event) => events.push(event), createSettings(), {
    runner: createRunner(() => model),
    workspace,
    runPersistIntervalMs: input.persistIntervalMs,
  })

  await service.start({
    runId: `run-${input.segments}`,
    chatId: 'chat-1',
    reasoning: 'provider-default',
    messages: [{ id: 'user-1', role: 'user', parts: [{ type: 'text', text: '你好' }] }],
  })

  const errors = events
    .filter((event): event is Extract<AgentRunEvent, { type: 'chunk' }> => event.type === 'chunk')
    .map(({ chunk }) => chunk)
    .filter((chunk) => chunk.type === 'error')
    .map((chunk) => chunk.errorText)

  return { writes, finishes, events, errors, text }
}

const textDeltaCount = (events: readonly AgentRunEvent[]) =>
  events
    .filter((event): event is Extract<AgentRunEvent, { type: 'chunk' }> => event.type === 'chunk')
    .filter(({ chunk }) => chunk.type === 'text-delta').length

test('合并流式消息落盘：写入次数不随 chunk 数增长', async (t) => {
  const short = await runFixture(t, { segments: 40, persistIntervalMs: 60_000 })
  const long = await runFixture(t, { segments: 120, persistIntervalMs: 60_000 })

  assert.deepEqual(short.errors, [])
  assert.deepEqual(long.errors, [])
  assert.ok(
    short.writes.length <= 2,
    `expected a coalesced write count, got ${short.writes.length} writes for 40 chunks`,
  )
  assert.ok(
    long.writes.length <= short.writes.length + 1,
    `expected write count to stay bounded, got ${short.writes.length} for 40 chunks and ${long.writes.length} for 120 chunks`,
  )
  assert.equal(assistantText(long.writes.at(-1)?.messages ?? []), long.text)
  assert.equal(textDeltaCount(long.events), 120, 'every streamed delta still reaches the UI')
})

test('流式期间按间隔合并写入，且每次都保留最新完整快照', async (t) => {
  const { writes, finishes, text } = await runFixture(t, {
    segments: 60,
    chunkDelayInMs: 4,
    persistIntervalMs: 40,
  })

  assert.ok(
    writes.length >= 2 && writes.length <= 20,
    `expected interval-flushed writes below the chunk count, got ${writes.length}`,
  )
  assert.deepEqual(finishes, ['completed'])

  const snapshots = writes.map((write) => assistantText(write.messages))
  for (const snapshot of snapshots) {
    assert.ok(text.startsWith(snapshot), `intermediate snapshot is not a prefix of the answer`)
  }
  assert.equal(snapshots.at(-1), text)
})
