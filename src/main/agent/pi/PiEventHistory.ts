import type { UIMessageChunk } from 'ai'
import type { PiDisplayEvent, PiProjectedEvent } from '../../../shared/piDisplayEvent.js'

export class PiEventHistory {
  private readonly latest = new Map<string, PiProjectedEvent>()

  constructor(private readonly emitLive: (event: PiProjectedEvent) => void) {}

  accept(event: PiProjectedEvent): void {
    const previous = this.latest.get(event.id)
    if (previous && previous.event.phase !== 'started') return
    if (previous && event.event.phase === 'started' && event.event.kind !== 'retry') return
    if (
      previous &&
      event.event.phase === 'started' &&
      event.event.kind === 'retry' &&
      previous.event.kind === 'retry' &&
      event.event.attempt <= previous.event.attempt
    )
      return
    this.latest.set(event.id, event)
    if (event.event.phase === 'started') this.emitLive(event)
  }

  hasCompaction(): boolean {
    return [...this.latest.values()].some(({ event }) => event.kind === 'compaction')
  }

  async commitAfter(checkpoint: () => Promise<void>): Promise<UIMessageChunk[]> {
    try {
      await checkpoint()
    } catch (error) {
      this.finishLive('failed', true)
      throw error
    }
    return this.finishLive('cancelled').map(({ event }) => ({
      type: 'data-pi-event' as const,
      data: event,
    }))
  }

  failUncommitted(): void {
    this.finishLive('failed', true)
  }

  markFailed(): void {
    for (const [id, projected] of this.latest)
      this.latest.set(id, {
        ...projected,
        event: { ...projected.event, phase: 'failed', at: Date.now() },
      })
  }

  private finishLive(unfinishedPhase: 'failed' | 'cancelled', force = false): PiProjectedEvent[] {
    const finished = [...this.latest.values()].map((projected) => {
      const event: PiDisplayEvent =
        force || projected.event.phase === 'started'
          ? { ...projected.event, phase: unfinishedPhase, at: Date.now() }
          : projected.event
      return { ...projected, event }
    })
    this.latest.clear()
    for (const event of finished) this.emitLive(event)
    return finished
  }
}
