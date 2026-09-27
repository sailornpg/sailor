import type { ComposerSlashCommand } from '@shared/contracts'

export interface ComposerDirectiveSelection {
  command: ComposerSlashCommand
  literal: string
  offset: number
}

export interface ComposerDirectiveParts {
  before: string
  directive: string
  after: string
}

/** Build the literal that remains in the prompt after a slash item is selected. */
export function createComposerDirectiveSelection(
  command: ComposerSlashCommand,
  text: string,
): ComposerDirectiveSelection {
  const literal = `/${command.label.replace(/^\//, '')}`
  return {
    command,
    literal,
    offset: text.lastIndexOf(literal),
  }
}

/**
 * Split the current composer text only while the selected literal is still a
 * standalone directive. Hand-edited command text therefore falls back to the
 * normal textarea rendering instead of showing a stale token.
 */
export function getComposerDirectiveParts(
  text: string,
  selection: ComposerDirectiveSelection | undefined,
): ComposerDirectiveParts | undefined {
  if (!selection) return undefined
  const offset = selection.offset >= 0 ? selection.offset : text.indexOf(selection.literal)
  if (offset < 0) return undefined
  const end = offset + selection.literal.length
  if (text.slice(offset, end) !== selection.literal) return undefined
  const next = text[end]
  if (next && !/\s/.test(next)) return undefined
  return {
    before: text.slice(0, offset),
    directive: text.slice(offset, end),
    after: text.slice(end),
  }
}

/** Render a compact, human-readable label while the literal stays unchanged. */
export function formatComposerDirectiveLabel(command: ComposerSlashCommand): string {
  const raw = command.source === 'skill' ? command.label.replace(/^skill:/i, '') : command.label
  return raw
    .split(/[-_:]+/)
    .filter(Boolean)
    .map((part) => `${part.charAt(0).toUpperCase()}${part.slice(1).toLowerCase()}`)
    .join(' ')
}
