import assert from 'node:assert/strict'
import { resolve } from 'node:path'
import test from 'node:test'
import { createServer } from 'vite'

async function loadAppearance() {
  const vite = await createServer({
    logLevel: 'silent',
    resolve: {
      alias: {
        '@': resolve(process.cwd(), 'src/renderer/src'),
        '@shared': resolve(process.cwd(), 'src/shared'),
      },
    },
    server: { middlewareMode: true },
  })
  try {
    return await vite.ssrLoadModule('/src/renderer/src/lib/appearanceRuntime.ts')
  } catch {
    assert.fail('外观运行时模块尚未实现')
  } finally {
    await vite.close()
  }
}

function createHarness(prefersDark = false) {
  const classes = new Set<string>()
  const dataset: Record<string, string> = {}
  const style = { colorScheme: '' }
  const listeners = new Set<(event: { matches: boolean }) => void>()
  let dark = prefersDark
  let stored: string | null = null

  return {
    root: {
      classList: { toggle(name: string, force?: boolean) { force ? classes.add(name) : classes.delete(name); return Boolean(force) } },
      dataset,
      style,
    },
    storage: {
      getItem() { return stored },
      setItem(_key: string, value: string) { stored = value },
    },
    mediaQuery: {
      get matches() { return dark },
      addEventListener(_type: 'change', listener: (event: { matches: boolean }) => void) { listeners.add(listener) },
      removeEventListener(_type: 'change', listener: (event: { matches: boolean }) => void) { listeners.delete(listener) },
    },
    setSystemDark(next: boolean) { dark = next; for (const listener of listeners) listener({ matches: next }) },
    classes,
    dataset,
    style,
    listenerCount() { return listeners.size },
  }
}

test('applies the saved appearance before consumers read runtime state', async () => {
  const { createAppearanceRuntime } = await loadAppearance()
  const harness = createHarness(true)
  harness.storage.setItem('', JSON.stringify({ theme: 'system', accent: 'green' }))

  const runtime = createAppearanceRuntime(harness)

  assert.equal(harness.classes.has('dark'), true)
  assert.deepEqual(harness.dataset, { theme: 'dark', accent: 'green' })
  assert.equal(harness.style.colorScheme, 'dark')
  assert.deepEqual(runtime.getPreferences(), { theme: 'system', accent: 'green' })
})

test('system mode follows OS changes while explicit themes ignore them', async () => {
  const { createAppearanceRuntime } = await loadAppearance()
  const harness = createHarness(false)
  const runtime = createAppearanceRuntime(harness)

  harness.setSystemDark(true)
  assert.equal(harness.dataset.theme, 'dark')

  runtime.setPreferences({ theme: 'light', accent: 'blue' })
  harness.setSystemDark(false)
  harness.setSystemDark(true)
  assert.equal(harness.dataset.theme, 'light')
  assert.equal(harness.dataset.accent, 'blue')
})

test('disposes exactly one system listener and supports repeated StrictMode setup', async () => {
  const { createAppearanceRuntime } = await loadAppearance()
  const harness = createHarness()

  const first = createAppearanceRuntime(harness)
  assert.equal(harness.listenerCount(), 1)
  first.dispose()
  assert.equal(harness.listenerCount(), 0)

  const second = createAppearanceRuntime(harness)
  assert.equal(harness.listenerCount(), 1)
  second.dispose()
  assert.equal(harness.listenerCount(), 0)
})
