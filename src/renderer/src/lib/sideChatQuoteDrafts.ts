import { messageQuoteSchema, type MessageQuote } from '@shared/messageQuote'

export class SideChatQuoteDrafts {
  private readonly quotes = new Map<string, MessageQuote>()

  set(chatId: string, quote: MessageQuote): void {
    this.quotes.set(chatId, messageQuoteSchema.parse(quote))
  }
  take(chatId: string): MessageQuote | undefined {
    const quote = this.quotes.get(chatId)
    this.quotes.delete(chatId)
    return quote
  }
  forget(chatId: string): void {
    this.quotes.delete(chatId)
  }
}

export const sideChatQuoteDrafts = new SideChatQuoteDrafts()
