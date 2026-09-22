export type PanelPlatform = 'mac' | 'other'

export interface PanelShortcut {
  key: string
  /** ⌘ on macOS; maps to Ctrl on other platforms. */
  meta?: boolean
  /** The Control key. On non-macOS it shares Ctrl with `meta`. */
  ctrl?: boolean
  shift?: boolean
  alt?: boolean
}

export interface ShortcutEventLike {
  key: string
  metaKey: boolean
  ctrlKey: boolean
  shiftKey: boolean
  altKey: boolean
}

export interface ShortcutTargetLike {
  tagName?: string
  isContentEditable?: boolean
}

export interface PanelShortcutCandidate {
  id: string
  shortcut: PanelShortcut
  available: boolean
}

export function detectPanelPlatform(userAgent: string): PanelPlatform {
  return /mac|iphone|ipad/i.test(userAgent) ? 'mac' : 'other'
}

export function shortcutSignature(shortcut: PanelShortcut): string {
  const parts = [
    shortcut.meta ? 'meta' : '',
    shortcut.ctrl ? 'ctrl' : '',
    shortcut.alt ? 'alt' : '',
    shortcut.shift ? 'shift' : '',
  ].filter(Boolean)
  return [...parts, shortcut.key.toLowerCase()].join('+')
}

const macSymbols = { ctrl: '⌃', alt: '⌥', shift: '⇧', meta: '⌘' } as const

export function formatShortcut(shortcut: PanelShortcut, platform: PanelPlatform): string {
  const key = shortcut.key.length === 1 ? shortcut.key.toUpperCase() : shortcut.key
  if (platform === 'mac') {
    return `${shortcut.ctrl ? macSymbols.ctrl : ''}${shortcut.alt ? macSymbols.alt : ''}${shortcut.shift ? macSymbols.shift : ''}${shortcut.meta ? macSymbols.meta : ''}${key}`
  }
  const labels = [shortcut.ctrl || shortcut.meta ? 'Ctrl' : '', shortcut.alt ? 'Alt' : '', shortcut.shift ? 'Shift' : ''].filter(Boolean)
  return [...new Set(labels), key].join('+')
}

export function matchesShortcut(event: ShortcutEventLike, shortcut: PanelShortcut, platform: PanelPlatform): boolean {
  const wantsCtrl = platform === 'mac' ? Boolean(shortcut.ctrl) : Boolean(shortcut.ctrl || shortcut.meta)
  if (event.ctrlKey !== wantsCtrl) return false
  if (event.metaKey !== Boolean(platform === 'mac' && shortcut.meta)) return false
  if (event.shiftKey !== Boolean(shortcut.shift)) return false
  if (event.altKey !== Boolean(shortcut.alt)) return false
  return event.key.toLowerCase() === shortcut.key.toLowerCase()
}

export function isEditableTarget(target: ShortcutTargetLike | null | undefined): boolean {
  if (!target) return false
  if (target.isContentEditable) return true
  return ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName ?? '')
}

/**
 * Resolves a key event to a panel id. Editable targets only accept modifier chords
 * (⌘ or ⌃ on macOS, Ctrl elsewhere) so panels never steal plain typing from the composer.
 */
export function findPanelShortcut(
  event: ShortcutEventLike & { target?: ShortcutTargetLike | null },
  candidates: readonly PanelShortcutCandidate[],
  platform: PanelPlatform,
): string | null {
  const commandModifier = platform === 'mac' ? event.metaKey || event.ctrlKey : event.ctrlKey
  if (isEditableTarget(event.target) && !commandModifier) return null
  const match = candidates.find(candidate => candidate.available && matchesShortcut(event, candidate.shortcut, platform))
  return match?.id ?? null
}
