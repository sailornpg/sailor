import { z } from 'zod'

export const webSearchSourceSchema = z.strictObject({
  sourceId: z.string().regex(/^src_[a-f0-9]{16}$/),
  title: z.string().min(1).max(300),
  url: z.string().url().refine(value => {
    const protocol = new URL(value).protocol
    return protocol === 'http:' || protocol === 'https:'
  }),
  snippet: z.string().max(2_000),
  retrievedAt: z.string().datetime(),
  publishedAt: z.string().datetime().optional(),
})

export const webSearchDataSchema = z.strictObject({
  query: z.string().min(1).max(500),
  sources: z.array(webSearchSourceSchema).min(1).max(10),
})

export type WebSearchSource = z.infer<typeof webSearchSourceSchema>
export type WebSearchData = z.infer<typeof webSearchDataSchema>
