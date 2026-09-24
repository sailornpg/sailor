import type { TerminalExit } from '../../shared/terminal.js'

export interface PtySpawnOptions {
  file: string
  args: string[]
  cwd: string
  env: Record<string, string>
  cols: number
  rows: number
  name: string
}

export interface PtyProcess {
  readonly pid: number
  onData(listener: (data: string) => void): () => void
  onExit(listener: (exit: TerminalExit) => void): () => void
  write(data: string): void
  resize(cols: number, rows: number): void
  /**
   * Best-effort signal to the terminal's process group. The shell is spawned as a
   * session leader, so this reaches ordinary jobs; a process that calls `setsid`
   * leaves the group and is explicitly outside Sailor's cleanup guarantee.
   */
  signalGroup(signal: NodeJS.Signals): void
  /** node-pty's own kill; unlike `signalGroup` it also releases the PTY socket. */
  kill(signal?: NodeJS.Signals): void
}

export interface PtyAdapter {
  spawn(options: PtySpawnOptions): PtyProcess
}
