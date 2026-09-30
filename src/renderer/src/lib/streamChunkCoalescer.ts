import type { UIMessageChunk } from 'ai'

/**
 * How long streamed text may be buffered before it is handed to the runtime.
 *
 * A provider delta arrives every few milliseconds; forwarding each one makes
 * React commit (and re-measure the composer, re-format the context rail and
 * re-parse markdown) per token, which saturates the main thread and stalls the
 * window. Coalescing keeps the runtime's update rate near frame rate while the
 * markdown renderer's smooth reveal still animates every frame.
 */
export const FLUSH_INTERVAL_MS = 60

const isDelta = (
  chunk: UIMessageChunk,
): chunk is Extract<UIMessageChunk, { type: 'text-delta' | 'reasoning-delta' }> =>
  chunk.type === 'text-delta' || chunk.type === 'reasoning-delta'

type DeltaKind = 'text' | 'reasoning' | 'tool-input'

/**
 * Merges consecutive text/reasoning/tool-input deltas into one chunk per flush.
 *
 * Tool input matters as much as text: a `write` streams a whole file as
 * `tool-input-delta`, and the runtime re-parses the accumulated JSON on every
 * one of them, so a large file costs O(size²) unless the deltas are merged.
 *
 * Anything that is not a plain delta — and any delta carrying provider metadata
 * — flushes first so ordering and metadata survive untouched.
 */
export class StreamChunkCoalescer {
  private kind: DeltaKind | null = null
  private id = ''
  private text = ''

  push(chunk: UIMessageChunk): UIMessageChunk[] {
    if (chunk.type === 'tool-input-delta') {
      const emitted = this.kind === 'tool-input' && chunk.toolCallId === this.id ? [] : this.flush()
      this.kind = 'tool-input'
      this.id = chunk.toolCallId
      this.text += chunk.inputTextDelta
      return emitted
    }

    if (!isDelta(chunk) || chunk.providerMetadata != null) return [...this.flush(), chunk]

    const kind = chunk.type === 'text-delta' ? 'text' : 'reasoning'
    const emitted = kind === this.kind && chunk.id === this.id ? [] : this.flush()
    this.kind = kind
    this.id = chunk.id
    this.text += chunk.delta
    return emitted
  }

  flush(): UIMessageChunk[] {
    if (this.kind === null || this.text === '') return []
    const kind = this.kind
    const id = this.id
    const text = this.text
    this.kind = null
    this.id = ''
    this.text = ''
    if (kind === 'tool-input')
      return [{ type: 'tool-input-delta', toolCallId: id, inputTextDelta: text }]
    return kind === 'text'
      ? [{ type: 'text-delta', id, delta: text }]
      : [{ type: 'reasoning-delta', id, delta: text }]
  }

  pending(): boolean {
    return this.kind !== null && this.text !== ''
  }
}
