import type { TerminalSessionInfo, TerminalSessionStatus } from '@shared/terminal'
import type { TerminalPhase } from './terminalSession'

export interface TerminalTab {
  sessionId: string
  ordinal: number
  label: string
  phase: TerminalPhase
  truncated: boolean
  droppedBytes: number
  error: string | null
}

export interface TerminalTabsState {
  tabs: TerminalTab[]
  activeSessionId: string | null
}

export function terminalTabLabel(ordinal: number): string {
  return `终端 ${ordinal}`
}

export function phaseForStatus(status: TerminalSessionStatus): TerminalPhase {
  if (status === 'failed') return 'failed'
  if (status === 'exited') return 'exited'
  if (status === 'starting') return 'starting'
  return 'running'
}

export function isLivePhase(phase: TerminalPhase): boolean {
  return phase === 'running' || phase === 'starting'
}

function tabFromInfo(info: TerminalSessionInfo): TerminalTab {
  return {
    sessionId: info.sessionId,
    ordinal: info.ordinal,
    label: terminalTabLabel(info.ordinal),
    phase: phaseForStatus(info.status),
    truncated: false,
    droppedBytes: 0,
    error: info.status === 'failed' ? info.failure : null,
  }
}

export function createTabsState(): TerminalTabsState {
  return { tabs: [], activeSessionId: null }
}

/** Restores the panel after a renderer reload: main still owns the sessions. */
export function adoptSessions(infos: readonly TerminalSessionInfo[]): TerminalTabsState {
  const tabs = [...infos].sort((left, right) => left.ordinal - right.ordinal).map(tabFromInfo)
  return { tabs, activeSessionId: tabs.at(-1)?.sessionId ?? null }
}

export function addTab(state: TerminalTabsState, info: TerminalSessionInfo): TerminalTabsState {
  if (state.tabs.some(tab => tab.sessionId === info.sessionId)) return activateTab(state, info.sessionId)
  return { tabs: [...state.tabs, tabFromInfo(info)], activeSessionId: info.sessionId }
}

/** Closing the active tab activates its right neighbour, then its left one. */
export function removeTab(state: TerminalTabsState, sessionId: string): TerminalTabsState {
  const index = state.tabs.findIndex(tab => tab.sessionId === sessionId)
  if (index < 0) return state
  const tabs = state.tabs.filter(tab => tab.sessionId !== sessionId)
  if (state.activeSessionId !== sessionId) return { ...state, tabs }
  const next = tabs[index] ?? tabs[index - 1] ?? null
  return { tabs, activeSessionId: next?.sessionId ?? null }
}

export function activateTab(state: TerminalTabsState, sessionId: string): TerminalTabsState {
  if (state.activeSessionId === sessionId) return state
  if (!state.tabs.some(tab => tab.sessionId === sessionId)) return state
  return { ...state, activeSessionId: sessionId }
}

export function updateTab(state: TerminalTabsState, sessionId: string, patch: Partial<TerminalTab>): TerminalTabsState {
  const index = state.tabs.findIndex(tab => tab.sessionId === sessionId)
  if (index < 0) return state
  const current = state.tabs[index]
  const next = { ...current, ...patch }
  if (
    next.phase === current.phase &&
    next.truncated === current.truncated &&
    next.droppedBytes === current.droppedBytes &&
    next.error === current.error
  ) {
    return state
  }
  const tabs = [...state.tabs]
  tabs[index] = next
  return { ...state, tabs }
}

/** Only live sessions count against the per-project cap; exited tabs stay readable. */
export function liveTabCount(state: TerminalTabsState): number {
  return state.tabs.filter(tab => isLivePhase(tab.phase)).length
}

export function canCreateTab(state: TerminalTabsState, limit: number): boolean {
  return liveTabCount(state) < limit
}
