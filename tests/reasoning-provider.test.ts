import assert from 'node:assert/strict'
import test from 'node:test'
import { createServer } from 'vite'

test('Pi 映射固定 thinking level，兼容 none 关闭推理', async (t) => {
  const vite = await createServer({ logLevel: 'silent', server: { middlewareMode: true } })
  t.after(() => vite.close())
  const { createPiConfiguration } = await vite.ssrLoadModule(
    '/src/main/agent/pi/createPiConfiguration.ts',
  )
  const model = {
    providerId: 'custom',
    providerName: 'Custom',
    modelId: 'model',
    baseUrl: 'https://example.com/v1',
    apiKey: 'fixture',
    protocol: 'openai-completions' as const,
    reasoningLevels: ['high'],
    contextWindow: 64000,
    maxOutputTokens: 4000,
  }
  assert.equal(createPiConfiguration(model, 'high').settings.thinkingLevel, 'high')
  assert.equal(createPiConfiguration(model, 'none').settings.thinkingLevel, 'off')
  assert.equal(createPiConfiguration(model, 'low').settings.thinkingLevel, 'low')
  assert.equal(
    createPiConfiguration({ ...model, reasoningLevels: [] }, 'high').settings.thinkingLevel,
    'high',
  )
})
