import { posix, win32 } from 'node:path'

/** A PTY name/TERM value every interactive program in the panel can rely on. */
export const TERMINAL_NAME = 'xterm-256color'

const LOGIN_SHELLS = new Set(['bash', 'zsh', 'fish', 'ksh'])

/**
 * Use the user's shell for the host platform. Only known POSIX shells receive
 * login arguments; the portable sh fallback and Windows cmd need none.
 */
export function resolveShell(
  env: { SHELL?: string; ComSpec?: string; COMSPEC?: string },
  platform: NodeJS.Platform = process.platform,
): { file: string; args: string[] } {
  if (platform === 'win32') {
    const windowsShell = env.ComSpec ?? env.COMSPEC
    const configured = typeof windowsShell === 'string' ? windowsShell.trim() : ''
    return { file: configured && win32.isAbsolute(configured) ? configured : 'cmd.exe', args: [] }
  }

  const configured = typeof env.SHELL === 'string' ? env.SHELL.trim() : ''
  const file = configured && posix.isAbsolute(configured) ? configured : '/bin/sh'
  return { file, args: LOGIN_SHELLS.has(posix.basename(file).toLowerCase()) ? ['-l'] : [] }
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
