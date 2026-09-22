import assert from 'node:assert/strict'
import { mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import { ProviderModelCatalog } from '../src/main/settings/ProviderModelCatalog.ts'
import { SettingsService, type CredentialCipher } from '../src/main/settings/SettingsService.ts'

const cipher: CredentialCipher = {
  encrypt(value) {
    return Buffer.from(`encrypted:${value}`).toString('base64')
  },
  decrypt(value) {
    return Buffer.from(value, 'base64').toString('utf8').replace(/^encrypted:/, '')
  },
}

async function createSettings() {
  const directory = await mkdtemp(join(tmpdir(), 'sailor-catalog-'))
  return new SettingsService(join(directory, 'settings.json'), cipher)
}

test('fetches, normalizes, deduplicates and sorts an OpenAI-compatible model catalog', async () => {
  const settings = await createSettings()
  await settings.saveProvider({
    id: 'acme',
    name: 'Acme',
    baseUrl: 'https://saved.example/v1',
    protocol: 'openai-completions',
    apiKey: 'saved-secret',
    models: [],
  })
  const requests: Array<{ url: string; authorization: string | null }> = []
  const catalog = new ProviderModelCatalog(settings, async (input, init) => {
    requests.push({
      url: String(input),
      authorization: new Headers(init?.headers).get('Authorization'),
    })
    return Response.json({
      data: [{ id: 'zeta' }, { id: 'alpha' }, { id: 'alpha' }, { id: '' }, { nope: true }],
    })
  })

  const models = await catalog.fetchModels({
    providerId: 'acme',
    baseUrl: 'https://current.example/v1/',
    apiKey: '',
  })

  assert.deepEqual(models, ['alpha', 'zeta'])
  assert.deepEqual(requests, [{
    url: 'https://current.example/v1/models',
    authorization: 'Bearer saved-secret',
  }])
})

test('uses an unsaved API key for a new provider', async () => {
  const settings = await createSettings()
  let authorization: string | null = null
  const catalog = new ProviderModelCatalog(settings, async (_input, init) => {
    authorization = new Headers(init?.headers).get('Authorization')
    return Response.json({ data: [{ id: 'new-model' }] })
  })

  assert.deepEqual(await catalog.fetchModels({
    providerId: 'new-provider',
    baseUrl: 'https://new.example/v1',
    apiKey: 'new-secret',
  }), ['new-model'])
  assert.equal(authorization, 'Bearer new-secret')
})

test('reports provider errors and malformed catalogs in Chinese', async () => {
  const settings = await createSettings()
  const failedCatalog = new ProviderModelCatalog(settings, async () =>
    Response.json({ error: { message: 'invalid token' } }, { status: 401 }))

  await assert.rejects(
    failedCatalog.fetchModels({
      providerId: 'new-provider',
      baseUrl: 'https://new.example/v1',
      apiKey: 'bad-secret',
    }),
    /获取模型失败.*invalid token/,
  )

  const malformedCatalog = new ProviderModelCatalog(settings, async () =>
    Response.json({ models: [] }))
  await assert.rejects(
    malformedCatalog.fetchModels({
      providerId: 'new-provider',
      baseUrl: 'https://new.example/v1',
      apiKey: 'secret',
    }),
    /模型目录格式无效/,
  )
})

test('requires a key when neither the form nor saved settings provide one', async () => {
  const settings = await createSettings()
  const catalog = new ProviderModelCatalog(settings, async () => Response.json({ data: [] }))

  await assert.rejects(
    catalog.fetchModels({
      providerId: 'openai',
      baseUrl: 'https://api.openai.com/v1',
      apiKey: '',
    }),
    /API 密钥/,
  )
})
