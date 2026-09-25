import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import { createServer, type ViteDevServer } from 'vite'

let vite: ViteDevServer
let contract: typeof import('../src/shared/contracts.ts')

test.before(async () => {
  vite = await createServer({ logLevel: 'silent', server: { middlewareMode: true } })
  contract = (await vite.ssrLoadModule('/src/shared/contracts.ts')) as typeof contract
})

test.after(async () => {
  await vite?.close()
})

test('exposes a strict shared response contract for the pending ask_user interaction', () => {
  const response: contract.AskUserInteractionResponse = {
    chatId: 'chat-1',
    runId: 'run-1',
    toolCallId: 'call-1',
    interactionId: 'call-1',
    response: { outcome: 'answered', optionId: 'staging', text: '先验证' },
  }
  assert.deepEqual(contract.askUserInteractionResponseSchema.parse(response), response)
  assert.throws(() =>
    contract.askUserInteractionResponseSchema.parse({
      ...response,
      unexpected: true,
    }),
  )
})

test('wires ask_user response through shared IPC, preload, and AgentService', async () => {
  const [contracts, preload, ipc, agent, pi] = await Promise.all([
    readFile('src/shared/contracts.ts', 'utf8'),
    readFile('src/preload/index.ts', 'utf8'),
    readFile('src/main/ipc/registerIpc.ts', 'utf8'),
    readFile('src/main/agent/AgentService.ts', 'utf8'),
    readFile('src/main/agent/pi/PiRunner.ts', 'utf8'),
  ])
  assert.match(contracts, /agentRespondToAskUser/)
  assert.match(contracts, /respondToAskUser/)
  assert.match(preload, /respondToAskUser/)
  assert.match(ipc, /agentRespondToAskUser/)
  assert.match(agent, /respondToAskUser/)
  assert.match(pi, /respondToAskUser/)
})
