import assert from 'node:assert/strict'
import test from 'node:test'
import { createServer } from 'vite'

test('从 assistant-ui 转换后的 custom 元数据读取 turnId', async (t) => {
  const vite = await createServer({ logLevel: 'silent', server: { middlewareMode: true } })
  t.after(() => vite.close())
  const module = await vite.ssrLoadModule(
    '/src/renderer/src/components/chat/review/turnFileReviewMetadata.ts',
  )
  assert.equal(
    module.getTurnIdFromMessageMetadata({ custom: { turnId: 'turn-custom' } }),
    'turn-custom',
  )
  assert.equal(module.getTurnIdFromMessageMetadata({ turnId: 'turn-top-level' }), 'turn-top-level')
  assert.equal(module.getTurnIdFromMessageMetadata({ custom: { turnId: '' } }), null)
  assert.equal(module.getTurnIdFromMessageMetadata(null), null)
})
