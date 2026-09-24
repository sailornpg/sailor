import { isAbsolute } from 'node:path'

/** A PTY name/TERM value every interactive program in the panel can rely on. */
export const TERMINAL_NAME = 'xterm-256color'

const FALLBACK_SHELL = '/bin/zsh'
const LOGIN_ARGS = ['-l'] as const

/**
 * The terminal belongs to the user, so it starts their login shell. A relative or
 * empty `$SHELL` is not executable, so it falls back to the macOS default.
 */
export function resolveShell(env: { SHELL?: string }): { file: string; args: string[] } {
  const configured = typeof env.SHELL === 'string' ? env.SHELL.trim() : ''
  return { file: configured && isAbsolute(configured) ? configured : FALLBACK_SHELL, args: [...LOGIN_ARGS] }
}

/**
 * A terminal must see the user's own environment to be usable, but Electron and
 * Node injection variables would make child processes misbehave. Sailor never puts
 * provider credentials in the environment, so nothing app-specific is stripped here.
 */
export function buildTerminalEnv(base: NodeJS.ProcessEnv): Record<string, string> {
  const env: Record<string, string> = {}
  for (const [key, value] of Object.entries(base)) {
    if (typeof value !== 'string') continue
    if (key.startsWith('ELECTRON_') || key === 'NODE_OPTIONS' || key === 'NODE_ENV') continue
    env[key] = value
  }
  env.TERM = TERMINAL_NAME
  env.COLORTERM = 'truecolor'
  return env
}
