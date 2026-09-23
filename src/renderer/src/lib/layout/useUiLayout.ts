import { useCallback, useEffect, useState } from 'react'
import {
  readUiLayout,
  saveUiLayout,
  uiLayoutReducer,
  type UiLayoutState,
} from './uiLayout'
import { detectPanelPlatform, isEditableTarget, matchesShortcut } from '@/lib/panels/shortcuts'

/** ⌘B on macOS, Ctrl+B elsewhere — the chord Codex uses to toggle its sidebar. */
export const SIDEBAR_TOGGLE_SHORTCUT = { key: 'b', meta: true }

function layoutStorage(): Storage | undefined {
  try {
    return typeof window === 'undefined' ? undefined : window.localStorage
  } catch {
    return undefined
  }
}

export interface UiLayoutApi {
  layout: UiLayoutState
  setLeftWidth: (width: number) => void
  setLeftCollapsed: (collapsed: boolean) => void
  toggleLeftCollapsed: () => void
}

export function useUiLayout(): UiLayoutApi {
  const [layout, setLayout] = useState<UiLayoutState>(() => readUiLayout(layoutStorage()))

  useEffect(() => {
    saveUiLayout(layoutStorage(), layout)
  }, [layout])

  const setLeftWidth = useCallback((width: number) => {
    setLayout(current => uiLayoutReducer(current, { type: 'setLeftWidth', width }))
  }, [])

  const setLeftCollapsed = useCallback((collapsed: boolean) => {
    setLayout(current => uiLayoutReducer(current, { type: 'setLeftCollapsed', collapsed }))
  }, [])

  const toggleLeftCollapsed = useCallback(() => {
    setLayout(current => uiLayoutReducer(current, { type: 'setLeftCollapsed', collapsed: !current.leftCollapsed }))
  }, [])

  useEffect(() => {
    const platform = detectPanelPlatform(typeof navigator === 'undefined' ? '' : navigator.userAgent)
    const handleKeyDown = (event: KeyboardEvent) => {
      if (!matchesShortcut(event, SIDEBAR_TOGGLE_SHORTCUT, platform)) return
      // Focus inside the composer keeps its own editing semantics; the sidebar never steals that chord.
      if (isEditableTarget(event.target as { tagName?: string; isContentEditable?: boolean } | null)) return
      event.preventDefault()
      setLayout(current => uiLayoutReducer(current, { type: 'setLeftCollapsed', collapsed: !current.leftCollapsed }))
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [])

  return { layout, setLeftWidth, setLeftCollapsed, toggleLeftCollapsed }
}
