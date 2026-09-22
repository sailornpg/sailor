import assert from 'node:assert/strict'
import { mkdtemp, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import { SettingsService, type CredentialCipher } from '../src/main/settings/SettingsService.ts'

const cipher: CredentialCipher = {
  encrypt(value) {
    return Buffer.from(`encrypted:${value}`).toString('base64')
  },
  decrypt(value) {
    return Buffer.from(value, 'base64').toString('utf8').replace(/^encrypted:/, '')
  },
}

async function createService() {
  const directory = await mkdtemp(join(tmpdir(), 'sailor-settings-'))
  const filePath = join(directory, 'model-providers.json')
  return { filePath, service: new SettingsService(filePath, cipher) }
}

const model = {
  id: 'acme-code',
  name: 'Acme Code',
  contextWindow: 128000,
  maxOutputTokens: 8192,
  reasoningLevels: ['low', 'medium', 'high'],
  vision: true,
}

test('starts with editable OpenAI and DeepSeek provider presets', async () => {
  const { service } = await createService()
  const snapshot = await service.getSnapshot()

  assert.deepEqual(
    snapshot.providers.map(({ id, hasApiKey, kind, protocol }) => ({ id, hasApiKey, kind, protocol })),
    [
      { id: 'openai', hasApiKey: false, kind: 'builtin', protocol: 'openai-completions' },
      { id: 'deepseek', hasApiKey: false, kind: 'builtin', protocol: 'openai-completions' },
    ],
  )
  assert.equal(snapshot.activeModel, null)
  assert.deepEqual(snapshot.providers.flatMap(({ models }) => models), [])
})

test('persists only encrypted credentials and never returns a saved API key', async () => {
  const { filePath, service } = await createService()

  const snapshot = await service.saveProvider({
    id: 'acme-gateway',
    name: 'Acme Gateway',
    baseUrl: 'https://gateway.example/v1',
    protocol: 'openai-completions',
    apiKey: 'secret-value',
    models: [model],
  })

  const provider = snapshot.providers.find(({ id }) => id === 'acme-gateway')
  assert.equal(provider?.hasApiKey, true)
  assert.equal('apiKey' in (provider ?? {}), false)

  const rawFile = await readFile(filePath, 'utf8')
  assert.equal(rawFile.includes('secret-value'), false)
  assert.equal(rawFile.includes(Buffer.from('encrypted:secret-value').toString('base64')), true)
})

test('blank credentials preserve the stored key and active model resolution decrypts it', async () => {
  const { service } = await createService()

  await service.saveProvider({
    id: 'deepseek',
    name: 'DeepSeek',
    baseUrl: 'https://api.deepseek.com/v1',
    protocol: 'openai-completions',
    apiKey: 'deep-secret',
    models: [{ ...model, id: 'deepseek-chat', name: 'DeepSeek Chat', vision: false }],
  })
  await service.saveProvider({
    id: 'deepseek',
    name: 'DeepSeek API',
    baseUrl: 'https://api.deepseek.com/v1',
    protocol: 'openai-completions',
    apiKey: '',
    models: [{ ...model, id: 'deepseek-chat', name: 'DeepSeek Chat', vision: false }],
  })
  await service.setActiveModel({ providerId: 'deepseek', modelId: 'deepseek-chat' })

  assert.deepEqual(await service.resolveActiveModel(), {
    providerId: 'deepseek',
    providerName: 'DeepSeek API',
    baseUrl: 'https://api.deepseek.com/v1',
    protocol: 'openai-completions',
    apiKey: 'deep-secret',
    modelId: 'deepseek-chat',
    reasoningLevels: ['low', 'medium', 'high'],
    contextWindow: 128000,
    vision: false,
    maxOutputTokens: 8192,
  })
})

test('migrates version 1 string models without losing credentials or active selection', async () => {
  const { filePath, service } = await createService()
  await writeFile(filePath, JSON.stringify({
    version: 1,
    providers: [{
      id: 'legacy',
      name: 'Legacy',
      baseUrl: 'https://legacy.example/v1',
      protocol: 'openai-completions',
      models: ['legacy-code'],
      kind: 'custom',
      encryptedApiKey: cipher.encrypt('legacy-secret'),
    }],
    activeModel: { providerId: 'legacy', modelId: 'legacy-code' },
  }))

  const snapshot = await service.getSnapshot()

  assert.deepEqual(snapshot.providers[0]?.models, [{
    id: 'legacy-code',
    name: 'legacy-code',
    contextWindow: null,
    maxOutputTokens: null,
    reasoningLevels: [],
    vision: false,
  }])
  assert.deepEqual(snapshot.activeModel, { providerId: 'legacy', modelId: 'legacy-code' })
  assert.equal(JSON.parse(await readFile(filePath, 'utf8')).version, 3)
  assert.equal((await service.resolveActiveModel())?.apiKey, 'legacy-secret')
})

test('rejects non-positive model limits', async () => {
  const { service } = await createService()

  await assert.rejects(
    service.saveProvider({
      id: 'acme',
      name: 'Acme',
      baseUrl: 'https://example.com/v1',
      protocol: 'openai-completions',
      models: [{ ...model, contextWindow: 0 }],
    }),
    /上下文窗口/,
  )
  await assert.rejects(
    service.saveProvider({
      id: 'acme',
      name: 'Acme',
      baseUrl: 'https://example.com/v1',
      protocol: 'openai-completions',
      models: [{ ...model, maxOutputTokens: -1 }],
    }),
    /最大输出/,
  )
})

test('rejects invalid provider IDs and active models outside the provider catalog', async () => {
  const { service } = await createService()

  await assert.rejects(
    service.saveProvider({
      id: 'Invalid ID',
      name: 'Invalid',
      baseUrl: 'https://example.com/v1',
      protocol: 'openai-responses',
      apiKey: 'secret',
      models: [model],
    }),
    /小写字母/,
  )
  await assert.rejects(
    service.setActiveModel({ providerId: 'openai', modelId: 'not-configured' }),
    /未配置/,
  )
})
