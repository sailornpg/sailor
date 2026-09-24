import { z } from 'zod'

export const MESSAGE_QUOTE_MAX_BYTES = 8 * 1024

export const messageQuoteSchema = z.object({
  text: z
    .string()
    .trim()
    .min(1)
    .refine(
      (text) => new TextEncoder().encode(text).length <= MESSAGE_QUOTE_MAX_BYTES,
      '引用超过 8 KiB。',
    ),
  messageId: z.string().min(1).max(200),
})

export type MessageQuote = z.infer<typeof messageQuoteSchema>
