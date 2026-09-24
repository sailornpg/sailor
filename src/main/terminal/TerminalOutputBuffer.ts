import { terminalInputBytes, type TerminalOutputChunk, type TerminalOutputSnapshot } from '../../shared/terminal.js'

export type TerminalSchedule = (callback: () => void, ms: number) => () => void

const defaultSchedule: TerminalSchedule = (callback, ms) => {
  const timer = setTimeout(callback, ms)
  return () => clearTimeout(timer)
}

export interface TerminalOutputBufferOptions {
  outputLimitBytes: number
  flushIntervalMs: number
  maxFlushBytes: number
  onChunk(chunk: TerminalOutputChunk): void
  schedule?: TerminalSchedule
}

/**
 * Per-session output cache. PTY data is coalesced into sequence-numbered chunks on a
 * short flush window, and only the newest `outputLimitBytes` stay in the ring used
 * for replay. Nothing here is written to disk or sent anywhere but the panel.
 */
export class TerminalOutputBuffer {
  private pending = ''
  private pendingSize = 0
  private seq = 0
  private readonly chunks: TerminalOutputChunk[] = []
  private retainedBytes = 0
  private cancelFlush: (() => void) | null = null
  private disposed = false

  constructor(private readonly options: TerminalOutputBufferOptions) {}

  get bufferedBytes(): number {
    return this.retainedBytes
  }

  get pendingBytes(): number {
    return this.pendingSize
  }

  push(data: string): void {
    if (this.disposed || !data) return
    this.pending += data
    this.pendingSize += terminalInputBytes(data)
    if (this.pendingSize >= this.options.maxFlushBytes) this.flush()
    else this.scheduleFlush()
  }

  /** Drains pending data now, so tail output reaches the renderer before an exit state. */
  flush(): void {
    this.cancelScheduledFlush()
    if (!this.pending) return
    const chunk: TerminalOutputChunk = { seq: (this.seq += 1), data: this.pending }
    this.pending = ''
    this.pendingSize = 0
    this.append(chunk)
    this.options.onChunk(chunk)
  }

  snapshot(sinceSeq = 0): TerminalOutputSnapshot {
    const since = Number.isFinite(sinceSeq) ? Math.max(0, Math.floor(sinceSeq)) : 0
    const chunks = this.chunks.filter(chunk => chunk.seq > since).map(chunk => ({ ...chunk }))
    const truncated = since < this.seq && (chunks.length === 0 || chunks[0].seq > since + 1)
    return { chunks, nextSeq: this.seq + 1, truncated }
  }

  dispose(): void {
    this.disposed = true
    this.cancelScheduledFlush()
  }

  private append(chunk: TerminalOutputChunk): void {
    this.chunks.push(chunk)
    this.retainedBytes += terminalInputBytes(chunk.data)
    // Keep at least one chunk so a single oversized flush still shows something.
    while (this.chunks.length > 1 && this.retainedBytes > this.options.outputLimitBytes) {
      const removed = this.chunks.shift()
      if (!removed) break
      this.retainedBytes -= terminalInputBytes(removed.data)
    }
  }

  private scheduleFlush(): void {
    // Coalesce: one pending flush is enough for any amount of data in the window.
    this.cancelFlush ??= (this.options.schedule ?? defaultSchedule)(() => {
      this.cancelFlush = null
      this.flush()
    }, this.options.flushIntervalMs)
  }

  private cancelScheduledFlush(): void {
    this.cancelFlush?.()
    this.cancelFlush = null
  }
}

export interface TerminalSubscriberQueueOptions {
  limitBytes: number
  deliver(chunks: TerminalOutputChunk[], droppedBytes: number): void
  schedule?: TerminalSchedule
  flushDelayMs?: number
}

/**
 * Per-subscriber pending budget. A renderer that cannot keep up loses the oldest
 * queued output and receives one explicit truncation notice, so main's memory stays
 * bounded instead of growing with the producer.
 */
export class TerminalSubscriberQueue {
  private queue: TerminalOutputChunk[] = []
  private queuedBytes = 0
  private droppedBytes = 0
  private cancelDelivery: (() => void) | null = null
  private disposed = false

  constructor(private readonly options: TerminalSubscriberQueueOptions) {}

  enqueue(chunk: TerminalOutputChunk): void {
    if (this.disposed) return
    this.queue.push(chunk)
    this.queuedBytes += terminalInputBytes(chunk.data)
    while (this.queue.length > 0 && this.queuedBytes > this.options.limitBytes) {
      const removed = this.queue.shift()
      if (!removed) break
      const bytes = terminalInputBytes(removed.data)
      this.queuedBytes -= bytes
      this.droppedBytes += bytes
    }
    this.cancelDelivery ??= (this.options.schedule ?? defaultSchedule)(() => {
      this.cancelDelivery = null
      this.flush()
    }, this.options.flushDelayMs ?? 0)
  }

  /** Drains queued output in order; drops are reported once per drain. */
  flush(): void {
    this.cancelScheduledDelivery()
    if (this.disposed) return
    if (this.queue.length === 0 && this.droppedBytes === 0) return
    const chunks = this.queue
    const droppedBytes = this.droppedBytes
    this.queue = []
    this.queuedBytes = 0
    this.droppedBytes = 0
    this.options.deliver(chunks, droppedBytes)
  }

  dispose(): void {
    this.disposed = true
    this.cancelScheduledDelivery()
    this.queue = []
    this.queuedBytes = 0
    this.droppedBytes = 0
  }

  private cancelScheduledDelivery(): void {
    this.cancelDelivery?.()
    this.cancelDelivery = null
  }
}
