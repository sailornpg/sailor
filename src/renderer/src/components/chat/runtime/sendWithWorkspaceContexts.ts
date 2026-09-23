import type { UseChatHelpers } from '@ai-sdk/react'
import type { UIMessage } from 'ai'
import { workspaceContextDrafts } from '@/lib/workspaceContextDrafts'

type SendMessage = UseChatHelpers<UIMessage>['sendMessage']

export function sendWithWorkspaceContexts(chatId: string, send: SendMessage): SendMessage {
  return (message, options) => {
    const drafts = workspaceContextDrafts.get(chatId)
    if (!message || !('parts' in message) || !message.parts || !drafts.length || ('role' in message && message.role !== undefined && message.role !== 'user')) return send(message, options)
    const payload = { ...message, role: 'user' as const, parts: [...message.parts, ...drafts] }
    const pending = send(payload, options)
    // The promise covers the entire generation, not just submission.
    workspaceContextDrafts.consume(chatId, drafts.map(part => part.data.id))
    return pending
  }
}
