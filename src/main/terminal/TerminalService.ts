import { randomUUID } from 'node:crypto'
import { basename } from 'node:path'
import {
  TERMINAL_LIMITS,
  clampTerminalSize,
  terminalInputBytes,
  type TerminalEvent,
  type TerminalExit,
  type TerminalLimits,
  type TerminalOutputSnapshot,
  type TerminalSessionInfo,
  type TerminalSessionStatus,
  type TerminalSize,
} from '../../shared/terminal.js'
import { TERMINAL_NAME, buildTerminalEnv, resolveShell } from './TerminalShell.js'
import { TerminalOutputBuffer, type TerminalSchedule } from './TerminalOutputBuffer.js'
import type { PtyAdapter, PtyProcess } from './PtyAdapter.js'

export type TerminalErrorCode =
  | 'WORKSPACE_UNAVAILABLE'
  | 'SESSION_NOT_FOUND'
  | 'SESSION_EXITED'
  | 'SESSION_LIMIT'
  | 'INVALID_INPUT'
  | 'UNTRUSTED_SENDER'

export class TerminalError extends Error {
  readonly code: TerminalErrorCode

  constructor(code: TerminalErrorCode, message: string) {
    super(message)
    this.name = 'TerminalError'
    this.code = code
  }
}

export interface TerminalServiceOptions {
  /** Resolves a renderer-supplied projectId to the canonical root owned by main. */
  resolveProjectRoot(projectId: string): Promise<string>
  adapter: PtyAdapter
  env?: NodeJS.ProcessEnv
  limits?: Partial<TerminalLimits>
  generateSessionId?: () => string
  now?: () => number
  /** Injectable timer for deterministic output batching. */
  schedule?: TerminalSchedule
}

interface TerminalSession {
  projectId: string
  sessionId: string
  ordinal: number
  status: TerminalSessionStatus
  shell: string
  cols: number
  rows: number
  pid: number | null
  exit: TerminalExit | null
  failure: string | null
  process: PtyProcess | null
  release: Array<() => void>
  output: TerminalOutputBuffer
  /** Monotonic LRU tick; a wall clock can tie two sessions inside one millisecond. */
  lastActiveTick: number
  /** No longer live: exited, failed to spawn, or evicted. */
  ended: boolean
}

const SESSION_POLL_MS = 5
const MAX_ID_LENGTH = 200

function describeError(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

function delay(ms: number): Promise<void> {
  return new Promise(resolve => {
    setTimeout(resolve, ms)
  })
}

/**
 * Owns every interactive terminal. One project can hold several live sessions (one per
 * panel tab); a session keeps running while the renderer is detached, and only an explicit
 * `terminate` (or app quit / the global LRU cap) ends its process.
 */
export class TerminalService {
  private readonly limits: TerminalLimits
  private readonly env: NodeJS.ProcessEnv
  private readonly sessions = new Map<string, TerminalSession>()
  private readonly ordinals = new Map<string, number>()
  private activityTick = 0
  private readonly listeners = new Set<(event: TerminalEvent) => void>()
  private disposed = false

  constructor(private readonly options: TerminalServiceOptions) {
    this.limits = { ...TERMINAL_LIMITS, ...options.limits }
    this.env = options.env ?? process.env
  }

  /** Creates a new PTY session. Renderer input cannot influence the command. */
  async create(projectId: string, size: Partial<TerminalSize> = {}): Promise<TerminalSessionInfo> {
    const id = this.requireProjectId(projectId)
    if (this.disposed) throw new TerminalError('WORKSPACE_UNAVAILABLE', '终端服务已关闭。')

    let rootPath: string
    try {
      rootPath = await this.options.resolveProjectRoot(id)
    } catch (error) {
      throw new TerminalError('WORKSPACE_UNAVAILABLE', `无法打开工作区目录：${describeError(error)}`)
    }

    this.enforceProjectLimits(id)
    await this.evictOverGlobalLimit()

    const { cols, rows } = clampTerminalSize(size.cols, size.rows, this.limits)
    const shell = resolveShell(this.env)
    const ordinal = (this.ordinals.get(id) ?? 0) + 1
    this.ordinals.set(id, ordinal)

    const session: TerminalSession = {
      projectId: id,
      sessionId: this.options.generateSessionId?.() ?? randomUUID(),
      ordinal,
      status: 'starting',
      shell: basename(shell.file),
      cols,
      rows,
      pid: null,
      exit: null,
      failure: null,
      process: null,
      release: [],
      output: new TerminalOutputBuffer({
        outputLimitBytes: this.limits.outputLimitBytes,
        flushIntervalMs: this.limits.flushIntervalMs,
        maxFlushBytes: this.limits.maxFlushBytes,
        onChunk: chunk => {
          this.emit({ type: 'output', projectId: id, sessionId: session.sessionId, seq: chunk.seq, data: chunk.data })
        },
        schedule: this.options.schedule,
      }),
      lastActiveTick: (this.activityTick += 1),
      ended: false,
    }

    try {
      const process = this.options.adapter.spawn({
        file: shell.file,
        args: shell.args,
        cwd: rootPath,
        env: buildTerminalEnv(this.env),
        cols,
        rows,
        name: TERMINAL_NAME,
      })
      session.process = process
      session.pid = process.pid
      session.status = 'running'
      session.release.push(process.onData(data => this.handleData(session, data)))
      session.release.push(process.onExit(exit => this.handleExit(session, exit)))
    } catch (error) {
      session.status = 'failed'
      session.ended = true
      session.failure = `无法启动终端：${describeError(error)}`
    }

    this.sessions.set(session.sessionId, session)
    this.emit({ type: 'state', projectId: id, sessionId: session.sessionId, info: this.info(session) })
    return this.info(session)
  }

  /** Creation order per project; ended sessions stay listed so their tab keeps its output. */
  list(projectId?: string): TerminalSessionInfo[] {
    const scoped = projectId === undefined
      ? [...this.sessions.values()]
      : [...this.sessions.values()].filter(session => session.projectId === projectId)
    return scoped.map(session => this.info(session))
  }

  find(projectId: string, sessionId: string): TerminalSessionInfo | null {
    const session = typeof projectId === 'string' && typeof sessionId === 'string' ? this.sessions.get(sessionId) : undefined
    return session && session.projectId === projectId ? this.info(session) : null
  }

  /** Keeps a session at the front of the LRU order when the renderer attaches to it. */
  markActive(projectId: string, sessionId: string): void {
    const session = this.liveSession(projectId, sessionId)
    if (session) this.touch(session)
  }

  async write(projectId: string, sessionId: string, data: string): Promise<void> {
    const session = this.requireLiveSession(projectId, sessionId, 'SESSION_EXITED')
    if (typeof data !== 'string') throw new TerminalError('INVALID_INPUT', '终端输入必须是字符串。')
    if (data.length === 0) return
    if (terminalInputBytes(data) > this.limits.maxWriteBytes) {
      throw new TerminalError('INVALID_INPUT', `单次终端输入不能超过 ${this.limits.maxWriteBytes} 字节。`)
    }
    session.process?.write(data)
    this.touch(session)
  }

  async resize(projectId: string, sessionId: string, cols: number, rows: number): Promise<TerminalSessionInfo> {
    const session = this.requireLiveSession(projectId, sessionId, 'SESSION_EXITED')
    const size = clampTerminalSize(cols, rows, this.limits)
    session.cols = size.cols
    session.rows = size.rows
    session.process?.resize(size.cols, size.rows)
    this.touch(session)
    this.emit({ type: 'state', projectId: session.projectId, sessionId: session.sessionId, info: this.info(session) })
    return this.info(session)
  }

  /**
   * Explicit stop used by the panel's tab close button: `SIGHUP` to the process group,
   * `SIGKILL` after the grace period, then the record is dropped.
   */
  async terminate(projectId: string, sessionId: string): Promise<void> {
    const session = this.requireSession(projectId, sessionId)
    if (!session.ended) await this.stopSession(session)
    this.releaseSession(session)
    this.sessions.delete(session.sessionId)
  }

  /** Bounded replay for a renderer that attaches or re-attaches to a session. */
  outputSnapshot(projectId: string, sessionId: string, sinceSeq = 0): TerminalOutputSnapshot {
    return this.requireSession(projectId, sessionId).output.snapshot(sinceSeq)
  }

  /** App-quit path: every session is stopped and its PTY listeners are released. */
  async disposeAll(): Promise<void> {
    this.disposed = true
    const sessions = [...this.sessions.values()]
    await Promise.all(sessions.filter(session => !session.ended).map(session => this.stopSession(session).catch(() => undefined)))
    for (const session of sessions) this.releaseSession(session)
    this.sessions.clear()
    this.ordinals.clear()
    this.listeners.clear()
  }

  subscribe(listener: (event: TerminalEvent) => void): () => void {
    this.listeners.add(listener)
    return () => {
      this.listeners.delete(listener)
    }
  }

  private async stopSession(session: TerminalSession): Promise<void> {
    if (session.ended) return
    const process = session.process
    if (!process) {
      this.endSession(session, session.exit ?? { code: null, signal: null })
      return
    }

    try {
      process.signalGroup('SIGHUP')
    } catch {
      // The process group may already be gone; the exit event decides the final state.
    }
    await this.waitForExit(session, this.limits.exitGraceMs)
    if (!session.ended) {
      try {
        process.signalGroup('SIGKILL')
      } catch {
        // Best effort only; `kill` below is what releases the PTY.
      }
      try {
        process.kill('SIGKILL')
      } catch {
        this.endSession(session, { code: null, signal: 9 })
      }
    }
    this.endSession(session, session.exit ?? { code: null, signal: 9 })
  }

  private handleData(session: TerminalSession, data: string): void {
    if (this.disposed || session.ended || typeof data !== 'string' || data.length === 0) return
    session.output.push(data)
  }

  private handleExit(session: TerminalSession, exit: TerminalExit): void {
    if (session.ended) return
    // The shell's last bytes must reach the renderer before the exit state.
    session.output.flush()
    session.exit = { code: exit.code ?? null, signal: exit.signal ?? null }
    this.endSession(session, session.exit)
  }

  private endSession(session: TerminalSession, exit: TerminalExit): void {
    if (session.ended) return
    session.output.flush()
    session.ended = true
    session.status = 'exited'
    session.exit = exit
    session.process = null
    this.releaseSession(session)
    this.emit({ type: 'state', projectId: session.projectId, sessionId: session.sessionId, info: this.info(session) })
  }

  private releaseSession(session: TerminalSession): void {
    for (const release of session.release.splice(0)) {
      try {
        release()
      } catch {
        // Releasing a PTY listener must never block cleanup.
      }
    }
    session.output.dispose()
  }

  private async waitForExit(session: TerminalSession, timeoutMs: number): Promise<void> {
    const deadline = this.now() + Math.max(0, timeoutMs)
    while (!session.ended && this.now() < deadline) await delay(SESSION_POLL_MS)
  }

  /** Per-project live cap plus a bounded number of retained exited tabs. */
  private enforceProjectLimits(projectId: string): void {
    const tracked = [...this.sessions.values()].filter(session => session.projectId === projectId)
    const live = tracked.filter(session => !session.ended).length
    if (live >= this.limits.maxSessionsPerProject) {
      throw new TerminalError('SESSION_LIMIT', `每个工作区最多同时打开 ${this.limits.maxSessionsPerProject} 个终端。`)
    }
    while (tracked.length + 1 > this.limits.maxTrackedSessionsPerProject) {
      const victim = tracked.find(session => session.ended)
      if (!victim) return
      tracked.splice(tracked.indexOf(victim), 1)
      this.releaseSession(victim)
      this.sessions.delete(victim.sessionId)
    }
  }

  /** Keeps the number of live PTYs bounded by recycling the least recently used session. */
  private async evictOverGlobalLimit(): Promise<void> {
    while (this.liveSessions().length >= this.limits.maxSessions) {
      const victim = this.liveSessions().reduce((oldest, candidate) => (candidate.lastActiveTick < oldest.lastActiveTick ? candidate : oldest))
      await this.stopSession(victim).catch(() => undefined)
      this.releaseSession(victim)
      this.sessions.delete(victim.sessionId)
    }
  }

  private liveSessions(): TerminalSession[] {
    return [...this.sessions.values()].filter(session => !session.ended)
  }

  private liveSession(projectId: string, sessionId: string): TerminalSession | null {
    const session = this.sessions.get(sessionId)
    return session && session.projectId === projectId && !session.ended ? session : null
  }

  private requireSession(projectId: string, sessionId: string): TerminalSession {
    const session = typeof sessionId === 'string' ? this.sessions.get(sessionId) : undefined
    if (!session || session.projectId !== projectId) {
      throw new TerminalError('SESSION_NOT_FOUND', '终端会话不存在或不属于当前工作区。')
    }
    return session
  }

  private requireLiveSession(projectId: string, sessionId: string, code: TerminalErrorCode): TerminalSession {
    const session = this.requireSession(projectId, sessionId)
    if (session.ended || session.status !== 'running') {
      throw new TerminalError(code, '终端会话已经结束，请重新启动。')
    }
    return session
  }

  private requireProjectId(projectId: unknown): string {
    if (typeof projectId !== 'string' || !projectId.trim() || projectId.length > MAX_ID_LENGTH) {
      throw new TerminalError('INVALID_INPUT', '终端请求缺少有效的工作区标识。')
    }
    return projectId
  }

  private touch(session: TerminalSession): void {
    session.lastActiveTick = (this.activityTick += 1)
  }

  private now(): number {
    return this.options.now?.() ?? Date.now()
  }

  private info(session: TerminalSession): TerminalSessionInfo {
    return {
      projectId: session.projectId,
      sessionId: session.sessionId,
      ordinal: session.ordinal,
      status: session.status,
      shell: session.shell,
      pid: session.pid,
      cols: session.cols,
      rows: session.rows,
      exit: session.exit ? { ...session.exit } : null,
      failure: session.failure,
    }
  }

  private emit(event: TerminalEvent): void {
    for (const listener of [...this.listeners]) {
      try {
        listener(event)
      } catch {
        // One failing subscriber must not break PTY bookkeeping.
      }
    }
  }
}
