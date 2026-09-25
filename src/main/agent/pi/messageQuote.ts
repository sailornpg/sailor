import type { UIMessage } from 'ai'
import { messageQuoteSchema } from '../../../shared/messageQuote.js'

function injectQuoteContext(messages: UIMessage[]): UIMessage[] {
  return messages.map((message) => {
    if (message.role !== 'user') return message
    const metadata = message.metadata
    const custom =
      metadata && typeof metadata === 'object'
        ? (metadata as Record<string, unknown>).custom
        : undefined
    const quote =
      custom && typeof custom === 'object' ? (custom as Record<string, unknown>).quote : undefined
    const text =
      quote &&
      typeof quote === 'object' &&
      typeof (quote as Record<string, unknown>).text === 'string'
        ? ((quote as Record<string, unknown>).text as string)
        : undefined
    if (!text) return message
    const blockquote = text
      .split(/\r?\n/)
      .map((line) => `> ${line}`)
      .join('\n')
    if (message.parts?.[0]?.type === 'text' && message.parts[0].text === `${blockquote}\n\n`)
      return message
    return {
      ...message,
      parts: [{ type: 'text', text: `${blockquote}\n\n` }, ...(message.parts ?? [])],
    }
  })
}

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
