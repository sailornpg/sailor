export const UI_LAYOUT_STORAGE_KEY = 'sailor.ui-layout.v2'
export const UI_LAYOUT_VERSION = 2

export const SIDEBAR_WIDTH_MIN = 200
export const SIDEBAR_WIDTH_MAX = 420
export const SIDEBAR_WIDTH_DEFAULT = 248

export interface UiLayoutState {
  version: number
  leftWidth: number
  leftCollapsed: boolean
}

export const DEFAULT_UI_LAYOUT: UiLayoutState = Object.freeze({
  version: UI_LAYOUT_VERSION,
  leftWidth: SIDEBAR_WIDTH_DEFAULT,
  leftCollapsed: false,
})

export function createDefaultUiLayout(): UiLayoutState {
  return { version: UI_LAYOUT_VERSION, leftWidth: SIDEBAR_WIDTH_DEFAULT, leftCollapsed: false }
}

export function clampSidebarWidth(width: number): number {
  if (!Number.isFinite(width)) return SIDEBAR_WIDTH_DEFAULT
  return Math.min(SIDEBAR_WIDTH_MAX, Math.max(SIDEBAR_WIDTH_MIN, Math.round(width)))
}

export type UiLayoutAction =
  | { type: 'setLeftWidth'; width: number }
  | { type: 'setLeftCollapsed'; collapsed: boolean }

/**
 * Only the shell's own geometry lives here. Dock visibility and width stay owned by
 * `lib/panels/layout.ts`, so the right pane has one source of truth.
 */
export function uiLayoutReducer(state: UiLayoutState, action: UiLayoutAction): UiLayoutState {
  switch (action.type) {
    case 'setLeftWidth':
      return Number.isFinite(action.width) ? { ...state, leftWidth: clampSidebarWidth(action.width) } : state
    case 'setLeftCollapsed':
      return state.leftCollapsed === action.collapsed ? state : { ...state, leftCollapsed: action.collapsed }
  }
}

/** Persisted layout is external input: any structural violation falls back to the default layout. */
export function parseUiLayout(raw: string | null): UiLayoutState {
  if (!raw) return createDefaultUiLayout()
  let value: unknown
  try {
    value = JSON.parse(raw)
  } catch {
    return createDefaultUiLayout()
  }
  if (!value || typeof value !== 'object') return createDefaultUiLayout()
  const candidate = value as Record<string, unknown>
  if (candidate.version !== UI_LAYOUT_VERSION) return createDefaultUiLayout()
  return {
    version: UI_LAYOUT_VERSION,
    leftWidth: typeof candidate.leftWidth === 'number' ? clampSidebarWidth(candidate.leftWidth) : SIDEBAR_WIDTH_DEFAULT,
    leftCollapsed: candidate.leftCollapsed === true,
  }
}

export function serializeUiLayout(state: UiLayoutState): string {
  return JSON.stringify(state)
}

export function readUiLayout(storage: Pick<Storage, 'getItem'> | undefined): UiLayoutState {
  if (!storage) return createDefaultUiLayout()
  try {
    return parseUiLayout(storage.getItem(UI_LAYOUT_STORAGE_KEY))
  } catch {
    return createDefaultUiLayout()
  }
}

export function saveUiLayout(storage: Pick<Storage, 'setItem'> | undefined, state: UiLayoutState): boolean {
  if (!storage) return false
  try {
    storage.setItem(UI_LAYOUT_STORAGE_KEY, serializeUiLayout(state))
    return true
  } catch {
    return false
  }
}
