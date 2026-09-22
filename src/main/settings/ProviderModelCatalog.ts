import type { SettingsService } from './SettingsService.js'
import type { FetchProviderModelsInput } from '../../shared/contracts.js'

type FetchImplementation = (input: string | URL | Request, init?: RequestInit) => Promise<Response>

export class ProviderModelCatalog {
  private readonly settings: SettingsService
  private readonly fetchImplementation: FetchImplementation

  constructor(
    settings: SettingsService,
    fetchImplementation: FetchImplementation = fetch,
  ) {
    this.settings = settings
    this.fetchImplementation = fetchImplementation
  }

  async fetchModels(input: FetchProviderModelsInput): Promise<string[]> {
    const baseUrl = normalizeBaseUrl(input.baseUrl)
    const apiKey = await this.settings.resolveProviderApiKey(input.providerId, input.apiKey)
    const response = await this.fetchImplementation(`${baseUrl}/models`, {
      method: 'GET',
      headers: {
        Accept: 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
    })

    if (!response.ok) {
      throw new Error(`获取模型失败（${response.status}）：${await readErrorMessage(response)}`)
    }

    const payload = await response.json() as { data?: unknown }
    if (!Array.isArray(payload.data)) throw new Error('模型目录格式无效：缺少 data 数组。')

    return [...new Set(payload.data.flatMap((entry) => {
      if (!entry || typeof entry !== 'object' || !('id' in entry)) return []
      const id = String(entry.id).trim()
      return id ? [id] : []
    }))].sort((left, right) => left.localeCompare(right, 'en', { numeric: true }))
  }
}

function normalizeBaseUrl(value: string): string {
  let url: URL
  try {
    url = new URL(value.trim())
  } catch {
    throw new Error('API 地址无效，无法获取模型。')
  }
  if (!['http:', 'https:'].includes(url.protocol)) {
    throw new Error('API 地址必须使用 HTTP 或 HTTPS。')
  }
  return url.toString().replace(/\/$/, '')
}

async function readErrorMessage(response: Response): Promise<string> {
  try {
    const payload = await response.json() as { error?: { message?: unknown }; message?: unknown }
    const message = payload.error?.message ?? payload.message
    if (typeof message === 'string' && message.trim()) return message.trim()
  } catch {
    // Fall back to the HTTP status when the provider does not return JSON.
  }
  return response.statusText || '提供商拒绝了请求'
}
