import { createModelRunner } from './helpers/model-runner.ts'
import assert from 'node:assert/strict'
import { resolve } from 'node:path'
import test from 'node:test'
import { MockLanguageModelV4 } from 'ai/test'
import { simulateReadableStream, type LanguageModel, type UIMessageChunk } from 'ai'
import { createServer } from 'vite'
import type { AgentRunEvent, ResolvedModel } from '../src/shared/contracts.ts'

type AgentServiceConstructor = new (
  emit: (runId: string, event: AgentRunEvent) => void,
  settings: { resolveActiveModel(): Promise<ResolvedModel | null> },
  dependencies: { runner: ReturnType<typeof createModelRunner> },
) => { start(request: ReturnType<typeof createRequest>): Promise<void> }

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

const usage = {
  inputTokens: { total: 1, noCache: 1, cacheRead: undefined, cacheWrite: undefined },
  outputTokens: { total: 1, text: 1, reasoning: undefined },
}

function finish(reason: 'stop' | 'tool-calls') {
  return {
    type: 'finish' as const,
    finishReason: { unified: reason, raw: undefined },
    logprobs: undefined,
    usage,
  }
}

function createRequest(runId: string) {
  return {
    runId,
    chatId: 'chat-1',
    reasoning: 'provider-default' as const,
    messages: [
      {
        id: 'user-1',
        role: 'user' as const,
        parts: [{ type: 'text' as const, text: '先制定计划' }],
      },
    ],
  }
}

function createService(AgentService: AgentServiceConstructor, model: LanguageModel) {
  const events: AgentRunEvent[] = []
  const service = new AgentService(
    (_runId, event) => events.push(event),
    { resolveActiveModel: async () => resolvedModel },
    { runner: createModelRunner(() => model) },
  )
  return { events, service }
}

function getChunks(events: AgentRunEvent[]): UIMessageChunk[] {
  return events
    .filter((event): event is Extract<AgentRunEvent, { type: 'chunk' }> => event.type === 'chunk')
    .map(({ chunk }) => chunk)
}

test('does not advertise the retired tool and still streams an answer', async () => {
  const AgentService = await loadAgentService()
  const model = new MockLanguageModelV4({
    doStream: async () => ({ stream: simulateReadableStream({ chunks: [
      { type: 'text-start', id: 'text-1' },
      { type: 'text-delta', id: 'text-1', delta: '可以直接讨论任务。' },
      { type: 'text-end', id: 'text-1' },
      finish('stop'),
    ] }) }),
  })
  const { events, service } = createService(AgentService, model)
  await service.start(createRequest('run-no-tools'))
  assert.equal(model.doStreamCalls.length, 1)
  assert.equal(model.doStreamCalls[0].tools?.length ?? 0, 0)
  assert.doesNotMatch(JSON.stringify(model.doStreamCalls[0].prompt), /updatePlan/)
  assert.ok(getChunks(events).some(chunk => chunk.type === 'text-delta'))
  assert.ok(!getChunks(events).some(chunk => chunk.type === 'error'))
})
