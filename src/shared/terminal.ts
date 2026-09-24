/**
 * 用户手动终端的跨进程契约。渲染进程只使用这里的类型与尺寸助手；
 * main 持有全部 PTY 细节，任何可执行路径、argv、cwd、env 都不来自渲染进程。
 */

export const TERMINAL_LIMITS = {
  defaultCols: 80,
  defaultRows: 24,
  minCols: 2,
  maxCols: 500,
  minRows: 1,
  maxRows: 300,
  maxWriteBytes: 64 * 1024,
  maxSessions: 8,
  maxSessionsPerProject: 4,
  maxTrackedSessionsPerProject: 8,
  outputLimitBytes: 256 * 1024,
  subscriberLimitBytes: 256 * 1024,
  flushIntervalMs: 16,
  maxFlushBytes: 64 * 1024,
  exitGraceMs: 1500,
} as const

export type TerminalLimits = { [Key in keyof typeof TERMINAL_LIMITS]: number }

export interface TerminalSizeBounds {
  defaultCols: number
  defaultRows: number
  minCols: number
  maxCols: number
  minRows: number
  maxRows: number
}

export interface TerminalSize {
  cols: number
  rows: number
}

function clampDimension(value: unknown, min: number, max: number, fallback: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return fallback
  return Math.min(max, Math.max(min, Math.round(value)))
}

export function clampTerminalSize(cols: unknown, rows: unknown, bounds: TerminalSizeBounds = TERMINAL_LIMITS): TerminalSize {
  return {
    cols: clampDimension(cols, bounds.minCols, bounds.maxCols, bounds.defaultCols),
    rows: clampDimension(rows, bounds.minRows, bounds.maxRows, bounds.defaultRows),
  }
}

/** Shared by main (limits) and the renderer (input feedback); no Node-only API. */
export function terminalInputBytes(data: string): number {
  return new TextEncoder().encode(data).length
}

export type TerminalSessionStatus = 'starting' | 'running' | 'exited' | 'failed'

export interface TerminalExit {
  code: number | null
  signal: number | null
}

export interface TerminalSessionInfo {
  projectId: string
  sessionId: string
  /** Creation order inside one project; stable across renderer reloads, used for tab names. */
  ordinal: number
  status: TerminalSessionStatus
  /** Basename of the shell that was actually started, for display only. */
  shell: string
  pid: number | null
  cols: number
  rows: number
  exit: TerminalExit | null
  failure: string | null
}

export type TerminalEvent =
  | { type: 'output'; projectId: string; sessionId: string; seq: number; data: string }
  | { type: 'state'; projectId: string; sessionId: string; info: TerminalSessionInfo }

/** `create` spawns a new shell for the project; the panel keeps one tab per returned session. */
export interface TerminalOpenInput {
  projectId: string
  cols: number
  rows: number
}

export interface TerminalListInput {
  projectId: string
}

export interface TerminalSessionInput {
  projectId: string
  sessionId: string
}

export interface TerminalWriteInput extends TerminalSessionInput {
  data: string
}

export interface TerminalResizeInput extends TerminalSessionInput {
  cols: number
  rows: number
}

export interface TerminalOutputChunk {
  seq: number
  data: string
}

/** Bounded replay window: `truncated` means the renderer lost data before `chunks`. */
export interface TerminalOutputSnapshot {
  chunks: TerminalOutputChunk[]
  nextSeq: number
  truncated: boolean
}

/** Out-of-band notice that main dropped output the subscriber could not keep up with. */
export interface TerminalDroppedEvent {
  type: 'dropped'
  projectId: string
  sessionId: string
  bytes: number
}

export type TerminalClientEvent = TerminalEvent | TerminalDroppedEvent

export interface TerminalAttachInput extends TerminalSessionInput {
  /** Last sequence already applied by the renderer; only newer chunks are replayed. */
  sinceSeq?: number
}

export interface TerminalAttachResult extends TerminalOutputSnapshot {
  subscriptionId: string
  info: TerminalSessionInfo
}

/** Events are pushed per subscription so main can route and bound them per renderer. */
export interface TerminalIpcEvent {
  subscriptionId: string
  event: TerminalClientEvent
}

export interface TerminalApi {
  create(input: TerminalOpenInput): Promise<TerminalSessionInfo>
  list(input: TerminalListInput): Promise<TerminalSessionInfo[]>
  attach(input: TerminalAttachInput): Promise<TerminalAttachResult>
  detach(subscriptionId: string): Promise<void>
  write(input: TerminalWriteInput): Promise<void>
  resize(input: TerminalResizeInput): Promise<TerminalSessionInfo>
  terminate(input: TerminalSessionInput): Promise<void>
  subscribe(listener: (event: TerminalIpcEvent) => void): () => void
}
