import { isToolUIPart, type ChatTransport, type UIMessage, type UIMessageChunk } from 'ai'
import type { AgentRunRequest, ReasoningEffort } from '@shared/contracts'

const activeRunIds = new Map<string, string>()

export function getActiveAgentRunId(chatId: string): string | undefined {
  return activeRunIds.get(chatId)
}

export function createAgentRunRequest(input: AgentRunRequest): AgentRunRequest {
  return input
}

function resumesToolApproval(messages: UIMessage[]): boolean {
  const message = messages.at(-1)
  return (
    message?.role === 'assistant' &&
    message.parts.some((part) => isToolUIPart(part) && part.state === 'approval-responded')
  )
}

export class IpcChatTransport implements ChatTransport<UIMessage> {
  private readonly getReasoning: () => ReasoningEffort

  constructor(getReasoning: () => ReasoningEffort = () => 'provider-default') {
    this.getReasoning = getReasoning
  }

  async sendMessages({
    chatId,
    messages,
    abortSignal,
  }: Parameters<ChatTransport<UIMessage>['sendMessages']>[0]): Promise<
    ReadableStream<UIMessageChunk>
  > {
    const runId = crypto.randomUUID()
    activeRunIds.set(chatId, runId)
    const reasoning = this.getReasoning()
    let unsubscribe: (() => void) | undefined
    let abortHandler: (() => void) | undefined
    let finished = false

    const cleanup = () => {
      unsubscribe?.()
      if (abortHandler) abortSignal?.removeEventListener('abort', abortHandler)
      unsubscribe = undefined
      abortHandler = undefined
    }

    return new ReadableStream<UIMessageChunk>({
      start(controller) {
        const close = () => {
          if (finished) return
          finished = true
          cleanup()
          if (activeRunIds.get(chatId) === runId) activeRunIds.delete(chatId)
          controller.close()
        }

        unsubscribe = window.sailor.agent.subscribe((eventRunId, event) => {
          if (eventRunId !== runId || finished) return

          if (event.type === 'chunk') controller.enqueue(event.chunk)
          else close()
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
              reasoning,
              runId,
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
