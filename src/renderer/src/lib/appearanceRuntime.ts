import {
  readAppearancePreferences,
  resetAppearancePreferences,
  saveAppearancePreferences,
  type AppearancePreferences,
} from './appearancePreferences.js'

type AppearanceListener = (preferences: AppearancePreferences) => void

export interface AppearanceRoot {
  classList: Pick<DOMTokenList, 'toggle'>
  dataset: Record<string, string | undefined>
  style: Pick<CSSStyleDeclaration, 'colorScheme'>
}

export interface AppearanceMediaQuery {
  readonly matches: boolean
  addEventListener(type: 'change', listener: (event: { matches: boolean }) => void): void
  removeEventListener(type: 'change', listener: (event: { matches: boolean }) => void): void
}

export interface AppearanceRuntimeOptions {
  root: AppearanceRoot
  storage: Pick<Storage, 'getItem' | 'setItem'> | undefined
  mediaQuery: AppearanceMediaQuery
  onPersistenceError?: () => void
}

export interface AppearanceRuntime {
  getPreferences(): AppearancePreferences
  setPreferences(preferences: AppearancePreferences): boolean
  reset(): boolean
  subscribe(listener: AppearanceListener): () => void
  dispose(): void
}

export function createAppearanceRuntime(options: AppearanceRuntimeOptions): AppearanceRuntime {
  let preferences = readAppearancePreferences(options.storage)
  const listeners = new Set<AppearanceListener>()

  const apply = () => applyAppearance(options.root, preferences, options.mediaQuery.matches)
  const notify = () => {
    apply()
    for (const listener of listeners) listener(preferences)
  }
  const handleSystemChange = () => {
    if (preferences.theme === 'system') notify()
  }

  apply()
  options.mediaQuery.addEventListener('change', handleSystemChange)

  return {
    getPreferences: () => preferences,
    setPreferences(next) {
      preferences = { ...next }
      const persisted = saveAppearancePreferences(options.storage, preferences)
      if (!persisted) options.onPersistenceError?.()
      notify()
      return persisted
    },
    reset() {
      const result = resetAppearancePreferences(options.storage)
      preferences = result.preferences
      if (!result.persisted) options.onPersistenceError?.()
      notify()
      return result.persisted
    },
    subscribe(listener) {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    dispose() {
      options.mediaQuery.removeEventListener('change', handleSystemChange)
      listeners.clear()
    },
  }
}

export function applyAppearance(
  root: AppearanceRoot,
  preferences: AppearancePreferences,
  systemPrefersDark: boolean,
): void {
  const resolvedTheme = preferences.theme === 'system'
    ? systemPrefersDark ? 'dark' : 'light'
    : preferences.theme
  root.classList.toggle('dark', resolvedTheme === 'dark')
  root.dataset.theme = resolvedTheme
  root.dataset.accent = preferences.accent
  root.style.colorScheme = resolvedTheme
}

let browserRuntime: AppearanceRuntime | undefined

export function getBrowserAppearanceRuntime(): AppearanceRuntime {
  browserRuntime ??= createAppearanceRuntime({
    root: document.documentElement,
    storage: window.localStorage,
    mediaQuery: window.matchMedia('(prefers-color-scheme: dark)'),
  })
  return browserRuntime
}
