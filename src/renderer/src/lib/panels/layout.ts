export const PANEL_LAYOUT_STORAGE_KEY = 'sailor.panels.v1'
export const PANEL_LAYOUT_VERSION = 1
export const PANEL_WIDTH_MIN = 280
export const PANEL_WIDTH_MAX = 720
export const PANEL_WIDTH_DEFAULT = 384
export const PANEL_TAB_LIMIT = 6

export type PanelMultiplicity = 'single' | 'multi'

export interface PanelInstance {
  instanceId: string
  panelId: string
  scopeId: string
}

export interface PanelLayoutState {
  version: number
  visible: boolean
  width: number
  open: PanelInstance[]
  activeInstanceId: string | null
  lastActive: PanelInstance | null
}

export const DEFAULT_PANEL_LAYOUT: PanelLayoutState = Object.freeze({
  version: PANEL_LAYOUT_VERSION,
  visible: false,
  width: PANEL_WIDTH_DEFAULT,
  open: Object.freeze([]) as unknown as PanelInstance[],
  activeInstanceId: null,
  lastActive: null,
})

export function createDefaultPanelLayout(): PanelLayoutState {
  return { version: PANEL_LAYOUT_VERSION, visible: false, width: PANEL_WIDTH_DEFAULT, open: [], activeInstanceId: null, lastActive: null }
}

/** Scope-aware instance identity: one instance per (panel, scope) unless the panel declares `multi`. */
export function createPanelInstanceId(panelId: string, scopeId = ''): string {
  return scopeId ? `${panelId}:${scopeId}` : panelId
}

export function clampPanelWidth(width: number): number {
  if (!Number.isFinite(width)) return PANEL_WIDTH_DEFAULT
  return Math.min(PANEL_WIDTH_MAX, Math.max(PANEL_WIDTH_MIN, Math.round(width)))
}

export type PanelLayoutAction =
  | { type: 'open'; instance: PanelInstance; multiplicity?: PanelMultiplicity }
  | { type: 'close'; instanceId: string }
  | { type: 'activate'; instanceId: string }
  | { type: 'setVisible'; visible: boolean }
  | { type: 'setWidth'; width: number }

function isSameSlot(left: PanelInstance, right: PanelInstance): boolean {
  return left.panelId === right.panelId && left.scopeId === right.scopeId
}

function activate(state: PanelLayoutState, instance: PanelInstance): PanelLayoutState {
  return { ...state, visible: true, activeInstanceId: instance.instanceId, lastActive: instance }
}

export function panelLayoutReducer(state: PanelLayoutState, action: PanelLayoutAction): PanelLayoutState {
  switch (action.type) {
    case 'open': {
      const existing = action.multiplicity === 'multi'
        ? state.open.find(item => item.instanceId === action.instance.instanceId)
        : state.open.find(item => isSameSlot(item, action.instance))
      if (existing) return activate(state, existing)
      if (state.open.length >= PANEL_TAB_LIMIT) return state
      return activate({ ...state, open: [...state.open, action.instance] }, action.instance)
    }
    case 'close': {
      const index = state.open.findIndex(item => item.instanceId === action.instanceId)
      if (index < 0) return state
      const open = state.open.filter(item => item.instanceId !== action.instanceId)
      if (state.activeInstanceId !== action.instanceId) return { ...state, open }
      const next = open[index] ?? open[index - 1] ?? null
      // Visibility is the user's choice: closing the last tab leaves the dock's function list visible.
      return { ...state, open, activeInstanceId: next?.instanceId ?? null }
    }
    case 'activate': {
      const instance = state.open.find(item => item.instanceId === action.instanceId)
      return instance ? activate(state, instance) : state
    }
    case 'setVisible':
      // The dock owns a permanent function list, so it can be visible with nothing open.
      return { ...state, visible: action.visible }
    case 'setWidth':
      return Number.isFinite(action.width) ? { ...state, width: clampPanelWidth(action.width) } : state
  }
}

function readInstance(value: unknown): PanelInstance | null {
  if (!value || typeof value !== 'object') return null
  const candidate = value as Record<string, unknown>
  if (typeof candidate.instanceId !== 'string' || !candidate.instanceId) return null
  if (typeof candidate.panelId !== 'string' || !candidate.panelId) return null
  if (typeof candidate.scopeId !== 'string') return null
  return { instanceId: candidate.instanceId, panelId: candidate.panelId, scopeId: candidate.scopeId }
}

/** Persisted layout is external input: any structural violation falls back to the default layout. */
export function parsePanelLayout(raw: string | null): PanelLayoutState {
  if (!raw) return createDefaultPanelLayout()
  let value: unknown
  try {
    value = JSON.parse(raw)
  } catch {
    return createDefaultPanelLayout()
  }
  if (!value || typeof value !== 'object') return createDefaultPanelLayout()
  const candidate = value as Record<string, unknown>
  if (candidate.version !== PANEL_LAYOUT_VERSION) return createDefaultPanelLayout()
  if (typeof candidate.visible !== 'boolean' || !Array.isArray(candidate.open)) return createDefaultPanelLayout()

  const open: PanelInstance[] = []
  for (const entry of candidate.open) {
    const instance = readInstance(entry)
    if (instance && !open.some(item => item.instanceId === instance.instanceId)) open.push(instance)
  }
  const active = open.find(item => item.instanceId === candidate.activeInstanceId) ?? open[0] ?? null
  const width = typeof candidate.width === 'number' ? clampPanelWidth(candidate.width) : PANEL_WIDTH_DEFAULT
  return {
    version: PANEL_LAYOUT_VERSION,
    visible: candidate.visible,
    width,
    open,
    activeInstanceId: active?.instanceId ?? null,
    lastActive: readInstance(candidate.lastActive) ?? active,
  }
}

export function serializePanelLayout(state: PanelLayoutState): string {
  return JSON.stringify(state)
}

export function readPanelLayout(storage: Pick<Storage, 'getItem'> | undefined): PanelLayoutState {
  if (!storage) return createDefaultPanelLayout()
  try {
    return parsePanelLayout(storage.getItem(PANEL_LAYOUT_STORAGE_KEY))
  } catch {
    return createDefaultPanelLayout()
  }
}

export function savePanelLayout(storage: Pick<Storage, 'setItem'> | undefined, state: PanelLayoutState): boolean {
  if (!storage) return false
  try {
    storage.setItem(PANEL_LAYOUT_STORAGE_KEY, serializePanelLayout(state))
    return true
  } catch {
    return false
  }
}

/** Drops instances whose descriptor no longer exists; keeps the rest of the layout instead of resetting it. */
export function retainKnownPanels(state: PanelLayoutState, isKnown: (panelId: string) => boolean): PanelLayoutState {
  const open = state.open.filter(item => isKnown(item.panelId))
  if (open.length === state.open.length) return state
  const active = open.find(item => item.instanceId === state.activeInstanceId) ?? open[0] ?? null
  return {
    ...state,
    open,
    activeInstanceId: active?.instanceId ?? null,
    visible: state.visible,
    lastActive: state.lastActive && isKnown(state.lastActive.panelId) ? state.lastActive : active,
  }
}

/**
 * Rebinds chat/project-scoped instances after a context switch: every instance keeps its
 * panel but adopts the scope id derived from the current context.
 */
export function rebindPanelScopes(state: PanelLayoutState, scopeIdFor: (panelId: string) => string): PanelLayoutState {
  const rebind = (instance: PanelInstance): PanelInstance => {
    const scopeId = scopeIdFor(instance.panelId)
    return scopeId === instance.scopeId ? instance : { ...instance, scopeId, instanceId: createPanelInstanceId(instance.panelId, scopeId) }
  }
  const open: PanelInstance[] = []
  for (const item of state.open) {
    const next = rebind(item)
    if (!open.some(existing => existing.instanceId === next.instanceId)) open.push(next)
  }
  const unchanged = open.length === state.open.length && open.every((item, index) => item === state.open[index])
  if (unchanged) return state
  const active = open.find(item => item.instanceId === state.activeInstanceId) ?? open[0] ?? null
  const lastActive = state.lastActive ? rebind(state.lastActive) : null
  return {
    ...state,
    open,
    activeInstanceId: active?.instanceId ?? null,
    visible: state.visible,
    lastActive: lastActive ?? active,
  }
}
