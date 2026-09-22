import assert from 'node:assert/strict'
import test from 'node:test'
import { readContextUsage } from '../src/renderer/src/components/chat/composer/contextUsage.ts'

test('用量按最近调用快照读取，历史缺失和非法统计保持未知', () => {
  const usage = { inputTokens: 24000, outputTokens: 1200, contextWindow: 128000, modelId: 'model' }
  assert.deepEqual(readContextUsage({ contextUsage: usage }), usage)
  for (const metadata of [undefined, {}, { contextUsage: null }, { contextUsage: { ...usage, inputTokens: -1 } }, { contextUsage: { ...usage, contextWindow: 0 } }, { contextUsage: { ...usage, outputTokens: NaN } }]) {
    assert.equal(readContextUsage(metadata), undefined)
  }
})

test('最新回复缺少用量时保留本会话最近有效统计，切换空会话不串数据', async () => {
  const { latestContextUsage } = await import('../src/renderer/src/components/chat/composer/contextUsage.ts')
  const usage = { inputTokens: 8000, outputTokens: 200, contextWindow: 128000, modelId: 'model' }
  assert.deepEqual(latestContextUsage([
    { role: 'assistant', metadata: { contextUsage: usage } },
    { role: 'user' }, { role: 'assistant' },
  ]), usage)
  assert.equal(latestContextUsage([]), undefined)
  assert.equal(latestContextUsage([{ role: 'user', metadata: { contextUsage: usage } }]), undefined)
})
