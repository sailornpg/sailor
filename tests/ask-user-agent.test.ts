import assert from 'node:assert/strict'
import { resolve } from 'node:path'
import test from 'node:test'
import { createServer, type ViteDevServer } from 'vite'

let vite: ViteDevServer
let lifecycle: typeof import('../src/main/agent/pi/AskUserInteraction.ts')
let askUserTool: typeof import('../src/main/agent/pi/askUserTool.ts')

test.before(async () => {
  vite = await createServer({
    logLevel: 'silent',
    resolve: { alias: { '@shared': resolve(process.cwd(), 'src/shared') } },
    server: { middlewareMode: true },
  })
  lifecycle = (await vite.ssrLoadModule(
    '/src/main/agent/pi/AskUserInteraction.ts',
  )) as typeof lifecycle
  askUserTool = (await vite.ssrLoadModule(
    '/src/main/agent/pi/askUserTool.ts',
  )) as typeof askUserTool
})

test.after(async () => {
  await vite?.close()
})

test('resolves the same pending interaction once with a validated answer', async () => {
  const interactions = new lifecycle.AskUserInteractionStore({ now: () => 1000, ttlMs: 5000 })
  const pending = interactions.create({
    chatId: 'chat-1',
    runId: 'run-1',
    toolCallId: 'call-1',
    request: { question: '选择环境', options: [{ id: 'staging', label: '测试' }] },
  })

  const answer = pending.promise
  interactions.respond({
    chatId: 'chat-1',
    runId: 'run-1',
    toolCallId: 'call-1',
    interactionId: pending.interactionId,
    response: { outcome: 'answered', optionId: 'staging' },
  })
  assert.deepEqual(await answer, { outcome: 'answered', optionId: 'staging' })
  assert.throws(
    () =>
      interactions.respond({
        chatId: 'chat-1',
        runId: 'run-1',
        toolCallId: 'call-1',
        interactionId: pending.interactionId,
        response: { outcome: 'answered', optionId: 'staging' },
      }),
    /已处理|失效/,
  )
})

test('rejects forged context, expired interactions, cancellation, and restart replay', () => {
  let now = 1000
  const interactions = new lifecycle.AskUserInteractionStore({ now: () => now, ttlMs: 50 })
  const pending = interactions.create({
    chatId: 'chat-1',
    runId: 'run-1',
    toolCallId: 'call-1',
    request: { question: '继续吗？', allowSkip: true },
  })
  assert.throws(
    () =>
      interactions.respond({
        chatId: 'chat-2',
        runId: 'run-1',
        toolCallId: 'call-1',
        interactionId: pending.interactionId,
        response: { outcome: 'skipped' },
      }),
    /不存在|失效/,
  )
  now = 1051
  assert.throws(
    () =>
      interactions.respond({
        chatId: 'chat-1',
        runId: 'run-1',
        toolCallId: 'call-1',
        interactionId: pending.interactionId,
        response: { outcome: 'skipped' },
      }),
    /过期|失效/,
  )

  const cancelled = interactions.create({
    chatId: 'chat-1',
    runId: 'run-2',
    toolCallId: 'call-2',
    request: { question: '确认', allowSkip: true },
  })
  interactions.cancelRun('run-2')
  assert.rejects(cancelled.promise, /取消|失效/)

  const afterRestart = new lifecycle.AskUserInteractionStore({ now: () => 1, ttlMs: 50 })
  assert.throws(
    () =>
      afterRestart.respond({
        chatId: 'chat-1',
        runId: 'run-1',
        toolCallId: 'call-1',
        interactionId: pending.interactionId,
        response: { outcome: 'skipped' },
      }),
    /不存在|失效/,
  )
})

test('blocks the Pi host tool until the bound interaction receives an answer', async () => {
  const interactions = new lifecycle.AskUserInteractionStore()
  const tools = askUserTool.createAskUserTool({
    store: interactions,
    chatId: 'chat-tool',
    runId: 'run-tool',
  })
  const tool = tools.ask_user as any
  let settled = false
  const result = tool
    .execute(
      { question: '确认计划', options: [{ id: 'yes', label: '确认' }] },
      { toolCallId: 'call-tool' },
    )
    .then((value: unknown) => {
      settled = true
      return value
    })
  await new Promise((resolve) => setImmediate(resolve))
  assert.equal(settled, false)
  interactions.respond({
    chatId: 'chat-tool',
    runId: 'run-tool',
    toolCallId: 'call-tool',
    interactionId: 'call-tool',
    response: { outcome: 'answered', optionId: 'yes' },
  })
  assert.deepEqual(await result, { outcome: 'answered', optionId: 'yes' })
})
