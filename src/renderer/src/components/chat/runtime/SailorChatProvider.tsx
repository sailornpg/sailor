import { WorkspaceContextRenderer } from '../thread/WorkspaceContextMessage'
import { sendWithWorkspaceContexts } from './sendWithWorkspaceContexts'
import { createContext, useContext, type ReactNode } from 'react'
import { useChat, type Chat, type UseChatHelpers } from '@ai-sdk/react'
import { useAISDKRuntime } from '@assistant-ui/ai-sdk'
import { AssistantRuntimeProvider } from '@assistant-ui/react'
import type { UIMessage } from 'ai'
import { sailorAttachmentAdapter } from './sailorAttachmentAdapter'
import { getActiveAgentRunId } from '@/lib/IpcChatTransport'

const SailorChatContext = createContext<UseChatHelpers<UIMessage> | null>(null)
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
    <SailorChatContext.Provider value={adapted}>
      <SailorChatIdContext.Provider value={chat.id}>
        <SailorAskUserContext.Provider value={respondToAskUser}>
          <AssistantRuntimeProvider runtime={runtime}>
            <WorkspaceContextRenderer />
            {children}
          </AssistantRuntimeProvider>
        </SailorAskUserContext.Provider>
      </SailorChatIdContext.Provider>
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

export function useSailorChat(): UseChatHelpers<UIMessage> {
  const chatState = useContext(SailorChatContext)
  if (!chatState) throw new Error('useSailorChat must be used inside SailorChatProvider')
  return chatState
}
