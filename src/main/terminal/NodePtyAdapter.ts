import * as nodePty from 'node-pty'
import type { TerminalExit } from '../../shared/terminal.js'
import type { PtyAdapter, PtyProcess, PtySpawnOptions } from './PtyAdapter.js'

class NodePtyProcess implements PtyProcess {
  constructor(private readonly pty: nodePty.IPty) {}

  get pid(): number {
    return this.pty.pid
  }

  onData(listener: (data: string) => void): () => void {
    const subscription = this.pty.onData(listener)
    return () => subscription.dispose()
  }

  onExit(listener: (exit: TerminalExit) => void): () => void {
    const subscription = this.pty.onExit(event => listener({ code: event.exitCode ?? null, signal: event.signal ?? null }))
    return () => subscription.dispose()
  }

  write(data: string): void {
    this.pty.write(data)
  }

  resize(cols: number, rows: number): void {
    this.pty.resize(cols, rows)
  }

  signalGroup(signal: NodeJS.Signals): void {
    try {
      // node-pty spawns the shell with POSIX_SPAWN_SETSID, so its pid is also the
      // process-group id of the terminal's jobs.
      process.kill(-this.pty.pid, signal)
    } catch {
      // The group may already be gone; the PTY exit event still settles the session.
    }
  }

  kill(signal?: NodeJS.Signals): void {
    this.pty.kill(signal)
  }
}

export function createNodePtyAdapter(): PtyAdapter {
  return {
    spawn(options: PtySpawnOptions): PtyProcess {
      return new NodePtyProcess(nodePty.spawn(options.file, options.args, {
        name: options.name,
        cols: options.cols,
        rows: options.rows,
        cwd: options.cwd,
        env: options.env,
      }))
    },
  }
}
