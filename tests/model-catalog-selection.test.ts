import assert from 'node:assert/strict'
import test from 'node:test'

async function loadSelection() {
  try {
    return await import('../src/renderer/src/lib/modelCatalogSelection.ts')
  } catch {
    assert.fail('模型目录选择逻辑尚未实现')
  }
}

test('filters the provider catalog and excludes configured models', async () => {
  const { filterSelectableModelIds } = await loadSelection()

  assert.deepEqual(
    filterSelectableModelIds(
      ['qwen3.5-plus', 'deepseek-v4-pro', 'text-embedding-v4'],
      ['deepseek-v4-pro'],
      'QWEN',
    ),
    ['qwen3.5-plus'],
  )
})

test('toggles an individual model selection without duplicates', async () => {
  const { toggleSelectedModelId } = await loadSelection()

  assert.deepEqual(toggleSelectedModelId(['qwen3.5-plus'], 'deepseek-v4-pro'), [
    'qwen3.5-plus',
    'deepseek-v4-pro',
  ])
  assert.deepEqual(toggleSelectedModelId(['qwen3.5-plus', 'deepseek-v4-pro'], 'qwen3.5-plus'), [
    'deepseek-v4-pro',
  ])
})

test('selects or clears all visible models while preserving hidden selections', async () => {
  const { toggleAllVisibleModelIds } = await loadSelection()

  assert.deepEqual(
    toggleAllVisibleModelIds(['hidden-model'], ['qwen3.5-plus', 'deepseek-v4-pro']),
    ['hidden-model', 'qwen3.5-plus', 'deepseek-v4-pro'],
  )
  assert.deepEqual(
    toggleAllVisibleModelIds(
      ['hidden-model', 'qwen3.5-plus', 'deepseek-v4-pro'],
      ['qwen3.5-plus', 'deepseek-v4-pro'],
    ),
    ['hidden-model'],
  )
})

test('appends selected models with default capabilities and skips existing IDs', async () => {
  const { appendSelectedModels } = await loadSelection()
  const existing = [{
    id: 'qwen3.5-plus',
    name: 'Qwen Plus',
    contextWindow: 128000,
    maxOutputTokens: 8192,
    reasoningLevels: ['medium'],
    vision: true,
  }]

  assert.deepEqual(
    appendSelectedModels(existing, ['qwen3.5-plus', 'deepseek-v4-pro', 'deepseek-v4-pro']),
    [
      existing[0],
      {
        id: 'deepseek-v4-pro',
        name: 'deepseek-v4-pro',
        contextWindow: null,
        maxOutputTokens: null,
        reasoningLevels: [],
        vision: false,
      },
    ],
  )
})
