import { isToolUIPart, type ChatTransport, type UIMessage, type UIMessageChunk } from 'ai'
import { FLUSH_INTERVAL_MS, StreamChunkCoalescer } from './streamChunkCoalescer'
import {
  normalizeThinkingLevel,
  type AgentRunRequest,
  type ReasoningEffort,
  type ThinkingLevel,
} from '@shared/contracts'

const activeRunIds = new Map<string, string>()
const activeTurnIds = new Map<string, string>()

export function getActiveAgentRunId(chatId: string): string | undefined {
  return activeRunIds.get(chatId)
}

export function createAgentRunRequest(input: AgentRunRequest): AgentRunRequest {
  const thinkingLevel = normalizeThinkingLevel(input.thinkingLevel, input.reasoning)
  const request = { ...input, thinkingLevel }
  if (input.thinkingLevel === undefined) delete request.reasoning
  return request
}

function resumesToolApproval(messages: UIMessage[]): boolean {
  const message = messages.at(-1)
  return (
    message?.role === 'assistant' &&
    message.parts.some((part) => isToolUIPart(part) && part.state === 'approval-responded')
  )
}

export class IpcChatTransport implements ChatTransport<UIMessage> {
  private readonly getThinkingLevel: () => ThinkingLevel | ReasoningEffort

  constructor(getThinkingLevel: () => ThinkingLevel | ReasoningEffort = () => 'provider-default') {
    this.getThinkingLevel = getThinkingLevel
  }

  async sendMessages({
    chatId,
    messages,
    abortSignal,
  }: Parameters<ChatTransport<UIMessage>['sendMessages']>[0]): Promise<
    ReadableStream<UIMessageChunk>
  > {
    const runId = crypto.randomUUID()
    const turnId = resumesToolApproval(messages)
      ? (activeTurnIds.get(chatId) ?? crypto.randomUUID())
      : crypto.randomUUID()
    activeTurnIds.set(chatId, turnId)
    activeRunIds.set(chatId, runId)
    const thinkingLevel = normalizeThinkingLevel(this.getThinkingLevel())
    let unsubscribe: (() => void) | undefined
    let abortHandler: (() => void) | undefined
    let finished = false
    let flushTimer: number | undefined

    const cancelFlush = () => {
      if (flushTimer === undefined) return
      window.clearTimeout(flushTimer)
      flushTimer = undefined
    }

    const cleanup = () => {
      cancelFlush()
      unsubscribe?.()
      if (abortHandler) abortSignal?.removeEventListener('abort', abortHandler)
      unsubscribe = undefined
      abortHandler = undefined
    }

    return new ReadableStream<UIMessageChunk>({
      start(controller) {
        // Provider deltas arrive every few milliseconds. Handing each one to the
        // runtime makes React re-render (composer, autosizing textarea, context
        // rail, markdown) per token, which freezes the window on long answers;
        // the coalescer keeps the runtime near frame rate instead.
        const coalescer = new StreamChunkCoalescer()
        const flushPending = () => {
          cancelFlush()
          for (const chunk of coalescer.flush()) controller.enqueue(chunk)
        }
        const push = (chunk: UIMessageChunk) => {
          for (const ready of coalescer.push(chunk)) controller.enqueue(ready)
          if (coalescer.pending() && flushTimer === undefined) {
            flushTimer = window.setTimeout(() => {
              flushTimer = undefined
              for (const ready of coalescer.flush()) controller.enqueue(ready)
            }, FLUSH_INTERVAL_MS)
          }
        }
        const close = () => {
          if (finished) return
          finished = true
          flushPending()
          cleanup()
          if (activeRunIds.get(chatId) === runId) activeRunIds.delete(chatId)
          controller.close()
        }

        unsubscribe = window.sailor.agent.subscribe((eventRunId, event) => {
          if (eventRunId !== runId || finished) return

          if (event.type === 'chunk') push(event.chunk)
          else if (event.type === 'end') close()
        })

        abortHandler = () => {
          void window.sailor.agent.abort(runId)
        }
        abortSignal?.addEventListener('abort', abortHandler, { once: true })

        if (abortSignal?.aborted) {
          abortHandler()
          close()
          return
        }

        void (async () => {
          if (!resumesToolApproval(messages)) await window.sailor.agent.revokeApprovals(chatId)
          if (finished || abortSignal?.aborted) return
          await window.sailor.agent.start(
            createAgentRunRequest({
              chatId,
              messages,
              thinkingLevel,
              runId,
              turnId,
            }),
          )
        })().catch((error: unknown) => {
          if (finished) return
          finished = true
          cleanup()
          controller.error(error)
        })
      },
      cancel() {
        if (!finished) void window.sailor.agent.abort(runId)
        if (activeRunIds.get(chatId) === runId) activeRunIds.delete(chatId)
        finished = true
        cleanup()
      },
    })
  }

  async reconnectToStream(): Promise<ReadableStream<UIMessageChunk> | null> {
    return null
  }
}
