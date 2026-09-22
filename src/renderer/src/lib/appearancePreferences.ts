export const APPEARANCE_STORAGE_KEY = 'sailor.appearance.v1'

export const themeModes = ['system', 'light', 'dark'] as const
export const accentColors = ['default', 'blue', 'green', 'purple'] as const

export type ThemeMode = (typeof themeModes)[number]
export type AccentColor = (typeof accentColors)[number]

export interface AppearancePreferences {
  theme: ThemeMode
  accent: AccentColor
}

export const DEFAULT_APPEARANCE_PREFERENCES: AppearancePreferences = {
  theme: 'system',
  accent: 'default',
}

export interface PreferenceResetResult {
  preferences: AppearancePreferences
  persisted: boolean
}

export function readAppearancePreferences(storage: Pick<Storage, 'getItem'> | undefined): AppearancePreferences {
  if (!storage) return { ...DEFAULT_APPEARANCE_PREFERENCES }

  try {
    const raw = storage.getItem(APPEARANCE_STORAGE_KEY)
    if (!raw) return { ...DEFAULT_APPEARANCE_PREFERENCES }
    const value: unknown = JSON.parse(raw)
    return isAppearancePreferences(value) ? value : { ...DEFAULT_APPEARANCE_PREFERENCES }
  } catch {
    return { ...DEFAULT_APPEARANCE_PREFERENCES }
  }
}

export function saveAppearancePreferences(
  storage: Pick<Storage, 'setItem'> | undefined,
  preferences: AppearancePreferences,
): boolean {
  if (!storage) return false

  try {
    storage.setItem(APPEARANCE_STORAGE_KEY, JSON.stringify(preferences))
    return true
  } catch {
    return false
  }
}

export function resetAppearancePreferences(
  storage: Pick<Storage, 'setItem'> | undefined,
): PreferenceResetResult {
  const preferences = { ...DEFAULT_APPEARANCE_PREFERENCES }
  return {
    preferences,
    persisted: saveAppearancePreferences(storage, preferences),
  }
}

function isAppearancePreferences(value: unknown): value is AppearancePreferences {
  if (!value || typeof value !== 'object') return false
  const candidate = value as Partial<AppearancePreferences>
  return themeModes.includes(candidate.theme as ThemeMode)
    && accentColors.includes(candidate.accent as AccentColor)
}
