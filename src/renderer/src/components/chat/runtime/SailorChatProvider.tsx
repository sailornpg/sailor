import { createContext, useContext, type ReactNode } from 'react'
import { useChat, type Chat, type UseChatHelpers } from '@ai-sdk/react'
import { useAISDKRuntime } from '@assistant-ui/ai-sdk'
import { AssistantRuntimeProvider } from '@assistant-ui/react'
import type { UIMessage } from 'ai'
import { sailorAttachmentAdapter } from './sailorAttachmentAdapter'

const SailorChatContext = createContext<UseChatHelpers<UIMessage> | null>(null)

interface SailorChatProviderProps {
  chat: Chat<UIMessage>
  children: ReactNode
}

export function SailorChatProvider({ chat, children }: SailorChatProviderProps) {
  const chatState = useChat({ chat })
  const runtime = useAISDKRuntime(chatState, {
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

  return (
    <SailorChatContext.Provider value={chatState}>
      <AssistantRuntimeProvider runtime={runtime}>
        {children}
      </AssistantRuntimeProvider>
    </SailorChatContext.Provider>
  )
}

export function useSailorChat(): UseChatHelpers<UIMessage> {
  const chatState = useContext(SailorChatContext)
  if (!chatState) throw new Error('useSailorChat must be used inside SailorChatProvider')
  return chatState
}
