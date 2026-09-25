import assert from 'node:assert/strict'
import test from 'node:test'
import { resolve } from 'node:path'
import { createServer } from 'vite'

async function loadModules() {
  const vite = await createServer({
    logLevel: 'silent',
    resolve: {
      alias: {
        '@': resolve(process.cwd(), 'src/renderer/src'),
        '@shared': resolve(process.cwd(), 'src/shared'),
      },
    },
    server: { middlewareMode: true },
  })
  try {
    return {
      contracts: await vite.ssrLoadModule('/src/shared/contracts.ts'),
      transport: await vite.ssrLoadModule('/src/renderer/src/lib/IpcChatTransport.ts'),
    }
  } finally {
    await vite.close()
  }
}

type ReasoningEffort = 'provider-default' | 'none' | 'minimal' | 'low' | 'medium' | 'high' | 'xhigh'

test('exposes only supported reasoning efforts in stable UI order', () => {
  return loadModules().then(({ contracts }) => {
    const getAvailableReasoningEfforts = Reflect.get(contracts, 'getAvailableReasoningEfforts') as
      ((levels: string[]) => ReasoningEffort[]) | undefined

    assert.equal(typeof getAvailableReasoningEfforts, 'function')
    assert.deepEqual(getAvailableReasoningEfforts?.(['high', 'unsupported', 'low', 'high']), [
      'provider-default',
      'none',
      'low',
      'high',
    ])
    assert.deepEqual(getAvailableReasoningEfforts?.([]), ['provider-default'])
  })
})

test('creates an agent request carrying the selected reasoning effort', async () => {
  const { transport } = await loadModules()
  const createAgentRunRequest = Reflect.get(transport, 'createAgentRunRequest') as
    | ((input: {
        runId: string
        chatId: string
        messages: []
        reasoning: ReasoningEffort
      }) => unknown)
    | undefined

  assert.equal(typeof createAgentRunRequest, 'function')
  assert.deepEqual(
    createAgentRunRequest?.({
      runId: 'run-1',
      chatId: 'chat-1',
      messages: [],
      reasoning: 'high',
    }),
    {
      runId: 'run-1',
      chatId: 'chat-1',
      messages: [],
      reasoning: 'high',
    },
  )
})
