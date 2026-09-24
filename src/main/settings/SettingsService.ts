import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { dirname } from 'node:path'
import type {
  ModelConfig,
  ModelSelection,
  ProviderInput,
  ProviderKind,
  ProviderProtocol,
  ProviderSummary,
  ResolvedModel,
  SettingsSnapshot,
} from '../../shared/contracts.js'

export interface CredentialCipher {
  encrypt(value: string): string
  decrypt(value: string): string
}

interface StoredProvider {
  id: string
  name: string
  baseUrl: string
  protocol: ProviderProtocol
  models: ModelConfig[]
  kind: ProviderKind
  encryptedApiKey?: string
}

interface SettingsFile {
  version: 3
  providers: StoredProvider[]
  activeModel: ModelSelection | null
}

interface Version2SettingsFile {
  version: 2
  providers: StoredProvider[]
  activeModel: ModelSelection | null
}

interface LegacyProvider extends Omit<StoredProvider, 'models'> {
  models: string[]
}

interface LegacySettingsFile {
  version: 1
  providers: LegacyProvider[]
  activeModel: ModelSelection | null
}

const providerPresets: StoredProvider[] = [
  {
    id: 'deepseek',
    name: 'DeepSeek',
    baseUrl: 'https://api.deepseek.com/v1',
    protocol: 'openai-completions',
    models: [],
    kind: 'builtin',
  },
]

export class SettingsService {
  private operation = Promise.resolve()
  private readonly filePath: string
  private readonly cipher: CredentialCipher

  constructor(filePath: string, cipher: CredentialCipher) {
    this.filePath = filePath
    this.cipher = cipher
  }

  getSnapshot(): Promise<SettingsSnapshot> {
    return this.read().then(toSnapshot)
  }

  saveProvider(input: ProviderInput): Promise<SettingsSnapshot> {
    return this.mutate(async (settings) => {
      const normalized = normalizeProvider(input)
      const existingIndex = settings.providers.findIndex(({ id }) => id === normalized.id)
      const existing = settings.providers[existingIndex]
      const encryptedApiKey = normalized.apiKey
        ? this.cipher.encrypt(normalized.apiKey)
        : existing?.encryptedApiKey

      const provider: StoredProvider = {
        id: normalized.id,
        name: normalized.name,
        baseUrl: normalized.baseUrl,
        protocol: normalized.protocol,
        models: normalized.models,
        kind: existing?.kind ?? 'custom',
        ...(encryptedApiKey ? { encryptedApiKey } : {}),
      }

      if (existingIndex >= 0) settings.providers[existingIndex] = provider
      else settings.providers.push(provider)

      if (
        settings.activeModel?.providerId === provider.id &&
        !provider.models.some(({ id }) => id === settings.activeModel?.modelId)
      ) {
        settings.activeModel = null
      }

      return settings
    })
  }

  deleteProvider(providerId: string): Promise<SettingsSnapshot> {
    return this.mutate(async (settings) => {
      const provider = settings.providers.find(({ id }) => id === providerId)
      if (!provider) throw new Error(`提供商未配置：${providerId}`)
      if (provider.kind === 'builtin') throw new Error('内置提供商不能删除。')

      settings.providers = settings.providers.filter(({ id }) => id !== providerId)
      if (settings.activeModel?.providerId === providerId) settings.activeModel = null
      return settings
    })
  }

  setActiveModel(selection: ModelSelection): Promise<SettingsSnapshot> {
    return this.mutate(async (settings) => {
      const provider = settings.providers.find(({ id }) => id === selection.providerId)
      if (!provider?.models.some(({ id }) => id === selection.modelId)) {
        throw new Error(`模型未配置：${selection.providerId}/${selection.modelId}`)
      }
      settings.activeModel = selection
      return settings
    })
  }

  async resolveActiveModel(): Promise<ResolvedModel | null> {
    const settings = await this.read()
    const selection = settings.activeModel
    if (!selection) return null

    const provider = settings.providers.find(({ id }) => id === selection.providerId)
    const model = provider?.models.find(({ id }) => id === selection.modelId)
    if (!provider || !model) return null
    if (!provider.encryptedApiKey) {
      throw new Error(`请先在设置中为 ${provider.name} 添加 API 密钥。`)
    }

    return {
      providerId: provider.id,
      providerName: provider.name,
      baseUrl: provider.baseUrl,
      protocol: provider.protocol,
      apiKey: this.cipher.decrypt(provider.encryptedApiKey),
      modelId: model.id,
      reasoningLevels: [...model.reasoningLevels],
      ...(model.contextWindow ? { contextWindow: model.contextWindow } : {}),
      vision: model.vision,
      ...(model.maxOutputTokens ? { maxOutputTokens: model.maxOutputTokens } : {}),
    }
  }

  async resolveProviderApiKey(providerId: string, apiKey?: string): Promise<string> {
    const currentApiKey = apiKey?.trim()
    if (currentApiKey) return currentApiKey

    const settings = await this.read()
    const provider = settings.providers.find(({ id }) => id === providerId)
    if (!provider?.encryptedApiKey) {
      throw new Error('请先输入 API 密钥，再获取可用模型。')
    }
    return this.cipher.decrypt(provider.encryptedApiKey)
  }

  private mutate(
    update: (settings: SettingsFile) => Promise<SettingsFile>,
  ): Promise<SettingsSnapshot> {
    const result = this.operation.then(async () => {
      const settings = await update(await this.read())
      await this.write(settings)
      return toSnapshot(settings)
    })
    this.operation = result.then(
      () => undefined,
      () => undefined,
    )
    return result
  }

  private async read(): Promise<SettingsFile> {
    try {
      const parsed = JSON.parse(await readFile(this.filePath, 'utf8')) as
        Partial<SettingsFile> | Partial<Version2SettingsFile> | Partial<LegacySettingsFile>
      if (!Array.isArray(parsed.providers)) {
        throw new Error('模型提供商设置格式无效。')
      }
      if (parsed.version === 1) {
        const migrated = migrateSettings(parsed as LegacySettingsFile)
        await this.write(migrated)
        return migrated
      }
      if (parsed.version === 2) {
        const migrated = migrateVersion2Settings(parsed as Version2SettingsFile)
        await this.write(migrated)
        return migrated
      }
      if (parsed.version !== 3) throw new Error('不支持此版本的模型提供商设置。')
      const providers = removeRetiredOpenAiProvider(
        (parsed.providers as StoredProvider[]).map((provider) => ({
          ...provider,
          protocol: normalizeStoredProtocol(
            (provider as StoredProvider & { protocol?: string }).protocol,
          ),
        })),
      )
      return {
        version: 3,
        providers,
        activeModel:
          parsed.activeModel && providers.some(({ id }) => id === parsed.activeModel?.providerId)
            ? parsed.activeModel
            : null,
      }
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
      return defaultSettings()
    }
  }

  private async write(settings: SettingsFile): Promise<void> {
    await mkdir(dirname(this.filePath), { recursive: true })
    const temporaryPath = `${this.filePath}.tmp`
    await writeFile(temporaryPath, `${JSON.stringify(settings, null, 2)}\n`, {
      encoding: 'utf8',
      mode: 0o600,
    })
    await rename(temporaryPath, this.filePath)
  }
}

function defaultSettings(): SettingsFile {
  return {
    version: 3,
    providers: providerPresets.map((provider) => ({ ...provider, models: [] })),
    activeModel: null,
  }
}

function migrateSettings(settings: LegacySettingsFile): SettingsFile {
  const providers = removeRetiredOpenAiProvider(
    settings.providers.map((provider) => ({
      ...provider,
      protocol: normalizeStoredProtocol(
        (provider as LegacyProvider & { protocol?: string }).protocol,
      ),
      models: provider.models.map(createEmptyModelConfig),
    })),
  )
  return {
    version: 3,
    providers,
    activeModel:
      settings.activeModel && providers.some(({ id }) => id === settings.activeModel?.providerId)
        ? settings.activeModel
        : null,
  }
}

function migrateVersion2Settings(settings: Version2SettingsFile): SettingsFile {
  const providers = removeRetiredOpenAiProvider(
    settings.providers.map((provider) => ({
      ...provider,
      protocol: normalizeStoredProtocol(
        (provider as StoredProvider & { protocol?: string }).protocol,
      ),
    })),
  )
  return {
    version: 3,
    providers,
    activeModel:
      settings.activeModel && providers.some(({ id }) => id === settings.activeModel?.providerId)
        ? settings.activeModel
        : null,
  }
}

function removeRetiredOpenAiProvider(providers: StoredProvider[]): StoredProvider[] {
  return providers.filter(
    (provider) =>
      !(provider.id === 'openai' && provider.kind === 'builtin' && !provider.encryptedApiKey),
  )
}

function normalizeStoredProtocol(protocol: string | undefined): ProviderProtocol {
  if (protocol === 'openai-chat') return 'openai-completions'
  if (
    protocol === 'openai-completions' ||
    protocol === 'openai-responses' ||
    protocol === 'anthropic-messages'
  )
    return protocol
  throw new Error(`不支持的 API 协议：${protocol ?? '未设置'}`)
}

function createEmptyModelConfig(id: string): ModelConfig {
  return {
    id,
    name: id,
    contextWindow: null,
    maxOutputTokens: null,
    reasoningLevels: [],
    vision: false,
  }
}

function normalizeProvider(input: ProviderInput): ProviderInput {
  const id = input.id.trim()
  if (!/^[a-z][a-z0-9-]*$/.test(id)) {
    throw new Error('提供商 ID 必须以小写字母开头，且只能包含小写字母、数字或连字符。')
  }

  const name = input.name.trim()
  if (!name) throw new Error('显示名称不能为空。')

  let url: URL
  try {
    url = new URL(input.baseUrl.trim())
  } catch {
    throw new Error('API 地址无效。')
  }
  if (!['http:', 'https:'].includes(url.protocol)) {
    throw new Error('API 地址必须使用 HTTP 或 HTTPS。')
  }

  const models = [
    ...new Map(
      input.models.map((model) => {
        const normalized = normalizeModel(model)
        return [normalized.id, normalized]
      }),
    ).values(),
  ]

  return {
    id,
    name,
    baseUrl: url.toString().replace(/\/$/, ''),
    protocol: input.protocol,
    apiKey: input.apiKey?.trim(),
    models,
  }
}

function normalizeModel(model: ModelConfig): ModelConfig {
  const id = model.id.trim()
  if (!id) throw new Error('模型 ID 不能为空。')
  const name = model.name.trim() || id
  const contextWindow = normalizeLimit(model.contextWindow, '上下文窗口')
  const maxOutputTokens = normalizeLimit(model.maxOutputTokens, '最大输出 token')

  return {
    id,
    name,
    contextWindow,
    maxOutputTokens,
    reasoningLevels: [
      ...new Set(model.reasoningLevels.map((level) => level.trim()).filter(Boolean)),
    ],
    vision: Boolean(model.vision),
  }
}

function normalizeLimit(value: number | null, label: string): number | null {
  if (value === null) return null
  if (!Number.isInteger(value) || value <= 0) throw new Error(`${label}必须是正整数。`)
  return value
}

function toSnapshot(settings: SettingsFile): SettingsSnapshot {
  return {
    providers: settings.providers.map(({ encryptedApiKey, ...provider }): ProviderSummary => ({
      ...provider,
      models: provider.models.map((model) => ({
        ...model,
        reasoningLevels: [...model.reasoningLevels],
      })),
      hasApiKey: Boolean(encryptedApiKey),
    })),
    activeModel: settings.activeModel,
  }
}
