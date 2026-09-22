import { createModelRunner } from './helpers/model-runner.ts'
import assert from 'node:assert/strict'
import { resolve } from 'node:path'
import test from 'node:test'
import { MockLanguageModelV4 } from 'ai/test'
import { simulateReadableStream, type LanguageModel, type UIMessageChunk } from 'ai'
import { createServer } from 'vite'
import type { AgentRunEvent, ResolvedModel } from '../src/shared/contracts.ts'

interface AgentServiceInstance {
  start(request: ReturnType<typeof request>): Promise<void>
  abort(runId: string): void
}

type AgentServiceConstructor = new (
  emit: (runId: string, event: AgentRunEvent) => void,
  settings: { resolveActiveModel(): Promise<ResolvedModel | null> },
  dependencies?: { runner: ReturnType<typeof createModelRunner> },
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

function createSettings() {
  return {
    resolveActiveModel: async () => resolvedModel,
  }
}

function createModel(chunks: Parameters<typeof simulateReadableStream>[0]['chunks']): LanguageModel {
  return new MockLanguageModelV4({
    doStream: async () => ({
      stream: simulateReadableStream({ chunks }),
    }),
  })
}

function request(runId: string) {
  return {
    runId,
    chatId: 'chat-1',
    reasoning: 'provider-default' as const,
    messages: [{ id: 'user-1', role: 'user' as const, parts: [{ type: 'text' as const, text: '你好' }] }],
  }
}

const finishChunk = {
  type: 'finish' as const,
  finishReason: { unified: 'stop' as const, raw: undefined },
  logprobs: undefined,
  usage: {
    inputTokens: { total: 1, noCache: 1, cacheRead: undefined, cacheWrite: undefined },
    outputTokens: { total: 12, text: 12, reasoning: undefined },
  },
}

test('splits a coarse Chinese provider delta into incremental UI chunks before end', async () => {
  const AgentService = await loadAgentService()
  const events: AgentRunEvent[] = []
  const model = createModel([
    { type: 'text-start', id: 'text-1' },
    { type: 'text-delta', id: 'text-1', delta: '你好世界，这是一个流式回答。' },
    { type: 'text-end', id: 'text-1' },
    finishChunk,
  ])
  const service = new AgentService(
    (_runId, event) => events.push(event),
    createSettings(),
    { runner: createModelRunner(() => model) },
  )

  await service.start(request('run-smooth'))

  const chunks = events
    .filter((event): event is Extract<AgentRunEvent, { type: 'chunk' }> => event.type === 'chunk')
    .map(({ chunk }) => chunk)
  const textDeltas = chunks.filter(
    (chunk): chunk is Extract<UIMessageChunk, { type: 'text-delta' }> => chunk.type === 'text-delta',
  )

  assert.ok(textDeltas.length > 1, `expected multiple text deltas, got ${textDeltas.length}`)
  assert.equal(textDeltas.map(({ delta }) => delta).join(''), '你好世界，这是一个流式回答。')
  assert.equal(events.at(-1)?.type, 'end')
})

test('aborting an active stream stops later chunks and emits one end event', async () => {
  const AgentService = await loadAgentService()
  const events: AgentRunEvent[] = []
  const model = new MockLanguageModelV4({
    doStream: async () => ({
      stream: simulateReadableStream({
        chunkDelayInMs: 30,
        chunks: [
          { type: 'text-start', id: 'text-1' },
          { type: 'text-delta', id: 'text-1', delta: '第一段' },
          { type: 'text-delta', id: 'text-1', delta: '第二段' },
          { type: 'text-end', id: 'text-1' },
          finishChunk,
        ],
      }),
    }),
  })
  let service: AgentServiceInstance
  service = new AgentService(
    (runId, event) => {
      events.push(event)
      if (event.type === 'chunk' && event.chunk.type === 'text-delta') service.abort(runId)
    },
    createSettings(),
    { runner: createModelRunner(() => model) },
  )

  await service.start(request('run-abort'))

  const text = events
    .filter((event): event is Extract<AgentRunEvent, { type: 'chunk' }> => event.type === 'chunk')
    .map(({ chunk }) => chunk)
    .filter((chunk): chunk is Extract<UIMessageChunk, { type: 'text-delta' }> => chunk.type === 'text-delta')
    .map(({ delta }) => delta)
    .join('')

  assert.equal(text.includes('第一段'), true)
  assert.equal(text.includes('第二段'), false)
  assert.equal(events.filter(({ type }) => type === 'end').length, 1)
})
