import { randomUUID } from 'node:crypto'
import type { PiDisplayEvent, PiProjectedEvent } from '../../../shared/piDisplayEvent.js'

type NativeEvent = Record<string, unknown>

function record(value: unknown): value is NativeEvent {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function boundedCount(value: unknown, max: number): number | undefined {
  return Number.isSafeInteger(value) && typeof value === 'number' && value >= 0 && value <= max
    ? value
    : undefined
}

function trigger(value: unknown): 'manual' | 'threshold' | 'overflow' | undefined {
  return value === 'manual' || value === 'threshold' || value === 'overflow' ? value : undefined
}

export class PiEventProjector {
  private compaction?: PiDisplayEvent & { kind: 'compaction' }
  private retry?: PiDisplayEvent & { kind: 'retry' }
  private closed = false

  constructor(
    private readonly chatId: string,
    private readonly runId: string,
    private readonly emit: (event: PiProjectedEvent) => void,
  ) {}

  accept(chatId: string, runId: string, raw: unknown): void {
    if (this.closed || chatId !== this.chatId || runId !== this.runId || !record(raw)) return
    if (raw.type === 'compaction_start') {
      const reason = trigger(raw.reason)
      if (!reason || this.compaction?.phase === 'started') return
      this.compaction = {
        id: randomUUID(),
        kind: 'compaction',
        phase: 'started',
        trigger: reason,
        at: Date.now(),
      }
      this.publish(this.compaction)
      return
    }
    if (raw.type === 'compaction_end') {
      if (!this.compaction || this.compaction.phase !== 'started') return
      const reason = trigger(raw.reason)
      if (reason !== this.compaction.trigger) return
      const result = record(raw.result) ? raw.result : undefined
      const tokensBefore = boundedCount(result?.tokensBefore, 1_000_000_000)
      this.compaction = {
        ...this.compaction,
        phase:
          raw.aborted === true
            ? 'cancelled'
            : raw.errorMessage
              ? 'failed'
              : result
                ? 'succeeded'
                : 'failed',
        at: Date.now(),
        ...(tokensBefore !== undefined ? { tokensBefore } : {}),
      }
      this.publish(this.compaction)
      return
    }
    if (raw.type === 'auto_retry_start') {
      const attempt = boundedCount(raw.attempt, 20)
      const maxAttempts = boundedCount(raw.maxAttempts, 20)
      if (!attempt || !maxAttempts || attempt > maxAttempts) return
      if (this.retry?.phase === 'started' && attempt <= this.retry.attempt) return
      this.retry = {
        id: this.retry?.phase === 'started' ? this.retry.id : randomUUID(),
        kind: 'retry',
        phase: 'started',
        attempt,
        maxAttempts,
        at: Date.now(),
      }
      this.publish(this.retry)
      return
    }
    if (raw.type === 'auto_retry_end') {
      if (!this.retry || this.retry.phase !== 'started') return
      const attempt = boundedCount(raw.attempt, 20)
      if (!attempt || attempt !== this.retry.attempt || typeof raw.success !== 'boolean') return
      this.retry = {
        ...this.retry,
        phase: raw.success ? 'succeeded' : 'failed',
        at: Date.now(),
      }
      this.publish(this.retry)
    }
  }

  close(): void {
    this.closed = true
  }

  private publish(event: PiDisplayEvent): void {
    this.emit({ chatId: this.chatId, runId: this.runId, id: event.id, event })
  }
}
