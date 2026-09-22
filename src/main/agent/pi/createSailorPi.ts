import { createPi, type PiHarnessSettings } from '@ai-sdk/harness-pi'
import type { HarnessV1StreamPart } from '@ai-sdk/harness'

export function createSailorPi(settings: PiHarnessSettings): ReturnType<typeof createPi> {
  const harness = createPi(settings)
  const wrapEmit = (emit: (part: HarnessV1StreamPart) => void) => (part: HarnessV1StreamPart) => {
    emit(part)
    // harness-pi 1.0.119 emits post-turn compaction after its final finish-step.
    // Harness maps compaction to a tool step, which must close before finish.
    if (part.type === 'compaction') emit({
      type: 'finish-step',
      finishReason: { unified: 'stop', raw: undefined },
      usage: {
        inputTokens: { total: 0, noCache: 0, cacheRead: 0, cacheWrite: 0 },
        outputTokens: { total: 0, text: 0, reasoning: 0 },
      },
    })
  }
  return {
    ...harness,
    async doStart(options) {
      const session = await harness.doStart(options)
      return {
        ...session,
        doPromptTurn: options => session.doPromptTurn({ ...options, emit: wrapEmit(options.emit) }),
        doContinueTurn: options => session.doContinueTurn({ ...options, emit: wrapEmit(options.emit) }),
      }
    },
  }
}
