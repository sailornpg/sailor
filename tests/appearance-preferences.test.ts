import assert from 'node:assert/strict'
import test from 'node:test'

async function loadPreferences() {
  try {
    return await import('../src/renderer/src/lib/appearancePreferences.ts')
  } catch {
    assert.fail('外观偏好模块尚未实现')
  }
}

function storage(initial: Record<string, string> = {}): Storage {
  const values = new Map(Object.entries(initial))
  return {
    get length() { return values.size },
    clear() { values.clear() },
    getItem(key) { return values.get(key) ?? null },
    key(index) { return [...values.keys()][index] ?? null },
    removeItem(key) { values.delete(key) },
    setItem(key, value) { values.set(key, value) },
  }
}

test('reads valid preferences and falls back on invalid persisted values', async () => {
  const { APPEARANCE_STORAGE_KEY, DEFAULT_APPEARANCE_PREFERENCES, readAppearancePreferences } = await loadPreferences()
  const saved = { theme: 'light', accent: 'blue' }

  assert.deepEqual(readAppearancePreferences(storage({ [APPEARANCE_STORAGE_KEY]: JSON.stringify(saved) })), saved)
  assert.deepEqual(readAppearancePreferences(storage({ [APPEARANCE_STORAGE_KEY]: '{broken' })), DEFAULT_APPEARANCE_PREFERENCES)
  assert.deepEqual(readAppearancePreferences(storage({ [APPEARANCE_STORAGE_KEY]: JSON.stringify({ theme: 'neon' }) })), DEFAULT_APPEARANCE_PREFERENCES)
})

test('persists preferences and reports storage failures without throwing', async () => {
  const { DEFAULT_APPEARANCE_PREFERENCES, resetAppearancePreferences, saveAppearancePreferences } = await loadPreferences()
  const target = storage()

  assert.equal(saveAppearancePreferences(target, { theme: 'dark', accent: 'purple' }), true)
  assert.deepEqual(resetAppearancePreferences(target), { preferences: DEFAULT_APPEARANCE_PREFERENCES, persisted: true })

  const unavailable = storage()
  unavailable.setItem = () => { throw new Error('quota exceeded') }
  assert.equal(saveAppearancePreferences(unavailable, { theme: 'dark', accent: 'green' }), false)
  assert.deepEqual(resetAppearancePreferences(unavailable), { preferences: DEFAULT_APPEARANCE_PREFERENCES, persisted: false })
})
