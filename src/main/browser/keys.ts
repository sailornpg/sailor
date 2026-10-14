/**
 * 把 `"cmd+a"`、`"Backspace Backspace Delete"`、`"Enter"` 这类按键写法解析成
 * CDP `Input.dispatchKeyEvent` 需要的字段。纯函数，单独测。
 */

/** CDP 的 modifiers 位掩码。 */
export const KEY_MODIFIERS = { alt: 1, ctrl: 2, meta: 4, shift: 8 } as const

export interface ParsedKeyChord {
  key: string
  code: string
  windowsVirtualKeyCode: number
  /** 只有可打印字符且没有 ctrl/meta 时才带 text。 */
  text?: string
  modifiers: number
}

export type ParseKeyResult = { ok: true; chords: ParsedKeyChord[] } | { ok: false; reason: string }

const MODIFIER_ALIASES: Record<string, keyof typeof KEY_MODIFIERS> = {
  alt: 'alt',
  option: 'alt',
  ctrl: 'ctrl',
  control: 'ctrl',
  cmd: 'meta',
  command: 'meta',
  meta: 'meta',
  win: 'meta',
  windows: 'meta',
  super: 'meta',
  shift: 'shift',
}

const NAMED_KEYS: Record<string, { key: string; code: string; keyCode: number }> = {
  enter: { key: 'Enter', code: 'Enter', keyCode: 13 },
  return: { key: 'Enter', code: 'Enter', keyCode: 13 },
  tab: { key: 'Tab', code: 'Tab', keyCode: 9 },
  escape: { key: 'Escape', code: 'Escape', keyCode: 27 },
  esc: { key: 'Escape', code: 'Escape', keyCode: 27 },
  backspace: { key: 'Backspace', code: 'Backspace', keyCode: 8 },
  delete: { key: 'Delete', code: 'Delete', keyCode: 46 },
  space: { key: ' ', code: 'Space', keyCode: 32 },
  up: { key: 'ArrowUp', code: 'ArrowUp', keyCode: 38 },
  arrowup: { key: 'ArrowUp', code: 'ArrowUp', keyCode: 38 },
  down: { key: 'ArrowDown', code: 'ArrowDown', keyCode: 40 },
  arrowdown: { key: 'ArrowDown', code: 'ArrowDown', keyCode: 40 },
  left: { key: 'ArrowLeft', code: 'ArrowLeft', keyCode: 37 },
  arrowleft: { key: 'ArrowLeft', code: 'ArrowLeft', keyCode: 37 },
  right: { key: 'ArrowRight', code: 'ArrowRight', keyCode: 39 },
  arrowright: { key: 'ArrowRight', code: 'ArrowRight', keyCode: 39 },
  home: { key: 'Home', code: 'Home', keyCode: 36 },
  end: { key: 'End', code: 'End', keyCode: 35 },
  pageup: { key: 'PageUp', code: 'PageUp', keyCode: 33 },
  pagedown: { key: 'PageDown', code: 'PageDown', keyCode: 34 },
}

const MAX_CHORDS = 40

export function parseKeyChords(input: string): ParseKeyResult {
  const trimmed = input.trim()
  if (trimmed === '') return { ok: false, reason: '按键序列为空。' }
  const tokens = trimmed.split(/\s+/).filter((token) => token !== '')
  if (tokens.length > MAX_CHORDS)
    return { ok: false, reason: `一次最多发送 ${MAX_CHORDS} 个按键。` }

  const chords: ParsedKeyChord[] = []
  for (const token of tokens) {
    const parts = token.split('+').filter((part) => part !== '')
    if (parts.length === 0) return { ok: false, reason: `无法解析按键 "${token}"。` }
    const base = parts.at(-1) as string
    let modifiers = 0
    for (const part of parts.slice(0, -1)) {
      const normalized = MODIFIER_ALIASES[part.toLowerCase()]
      if (normalized === undefined) {
        return { ok: false, reason: `"${part}" 不是已知的修饰键（cmd/ctrl/alt/shift）。` }
      }
      modifiers |= KEY_MODIFIERS[normalized]
    }

    const lowered = base.toLowerCase()
    const named = NAMED_KEYS[lowered]
    if (named !== undefined) {
      chords.push({
        key: named.key,
        code: named.code,
        windowsVirtualKeyCode: named.keyCode,
        modifiers,
      })
      continue
    }
    const functionKey = /^f([1-9]|1[0-2])$/.exec(lowered)
    if (functionKey !== null) {
      const index = Number(functionKey[1])
      chords.push({
        key: `F${index}`,
        code: `F${index}`,
        windowsVirtualKeyCode: 111 + index,
        modifiers,
      })
      continue
    }
    if ([...base].length !== 1) {
      return { ok: false, reason: `无法解析按键 "${base}"。` }
    }

    const isLetter = /[a-z]/i.test(base) && base !== ' '
    const isDigit = /[0-9]/.test(base)
    const symbolKeyCode = base === ' ' ? 32 : base.toUpperCase().charCodeAt(0)
    const upper = base.toUpperCase()
    const blockedByModifier = (modifiers & (KEY_MODIFIERS.ctrl | KEY_MODIFIERS.meta)) !== 0
    const shifted = (modifiers & KEY_MODIFIERS.shift) !== 0
    chords.push({
      key: shifted ? upper : base,
      code: isLetter ? `Key${upper}` : isDigit ? `Digit${base}` : base === ' ' ? 'Space' : '',
      windowsVirtualKeyCode: isLetter ? upper.charCodeAt(0) : symbolKeyCode,
      ...(blockedByModifier ? {} : { text: shifted ? upper : base }),
      modifiers,
    })
  }
  return { ok: true, chords }
}
