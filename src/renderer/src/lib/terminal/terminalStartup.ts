import { TERMINAL_LIMITS, type TerminalApi, type TerminalSessionInfo } from '@shared/terminal'

/**
 * Opening the panel should hand the user a working terminal, but only the first one:
 * a project that already has sessions (including exited tabs) is restored as-is.
 */
export function needsAutoStart(infos: readonly TerminalSessionInfo[]): boolean {
  return infos.length === 0
}

// One in-flight create per project: React StrictMode remounts effects and the dock can
// re-render while the first PTY is still spawning, which must not create two shells.
const pendingStarts = new Map<string, Promise<TerminalSessionInfo>>()

export function startFirstSession(api: Pick<TerminalApi, 'create'>, projectId: string): Promise<TerminalSessionInfo> {
  const pending = pendingStarts.get(projectId)
  if (pending) return pending

  const started = api
    .create({ projectId, cols: TERMINAL_LIMITS.defaultCols, rows: TERMINAL_LIMITS.defaultRows })
    .finally(() => {
      if (pendingStarts.get(projectId) === started) pendingStarts.delete(projectId)
    })
  pendingStarts.set(projectId, started)
  return started
}
