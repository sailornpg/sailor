import assert from 'node:assert/strict'
import test from 'node:test'
import { createServer } from 'vite'

test('Pi 映射自定义协议、能力、推理且显式隔离认证环境', async () => {
  const vite = await createServer({ logLevel: 'silent', server: { middlewareMode: true } })
  try {
    const mod = await vite
      .ssrLoadModule('/src/main/agent/pi/createPiConfiguration.ts')
      .catch(() => ({}))
    assert.equal(typeof mod.createPiConfiguration, 'function', '需要 Pi Provider 映射')
    const config = {
      providerId: 'custom-id',
      providerName: 'Custom',
      baseUrl: 'https://example.com/v1',
      apiKey: 'fixture',
      modelId: 'custom-model',
      protocol: 'openai-completions',
      reasoningLevels: ['high'],
      contextWindow: 64000,
      maxOutputTokens: 4096,
      vision: true,
    }
    const result = mod.createPiConfiguration(config, 'high')
    assert.equal(result.model, 'sailor/custom-model')
    assert.deepEqual(result.settings.auth, {
      SAILOR_API_KEY: 'fixture',
      SAILOR_BASE_URL: config.baseUrl,
    })
    assert.equal(result.settings.providers.sailor.api, 'openai-completions')
    assert.deepEqual(result.settings.providers.sailor.models[0].compat, {
      supportsFinishReason: false,
    })
    assert.equal(result.settings.providers.sailor.models[0].contextWindow, 64000)
    assert.deepEqual(result.settings.providers.sailor.models[0].input, ['text', 'image'])
    assert.equal(result.settings.thinkingLevel, 'high')
    const defaults = mod.createPiConfiguration(
      { ...config, contextWindow: undefined, maxOutputTokens: undefined },
      'provider-default',
    )
    assert.equal(defaults.settings.providers.sailor.models[0].contextWindow, 128000)
    assert.equal(defaults.settings.providers.sailor.models[0].maxTokens, 8192)
    assert.equal(
      mod.createPiConfiguration({ ...config, protocol: 'openai-responses' }, 'none').settings
        .providers.sailor.api,
      'openai-responses',
    )
    assert.equal(
      mod.createPiConfiguration({ ...config, protocol: 'openai-responses' }, 'none').settings
        .providers.sailor.models[0].compat,
      undefined,
    )
    assert.equal(mod.createPiConfiguration(config, 'none').settings.thinkingLevel, 'off')
    assert.equal(mod.createPiConfiguration(config, 'xhigh').settings.thinkingLevel, 'xhigh')
    assert.throws(
      () => mod.createPiConfiguration({ ...config, maxOutputTokens: 65000 }, 'high'),
      /上下文窗口/,
    )
  } finally {
    await vite.close()
  }
})
