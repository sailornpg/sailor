import assert from 'node:assert/strict'
import { resolve } from 'node:path'
import test from 'node:test'
import { createServer, type ViteDevServer } from 'vite'

let vite: ViteDevServer
let contract: typeof import('../src/shared/askUser.ts')

test.before(async () => {
  vite = await createServer({
    logLevel: 'silent',
    resolve: { alias: { '@shared': resolve(process.cwd(), 'src/shared') } },
    server: { middlewareMode: true },
  })
  contract = (await vite.ssrLoadModule('/src/shared/askUser.ts')) as typeof contract
})

test.after(async () => {
  await vite?.close()
})

test('accepts a structured question with unique options and bounded freeform input', () => {
  const request = contract.askUserRequestSchema.parse({
    question: '请选择部署目标',
    options: [
      { id: 'staging', label: '测试环境', description: '先验证变更' },
      { id: 'production', label: '生产环境' },
    ],
    allowFreeform: true,
    allowSkip: true,
  })

  assert.equal(request.options?.length, 2)
  assert.equal(request.allowFreeform, true)
  assert.deepEqual(
    contract.askUserResponseSchema.parse({
      outcome: 'answered',
      optionId: 'staging',
      text: '先部署并观察 10 分钟',
    }),
    {
      outcome: 'answered',
      optionId: 'staging',
      text: '先部署并观察 10 分钟',
    },
  )
})

test('rejects missing questions, duplicate options, invalid option answers, and oversized text', () => {
  assert.throws(() => contract.askUserRequestSchema.parse({ question: '   ' }))
  assert.throws(
    () =>
      contract.askUserRequestSchema.parse({
        question: '选择',
        options: [
          { id: 'same', label: 'A' },
          { id: 'same', label: 'B' },
        ],
      }),
    /unique|重复|唯一/i,
  )
  assert.throws(() =>
    contract.askUserResponseSchema.parse({ outcome: 'answered', optionId: 'bad id' }),
  )
  assert.throws(() =>
    contract.askUserResponseSchema.parse({
      outcome: 'answered',
      text: 'x'.repeat(contract.ASK_USER_LIMITS.textMaxLength + 1),
    }),
  )
  const request = contract.askUserRequestSchema.parse({
    question: '选择',
    options: [{ id: 'one', label: '一个' }],
  })
  assert.throws(
    () => contract.validateAskUserResponse(request, { outcome: 'answered', optionId: 'two' }),
    /选项|option/i,
  )
  assert.throws(
    () => contract.validateAskUserResponse(request, { outcome: 'answered', text: '自定义' }),
    /自由文本|freeform/i,
  )
})

test('only permits terminal outcomes with their matching payload', () => {
  for (const outcome of ['skipped', 'cancelled', 'expired', 'denied'] as const) {
    assert.deepEqual(contract.askUserResponseSchema.parse({ outcome }), { outcome })
  }
  assert.throws(() => contract.askUserResponseSchema.parse({ outcome: 'answered' }))
  assert.throws(() => contract.askUserResponseSchema.parse({ outcome: 'skipped', text: '理由' }))
})
