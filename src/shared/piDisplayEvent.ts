import { z } from 'zod'

const phase = z.enum(['started', 'succeeded', 'failed', 'cancelled'])
const base = { id: z.string().min(1).max(100), phase, at: z.number().int().nonnegative() }

export const piDisplayEventSchema = z.discriminatedUnion('kind', [
  z.strictObject({
    ...base,
    kind: z.literal('compaction'),
    trigger: z.enum(['manual', 'threshold', 'overflow']),
    tokensBefore: z.number().int().nonnegative().max(1_000_000_000).optional(),
  }),
  z.strictObject({
    ...base,
    kind: z.literal('retry'),
    attempt: z.number().int().min(1).max(20),
    maxAttempts: z.number().int().min(1).max(20),
  }),
])

export type PiDisplayEvent = z.infer<typeof piDisplayEventSchema>

export interface PiProjectedEvent {
  chatId: string
  runId: string
  id: string
  event: PiDisplayEvent
}
