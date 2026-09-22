import assert from 'node:assert/strict'
import { resolve } from 'node:path'
import test from 'node:test'
import type { UIMessage } from 'ai'
import { createServer } from 'vite'

type MessagePart = UIMessage['parts'][number]

async function loadProjection() {
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
    const module = await vite.ssrLoadModule('/src/renderer/src/lib/messageProjection.ts')
    return Reflect.get(module, 'projectReasoning') as
      | ((parts: MessagePart[], isMessageStreaming: boolean) => {
          text: string
          isStreaming: boolean
        } | null)
      | undefined
  } finally {
    await vite.close()
  }
}

test('consolidates multiple reasoning parts into one presentation block', async () => {
  const projectReasoning = await loadProjection()

  assert.equal(typeof projectReasoning, 'function')
  assert.deepEqual(projectReasoning?.([
    { type: 'reasoning', text: '先分析需求' },
    { type: 'reasoning', text: '再选择方案' },
  ], true), {
    text: '先分析需求\n\n再选择方案',
    isStreaming: true,
  })
})

test('stops the reasoning indicator when answer text has started', async () => {
  const projectReasoning = await loadProjection()

  assert.deepEqual(projectReasoning?.([
    { type: 'reasoning', text: '分析完成' },
    { type: 'text', text: '最终回答' },
  ], true), {
    text: '分析完成',
    isStreaming: false,
  })
  assert.equal(projectReasoning?.([{ type: 'text', text: '没有推理摘要' }], true), null)
})
