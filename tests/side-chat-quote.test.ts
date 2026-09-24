import assert from 'node:assert/strict'
import test from 'node:test'
import { resolve } from 'node:path'
import { createServer } from 'vite'

async function modules(t: test.TestContext) {
  const vite = await createServer({
    logLevel: 'silent',
    server: { middlewareMode: true },
    resolve: { alias: { '@': resolve('src/renderer/src'), '@shared': resolve('src/shared') } },
  })
  t.after(() => vite.close())
  return vite
}

test('主会话选区交给指定侧聊草稿，消费后不重复且有大小边界', async (t) => {
  const vite = await modules(t)
  const { SideChatQuoteDrafts } = await vite.ssrLoadModule(
    '/src/renderer/src/lib/sideChatQuoteDrafts.ts',
  )
  const drafts = new SideChatQuoteDrafts()
  const quote = { text: '选中的主会话回答', messageId: 'parent-answer' }
  drafts.set('side-1', quote)
  assert.equal(drafts.take('side-2'), undefined)
  assert.deepEqual(drafts.take('side-1'), quote)
  assert.equal(drafts.take('side-1'), undefined)
  assert.throws(
    () => drafts.set('side-1', { ...quote, text: '字'.repeat(5000) }),
    /引用|大小|8 KiB/,
  )
})

test('消息引用只投影给模型，保留原始侧聊消息供历史展示', async (t) => {
  const vite = await modules(t)
  const { projectMessageQuotes } = await vite.ssrLoadModule('/src/main/agent/pi/messageQuote.ts')
  const messages = [
    {
      id: 'side-user',
      role: 'user',
      metadata: { custom: { quote: { text: '冻结的选中文字', messageId: 'parent-answer' } } },
      parts: [{ type: 'text', text: '这段话是什么意思？' }],
    },
    { id: 'side-answer', role: 'assistant', parts: [{ type: 'text', text: '解释' }] },
  ]
  const original = structuredClone(messages)
  const projected = projectMessageQuotes(messages)
  assert.match(projected[0].parts[0].text, /冻结的选中文字/)
  assert.equal(projected[0].parts.at(-1).text, '这段话是什么意思？')
  assert.deepEqual(messages, original)
  assert.deepEqual(projected[1], messages[1])
  assert.throws(
    () =>
      projectMessageQuotes([
        { ...messages[0], metadata: { custom: { quote: { text: '字'.repeat(5000) } } } },
      ]),
    /引用|8 KiB/,
  )
})
