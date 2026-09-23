import { z } from 'zod'
export const CONTEXT_LIMITS = {
  count: 8,
  bytes: 32 * 1024,
  totalBytes: 128 * 1024,
} as const
const bytes = (text: string) => new TextEncoder().encode(text).length
export function safeContextPath(path: string): boolean {
  const parts = path.split(/[\\/]/)
  return (
    Boolean(path) &&
    path.length <= 1000 &&
    !path.includes('\0') &&
    !/^(?:[\\/]|[a-z]:)/i.test(path) &&
    !parts.includes('..') &&
    !parts.some((p) => ['.git', '.ssh'].includes(p.toLowerCase())) &&
    !/^(?:\.env(?:\..*)?|id_rsa|id_ed25519|\.npmrc|\.pypirc)$|\.(pem|key)$/i.test(
      parts.at(-1) ?? '',
    )
  )
}
export const workspaceContextSchema = z
  .object({
    id: z.string().min(1).max(100),
    projectId: z.string().min(1).max(200),
    relativePath: z.string().refine(safeContextPath, '引用路径无效或敏感'),
    kind: z.enum(['file', 'selection']),
    startLine: z.number().int().positive(),
    endLine: z.number().int().positive(),
    startOffset: z.number().int().nonnegative(),
    endOffset: z.number().int().nonnegative(),
    text: z
      .string()
      .max(32768)
      .refine((text) => bytes(text) <= CONTEXT_LIMITS.bytes, '引用超过 32 KiB'),
    sha256: z.string().regex(/^[a-f0-9]{64}$/),
  })
  .superRefine((v, ctx) => {
    if (
      v.endLine < v.startLine ||
      v.endOffset < v.startOffset ||
      v.endOffset - v.startOffset !== v.text.length
    )
      ctx.addIssue({ code: 'custom', message: '引用选区无效' })
  })
export type WorkspaceContextData = z.infer<typeof workspaceContextSchema>
export interface WorkspaceContextPart {
  type: 'data-workspace-context'
  data: WorkspaceContextData
}
export function createWorkspaceContext(
  projectId: string,
  source: {
    relativePath: string
    content: string
    sha256: string
    truncated: boolean
    previewable: boolean
  },
  range?: { start: number; end: number },
): WorkspaceContextPart {
  if (!source.previewable) throw new Error('此文件不能作为文本引用。')
  if (!range && source.truncated)
    throw new Error('文件已截断，请选择文本片段引用。')
  const start = range?.start ?? 0,
    end = range?.end ?? source.content.length
  if (
    !Number.isInteger(start) ||
    !Number.isInteger(end) ||
    start < 0 ||
    end < start ||
    end > source.content.length ||
    (range && end === start)
  )
    throw new Error('引用选区无效。')
  const text = source.content.slice(start, end)
  return {
    type: 'data-workspace-context',
    data: workspaceContextSchema.parse({
      id: crypto.randomUUID(),
      projectId,
      relativePath: source.relativePath,
      kind: range ? 'selection' : 'file',
      text,
      sha256: source.sha256,
      startOffset: start,
      endOffset: end,
      startLine: source.content.slice(0, start).split('\n').length,
      endLine: source.content.slice(0, Math.max(start, end - 1)).split('\n')
        .length,
    }),
  }
}
export function validateWorkspaceContexts(
  parts: WorkspaceContextPart[],
  projectId?: string,
): WorkspaceContextPart[] {
  if (parts.length > CONTEXT_LIMITS.count)
    throw new Error('每条消息最多添加 8 个引用。')
  let total = 0
  const parsed = parts.map((part) => {
    const data = workspaceContextSchema.parse(part.data)
    if (projectId && data.projectId !== projectId)
      throw new Error('引用不属于当前工作区。')
    total += bytes(data.text)
    return { type: 'data-workspace-context' as const, data }
  })
  if (total > CONTEXT_LIMITS.totalBytes)
    throw new Error('引用总量超过 128 KiB。')
  return parsed
}
