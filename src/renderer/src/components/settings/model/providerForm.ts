import type { ModelConfig, ProviderProtocol, ProviderSummary } from '@shared/contracts'
import { createModelConfig } from '@/lib/modelCatalogSelection'

export interface ProviderForm {
  id: string
  name: string
  baseUrl: string
  protocol: ProviderProtocol
  apiKey: string
  models: ModelConfig[]
}

export const createProviderForm = (): ProviderForm => ({
  id: '',
  name: '',
  baseUrl: '',
  protocol: 'openai-completions',
  apiKey: '',
  models: [],
})

export function createProviderFormFromSummary(provider: ProviderSummary): ProviderForm {
  return {
    id: provider.id,
    name: provider.name,
    baseUrl: provider.baseUrl,
    protocol: provider.protocol,
    apiKey: '',
    models: provider.models.map((model) => {
      if (typeof model === 'string') return createModelConfig(model)
      return {
        ...model,
        name: model.name || model.id,
        contextWindow: model.contextWindow ?? null,
        maxOutputTokens: model.maxOutputTokens ?? null,
        reasoningLevels: [...(model.reasoningLevels ?? [])],
        vision: model.vision ?? false,
      }
    }),
  }
}

export function parseOptionalInteger(value: string): number | null {
  return value.trim() ? Number(value) : null
}
