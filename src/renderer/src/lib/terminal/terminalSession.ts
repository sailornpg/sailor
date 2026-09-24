import type { TerminalApi, TerminalClientEvent, TerminalSessionInfo } from '@shared/terminal'

export type TerminalPhase = 'starting' | 'running' | 'exited' | 'failed'

export interface TerminalViewState {
  phase: TerminalPhase
  info: TerminalSessionInfo | null
  sessionId: string | null
  /** Highest sequence already written to the local terminal. */
  lastSeq: number
  truncated: boolean
  droppedBytes: number
  error: string | null
}

export interface TerminalControllerOptions {
  api: TerminalApi
  projectId: string
  /** Sink for terminal output (the xterm instance). Output never enters React state. */
  write(data: string): void
  /** Clears the local terminal buffer. */
  reset(): void
  onState(state: TerminalViewState): void
}

export interface TerminalController {
  getState(): TerminalViewState
  /** Subscribes, then attaches to an existing session and replays its bounded output. */
  attach(sessionId: string, cols: number, rows: number): Promise<void>
  send(data: string): Promise<void>
  resize(cols: number, rows: number): Promise<void>
  terminate(): Promise<void>
  /** Releases the subscription without touching the process: hiding a tab keeps it alive. */
  dispose(): Promise<void>
}

export function initialTerminalState(): TerminalViewState {
  return { phase: 'starting', info: null, sessionId: null, lastSeq: 0, truncated: false, droppedBytes: 0, error: null }
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

/**
 * Owns one panel tab's view of a main-process terminal session: attach/detach, sequence
 * bookkeeping and the status shown in that tab. The terminal buffer itself stays in
 * xterm; this controller only tracks positions and flags.
 */
export function createTerminalController(options: TerminalControllerOptions): TerminalController {
  let state: TerminalViewState = initialTerminalState()
  let subscriptionId: string | null = null
  let release: (() => void) | null = null
  let requestedSize: { cols: number; rows: number } | null = null
  let disposed = false

  const publish = (patch: Partial<TerminalViewState>) => {
    state = { ...state, ...patch }
    options.onState({ ...state })
  }

  const handleEvent = (payload: { subscriptionId: string; event: TerminalClientEvent }) => {
    if (disposed || payload.subscriptionId !== subscriptionId) return
    const event = payload.event
    if (state.sessionId !== null && state.sessionId !== event.sessionId) return

    if (event.type === 'output') {
      if (event.seq <= state.lastSeq) return
      if (event.seq > state.lastSeq + 1) state.truncated = true
      options.write(event.data)
      publish({ lastSeq: event.seq })
      return
    }
    if (event.type === 'dropped') {
      publish({ truncated: true, droppedBytes: state.droppedBytes + event.bytes })
      return
    }
    publish({
      phase: event.info.status === 'running' ? 'running' : event.info.status === 'failed' ? 'failed' : 'exited',
      info: event.info,
      sessionId: event.info.sessionId,
      error: event.info.status === 'failed' ? event.info.failure : state.error,
    })
  }

  const applySnapshot = (snapshot: { chunks: Array<{ seq: number; data: string }>; nextSeq: number; truncated: boolean }) => {
    for (const chunk of snapshot.chunks) {
      if (chunk.seq <= state.lastSeq) continue
      options.write(chunk.data)
      state.lastSeq = chunk.seq
    }
    // `nextSeq` is the sequence the next live chunk will carry.
    state.lastSeq = Math.max(state.lastSeq, snapshot.nextSeq - 1)
    state.truncated = state.truncated || snapshot.truncated
  }

  const controller: TerminalController = {
    getState: () => ({ ...state }),

    async attach(sessionId, cols, rows) {
      if (disposed) return
      release?.()
      release = options.api.subscribe(handleEvent)
      state.sessionId = sessionId
      publish({ phase: 'starting', sessionId, error: null })
      try {
        const result = await options.api.attach({ projectId: options.projectId, sessionId, sinceSeq: 0 })
        if (disposed) {
          await options.api.detach(result.subscriptionId).catch(() => undefined)
          return
        }
        subscriptionId = result.subscriptionId
        state.lastSeq = 0
        state.truncated = false
        state.droppedBytes = 0
        applySnapshot(result)
        publish({
          phase: result.info.status === 'failed' ? 'failed' : result.info.status === 'exited' ? 'exited' : 'running',
          info: result.info,
          sessionId: result.info.sessionId,
          error: result.info.status === 'failed' ? result.info.failure : null,
        })
        if (result.info.status === 'running') await controller.resize(cols, rows)
      } catch (error) {
        if (disposed) return
        publish({ phase: 'failed', error: `无法附着终端：${messageOf(error)}` })
      }
    },

    async send(data) {
      if (disposed || state.phase !== 'running' || !state.sessionId) return
      await options.api.write({ projectId: options.projectId, sessionId: state.sessionId, data }).catch(() => undefined)
    },

    async resize(cols, rows) {
      if (disposed || state.phase !== 'running' || !state.sessionId) return
      if (requestedSize && requestedSize.cols === cols && requestedSize.rows === rows) return
      requestedSize = { cols, rows }
      await options.api.resize({ projectId: options.projectId, sessionId: state.sessionId, cols, rows }).then(
        info => {
          if (!disposed && state.info && state.info.sessionId === info.sessionId) publish({ info })
        },
        () => {
          requestedSize = null
        },
      )
    },

    async terminate() {
      if (disposed || !state.sessionId) return
      const sessionId = state.sessionId
      await options.api.terminate({ projectId: options.projectId, sessionId }).catch(() => undefined)
      if (disposed || state.sessionId !== sessionId) return
      publish({ phase: 'exited', info: state.info ? { ...state.info, status: 'exited', pid: null } : state.info })
    },

    async dispose() {
      if (disposed) return
      disposed = true
      release?.()
      release = null
      const current = subscriptionId
      subscriptionId = null
      if (current) await options.api.detach(current).catch(() => undefined)
    },
  }

  return controller
}
