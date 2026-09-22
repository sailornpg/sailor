import type { ModelConfig } from '@shared/contracts'

export function filterSelectableModelIds(
  catalogIds: string[],
  configuredIds: string[],
  query: string,
): string[] {
  const configured = new Set(configuredIds)
  const normalizedQuery = query.trim().toLocaleLowerCase()

  return catalogIds.filter((id) =>
    !configured.has(id) &&
    (!normalizedQuery || id.toLocaleLowerCase().includes(normalizedQuery)))
}

export function toggleSelectedModelId(selectedIds: string[], modelId: string): string[] {
  return selectedIds.includes(modelId)
    ? selectedIds.filter((id) => id !== modelId)
    : [...selectedIds, modelId]
}

export function toggleAllVisibleModelIds(selectedIds: string[], visibleIds: string[]): string[] {
  const visible = new Set(visibleIds)
  const allVisibleSelected = visibleIds.length > 0 && visibleIds.every((id) => selectedIds.includes(id))

  if (allVisibleSelected) return selectedIds.filter((id) => !visible.has(id))
  return [...new Set([...selectedIds, ...visibleIds])]
}

export function appendSelectedModels(
  models: ModelConfig[],
  selectedIds: string[],
): ModelConfig[] {
  const existing = new Set(models.map(({ id }) => id))
  const additions = [...new Set(selectedIds)]
    .filter((id) => !existing.has(id))
    .map(createModelConfig)
  return [...models, ...additions]
}

export function createModelConfig(id: string): ModelConfig {
  return {
    id,
    name: id,
    contextWindow: null,
    maxOutputTokens: null,
    reasoningLevels: [],
    vision: false,
  }
}
