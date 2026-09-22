import { useCallback, useEffect, useState } from 'react'
import {
  createPanelInstanceId,
  panelLayoutReducer,
  readPanelLayout,
  rebindPanelScopes,
  retainKnownPanels,
  savePanelLayout,
  type PanelLayoutState,
} from './layout'
import { panelScopeId, type PanelContext, type PanelRegistry } from './registry'
import { detectPanelPlatform, findPanelShortcut, type ShortcutTargetLike } from './shortcuts'

function layoutStorage(): Storage | undefined {
  try {
    return typeof window === 'undefined' ? undefined : window.localStorage
  } catch {
    return undefined
  }
}

export interface PanelLayoutApi {
  layout: PanelLayoutState
  /** Returns false when the panel is unknown or unavailable in the current context. */
  open: (panelId: string) => boolean
  close: (instanceId: string) => void
  activate: (instanceId: string) => void
  setWidth: (width: number) => void
  /** Hides a visible dock, otherwise brings the last used panel back. */
  toggleVisible: () => void
}

export function usePanelLayout(registry: PanelRegistry, context: PanelContext, fallbackPanelId: string): PanelLayoutApi {
  const [layout, setLayout] = useState<PanelLayoutState>(() => retainKnownPanels(readPanelLayout(layoutStorage()), registry.isKnown))
  const { chatId, projectId } = context

  useEffect(() => {
    setLayout(current => rebindPanelScopes(current, panelId => {
      const descriptor = registry.get(panelId)
      return descriptor ? panelScopeId(descriptor, { chatId, projectId }) : ''
    }))
  }, [chatId, projectId, registry])

  useEffect(() => {
    savePanelLayout(layoutStorage(), layout)
  }, [layout])

  const open = useCallback((panelId: string) => {
    const entry = registry.find(panelId, { chatId, projectId })
    if (!entry || !entry.available) return false
    setLayout(current => panelLayoutReducer(current, {
      type: 'open',
      multiplicity: entry.descriptor.multiplicity,
      instance: { instanceId: createPanelInstanceId(panelId, entry.scopeId), panelId, scopeId: entry.scopeId },
    }))
    return true
  }, [registry, chatId, projectId])

  const close = useCallback((instanceId: string) => {
    setLayout(current => panelLayoutReducer(current, { type: 'close', instanceId }))
  }, [])

  const activate = useCallback((instanceId: string) => {
    setLayout(current => panelLayoutReducer(current, { type: 'activate', instanceId }))
  }, [])

  const setWidth = useCallback((width: number) => {
    setLayout(current => panelLayoutReducer(current, { type: 'setWidth', width }))
  }, [])

  const toggleVisible = useCallback(() => {
    if (layout.visible) {
      setLayout(current => panelLayoutReducer(current, { type: 'setVisible', visible: false }))
      return
    }
    const last = layout.lastActive
    if (last && layout.open.some(item => item.instanceId === last.instanceId)) {
      setLayout(current => panelLayoutReducer(current, { type: 'activate', instanceId: last.instanceId }))
      return
    }
    if (!last || !open(last.panelId)) open(fallbackPanelId)
  }, [layout, open, fallbackPanelId])

  return { layout, open, close, activate, setWidth, toggleVisible }
}

export function usePanelShortcuts(
  registry: PanelRegistry,
  context: PanelContext,
  onOpen: (panelId: string) => void,
  platform = detectPanelPlatform(typeof navigator === 'undefined' ? '' : navigator.userAgent),
): void {
  const { chatId, projectId } = context
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      const panelId = findPanelShortcut(
        {
          key: event.key,
          metaKey: event.metaKey,
          ctrlKey: event.ctrlKey,
          shiftKey: event.shiftKey,
          altKey: event.altKey,
          target: event.target as ShortcutTargetLike | null,
        },
        registry.shortcutCandidates({ chatId, projectId }),
        platform,
      )
      if (!panelId) return
      event.preventDefault()
      onOpen(panelId)
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [registry, chatId, projectId, onOpen, platform])
}
