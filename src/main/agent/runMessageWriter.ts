import type { UIMessage } from 'ai'

/**
 * How long a streamed message may wait before it is persisted again. Every save
 * rewrites the whole workspace file, so a run that streams a chunk every few
 * milliseconds must not write once per chunk.
 */
export const RUN_MESSAGE_FLUSH_INTERVAL_MS = 300

/**
 * Persists only the newest streamed message, on an interval instead of once per
 * chunk, and always keeps the last snapshot for a final flush at run end.
 *
 * Intermediate states are superseded before anyone reads them, so dropping them
 * loses nothing; saves stay serialized so a slow disk cannot reorder snapshots.
 */
export class RunMessageWriter {
  private latest: UIMessage | undefined
  private timer: ReturnType<typeof setTimeout> | undefined
  private queue: Promise<void> = Promise.resolve()

  constructor(
    private readonly save: (message: UIMessage) => Promise<void>,
    private readonly intervalMs: number = RUN_MESSAGE_FLUSH_INTERVAL_MS,
  ) {}

  write(message: UIMessage): void {
    this.latest = message
    if (this.timer) return
    this.timer = setTimeout(() => {
      this.timer = undefined
      void this.flush().catch(() => undefined)
    }, this.intervalMs)
    this.timer.unref?.()
  }

  async flush(): Promise<void> {
    if (this.timer) {
      clearTimeout(this.timer)
      this.timer = undefined
    }
    const message = this.latest
    if (!message) return
    this.latest = undefined
    const save = this.queue.then(() => this.save(message))
    this.queue = save.catch(() => undefined)
    await save
  }
}
