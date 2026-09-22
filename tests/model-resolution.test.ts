import assert from 'node:assert/strict'
import test from 'node:test'
import { createServer } from 'vite'

test('Pi 保留 Completions、Responses 与 Anthropic 协议选择', async t => {
  const vite = await createServer({ logLevel: 'silent', server: { middlewareMode: true } })
  t.after(() => vite.close())
  const { createPiConfiguration } = await vite.ssrLoadModule('/src/main/agent/pi/createPiConfiguration.ts')
  for (const [providerId, protocol, api] of [['openai', 'openai-responses', 'openai-responses'], ['deepseek', 'openai-completions', 'openai-completions'], ['custom', 'anthropic-messages', 'anthropic-messages']] as const) {
    const result = createPiConfiguration({ providerId, providerName: providerId, modelId: 'model', baseUrl: 'https://example.com/v1', apiKey: 'fixture', protocol, reasoningLevels: [], contextWindow: 64000, maxOutputTokens: 4000 }, 'provider-default')
    assert.equal(result.settings.providers?.sailor.api, api)
    assert.equal(result.model, 'sailor/model')
  }
})
