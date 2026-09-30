import { WorkspaceContextRenderer } from '../thread/WorkspaceContextMessage'
import { sendWithWorkspaceContexts } from './sendWithWorkspaceContexts'
import { createContext, useContext, useMemo, type ReactNode } from 'react'
import { useChat, type Chat, type UseChatHelpers } from '@ai-sdk/react'
import { useAISDKRuntime } from '@assistant-ui/ai-sdk'
import { AssistantRuntimeProvider, AuiConfig, Tools } from '@assistant-ui/react'
import type { UIMessage } from 'ai'
import { sailorAttachmentAdapter } from './sailorAttachmentAdapter'
import { getActiveAgentRunId } from '@/lib/IpcChatTransport'
import { sailorToolkit } from '../tools/sailorToolkit'
import { PiEventDataUI } from '../events/PiEventRecord'

const sailorConfig = AuiConfig({ tools: Tools({ toolkit: sailorToolkit }) })

/**
 * Only the fields that stay stable while an answer streams: exposing the whole
 * `useChat` helpers object here re-rendered every consumer (composer, context
 * rail) on every streamed delta, which froze the window on long answers.
 * Message lists are read where they are used, through `useAuiState`.
 */
export type SailorChatActions = Pick<
  UseChatHelpers<UIMessage>,
  'sendMessage' | 'stop' | 'clearError' | 'error' | 'status'
>
const SailorChatContext = createContext<SailorChatActions | null>(null)
/**
 * Message lists stay in their own context: only the few slots that derive
 * something from them re-render while an answer streams.
 */
const SailorChatMessagesContext = createContext<readonly UIMessage[]>([])
const SailorChatIdContext = createContext<string | null>(null)
const SailorAskUserContext = createContext<
  | ((toolCallId: string, response: import('@shared/askUser').AskUserResponse) => Promise<void>)
  | null
>(null)

interface SailorChatProviderProps {
  chat: Chat<UIMessage>
  children: ReactNode
}

export function SailorChatProvider({ chat, children }: SailorChatProviderProps) {
  const chatState = useChat({ chat })
  const sendMessage = sendWithWorkspaceContexts(chat.id, chatState.sendMessage)
  const adapted = { ...chatState, sendMessage }
  const { stop, clearError, error, status } = chatState
  // Instance-bound methods are stable; error/status change at run boundaries.
  const actions = useMemo<SailorChatActions>(
    () => ({ sendMessage, stop, clearError, error, status }),
    [sendMessage, stop, clearError, error, status],
  )
  const runtime = useAISDKRuntime(adapted, {
    adapters: { attachments: sailorAttachmentAdapter },
    onRespondToToolApproval: async (response, { toolCallId, toolName, respondViaAISDK }) => {
      if (typeof response.approved !== 'boolean') throw new Error('写入审批必须明确允许或拒绝。')
      await window.sailor.agent.respondToApproval({
        chatId: chat.id,
        approvalId: response.approvalId,
        toolCallId,
        toolName,
        approved: response.approved,
        ...(response.reason != null ? { reason: response.reason } : {}),
      })
      await respondViaAISDK()
    },
  })
  const respondToAskUser = async (
    toolCallId: string,
    response: import('@shared/askUser').AskUserResponse,
  ) => {
    const runId = getActiveAgentRunId(chat.id)
    if (!runId) throw new Error('当前运行已结束，请重新发起问题。')
    await window.sailor.agent.respondToAskUser({
      chatId: chat.id,
      runId,
      toolCallId,
      interactionId: toolCallId,
      response,
    })
  }

  return (
    <SailorChatContext.Provider value={actions}>
      <SailorChatMessagesContext.Provider value={chatState.messages}>
        <SailorChatIdContext.Provider value={chat.id}>
          <SailorAskUserContext.Provider value={respondToAskUser}>
            <AssistantRuntimeProvider runtime={runtime} config={sailorConfig}>
              <WorkspaceContextRenderer />
              <PiEventDataUI />
              {children}
            </AssistantRuntimeProvider>
          </SailorAskUserContext.Provider>
        </SailorChatIdContext.Provider>
      </SailorChatMessagesContext.Provider>
    </SailorChatContext.Provider>
  )
}

export function useSailorChatId(): string {
  const chatId = useContext(SailorChatIdContext)
  if (!chatId) throw new Error('useSailorChatId must be used inside SailorChatProvider')
  return chatId
}

export function useSailorAskUserResponder() {
  const responder = useContext(SailorAskUserContext)
  return (
    responder ??
    (async () => {
      throw new Error('用户问题运行上下文不可用。')
    })
  )
}

export function useSailorChatMessages(): readonly UIMessage[] {
  return useContext(SailorChatMessagesContext)
}

export function useSailorChat(): SailorChatActions {
  const chatState = useContext(SailorChatContext)
  if (!chatState) throw new Error('useSailorChat must be used inside SailorChatProvider')
  return chatState
}
