import type { Unstable_DirectiveFormatter, Unstable_SlashCommand } from '@assistant-ui/react'
import type { ComposerSlashCommand } from '@shared/contracts'

/** Preserve Pi's literal /skill:name syntax in the outgoing user message. */
export const literalSlashCommandFormatter: Unstable_DirectiveFormatter = {
  serialize: (item) => `/${item.label}`,
  parse: (text) => [{ kind: 'text', text }],
}

export function toSlashCommandDefinitions(
  commands: readonly ComposerSlashCommand[],
  onExecute?: (command: ComposerSlashCommand) => void,
): Unstable_SlashCommand[] {
  return commands.map((command) => ({
    id: command.id,
    label: command.label,
    description: command.description,
    icon: command.icon,
    execute: () => onExecute?.(command),
  }))
}
