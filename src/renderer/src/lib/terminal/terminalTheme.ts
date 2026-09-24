import type { ITheme } from '@xterm/xterm'

export interface TerminalThemeTokens {
  background: string
  foreground: string
  accent: string
  accentForeground: string
}

/**
 * Only the surface follows the app theme; the ANSI palette stays xterm's standard
 * terminal palette, which is the documented expectation for shell output.
 */
export function createTerminalTheme(tokens: TerminalThemeTokens): ITheme {
  return {
    background: tokens.background,
    foreground: tokens.foreground,
    cursor: tokens.foreground,
    cursorAccent: tokens.background,
    selectionBackground: tokens.accent,
    selectionForeground: tokens.accentForeground,
  }
}

export function readTerminalTheme(element: Element): ITheme {
  const styles = getComputedStyle(element)
  const read = (name: string, fallback: string) => styles.getPropertyValue(name).trim() || fallback
  return createTerminalTheme({
    background: read('--background', '#ffffff'),
    foreground: read('--foreground', '#16181d'),
    accent: read('--accent', '#e5e6e3'),
    accentForeground: read('--accent-foreground', '#17191c'),
  })
}
