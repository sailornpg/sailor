import type { UIMessage } from 'ai'
import { injectQuoteContext } from '@assistant-ui/ai-sdk'
import { messageQuoteSchema } from '../../../shared/messageQuote.js'

export function projectMessageQuotes(messages: UIMessage[]): UIMessage[] {
  for (const message of messages) {
    const metadata = message.metadata
    if (!metadata || typeof metadata !== 'object') continue
    const custom = (metadata as Record<string, unknown>).custom
    if (!custom || typeof custom !== 'object' || !('quote' in custom)) continue
    if (message.role !== 'user') throw new Error('引用只能附加到用户消息。')
    try {
      messageQuoteSchema.parse((custom as Record<string, unknown>).quote)
    } catch {
      throw new Error('消息引用无效或超过 8 KiB。')
    }
  }
  return injectQuoteContext(messages)
}
