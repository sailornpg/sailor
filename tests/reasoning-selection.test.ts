import assert from 'node:assert/strict'
import test from 'node:test'
import * as contracts from '../src/shared/contracts.ts'
import * as transport from '../src/renderer/src/lib/IpcChatTransport.ts'

type ReasoningEffort =
  | 'provider-default'
  | 'none'
  | 'minimal'
  | 'low'
  | 'medium'
  | 'high'
  | 'xhigh'

test('exposes only supported reasoning efforts in stable UI order', () => {
  const getAvailableReasoningEfforts = Reflect.get(
    contracts,
    'getAvailableReasoningEfforts',
  ) as ((levels: string[]) => ReasoningEffort[]) | undefined

  assert.equal(typeof getAvailableReasoningEfforts, 'function')
  assert.deepEqual(
    getAvailableReasoningEfforts?.(['high', 'unsupported', 'low', 'high']),
    ['provider-default', 'none', 'low', 'high'],
  )
  assert.deepEqual(getAvailableReasoningEfforts?.([]), ['provider-default'])
})

test('creates an agent request carrying the selected reasoning effort', () => {
  const createAgentRunRequest = Reflect.get(
    transport,
    'createAgentRunRequest',
  ) as ((input: {
    runId: string
    chatId: string
    messages: []
    reasoning: ReasoningEffort
  }) => unknown) | undefined

  assert.equal(typeof createAgentRunRequest, 'function')
  assert.deepEqual(createAgentRunRequest?.({
    runId: 'run-1',
    chatId: 'chat-1',
    messages: [],
    reasoning: 'high',
  }), {
    runId: 'run-1',
    chatId: 'chat-1',
    messages: [],
    reasoning: 'high',
  })
})
