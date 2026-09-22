import { z } from 'zod'

export const TOOL_BUDGETS = {
  readFileBytes: 64 * 1024,
  readFileLines: 500,
  searchMatches: 100,
  listFilesPageSize: 200,
  writeFileBytes: 1024 * 1024,
  modelOutputBytes: 32 * 1024,
} as const

export const toolErrorCodeSchema = z.enum([
  'INVALID_ARGUMENT',
  'WORKSPACE_UNAVAILABLE',
  'OUTSIDE_WORKSPACE',
  'SENSITIVE_PATH',
  'NOT_FOUND',
  'NOT_A_FILE',
  'NOT_A_DIRECTORY',
  // 文档读取新增：文件类型不在 read_document 支持范围内 / 解析器无法读取该文件。
  'UNSUPPORTED_TYPE',
  'PARSE_FAILED',
  'PERMISSION_DENIED',
  'BINARY_FILE',
  'APPROVAL_REQUIRED',
  'FILE_EXISTS',
  'PARENT_NOT_FOUND',
  'VERSION_CONFLICT',
  'PATCH_PARSE_ERROR',
  'PATCH_AMBIGUOUS',
  'PATCH_CONTEXT_MISMATCH',
  'STORAGE_FULL',
  'LIMIT_EXCEEDED',
  'COMMAND_FAILED',
  'COMMAND_TIMEOUT',
  'SPAWN_ERROR',
  'UNSUPPORTED_PLATFORM',
  'NOT_CONFIGURED',
  'EMPTY_RESULTS',
  'AUTHENTICATION_FAILED',
  'RATE_LIMITED',
  'UPSTREAM_ERROR',
  'INVALID_RESPONSE',
  'TIMEOUT',
  'CANCELLED',
  'INTERNAL_ERROR',
])

export const toolEffectSchema = z.strictObject({
  kind: z.enum(['none', 'applied', 'partial', 'unknown']),
  description: z.string().min(1).max(500).optional(),
})

export const toolRecoveryActionSchema = z.strictObject({
  action: z.string().min(1).max(64),
  reason: z.string().min(1).max(500),
  path: z.string().min(1).max(4096).optional(),
  arguments: z.record(z.string(), z.unknown()).optional(),
})

const artifactRefSchema = z.strictObject({
  id: z.string().min(1).max(256),
  kind: z.string().min(1).max(64),
  label: z.string().min(1).max(256).optional(),
})

const commonShape = {
  schemaVersion: z.literal(1),
  toolCallId: z.string().min(1).max(256),
  tool: z.string().min(1).max(64),
  summary: z.string().min(1).max(500),
  durationMs: z.number().finite().nonnegative().max(86_400_000),
  effects: toolEffectSchema,
  truncated: z.boolean(),
  artifactRefs: z.array(artifactRefSchema).max(20).optional(),
}

const toolSuccessSchema = z.strictObject({
  ...commonShape,
  ok: z.literal(true),
  data: z.unknown(),
})

const toolFailureSchema = z.strictObject({
  ...commonShape,
  ok: z.literal(false),
  error: z.strictObject({
    code: toolErrorCodeSchema,
    message: z.string().min(1).max(1_000),
    retryable: z.boolean(),
    retryAfterMs: z.number().int().nonnegative().max(60_000).optional(),
    details: z.record(z.string(), z.unknown()).optional(),
    recovery: z.array(toolRecoveryActionSchema).min(1).max(8),
  }),
})

export const toolResultSchema = z.discriminatedUnion('ok', [toolSuccessSchema, toolFailureSchema])

export type ToolErrorCode = z.infer<typeof toolErrorCodeSchema>
export type ToolEffect = z.infer<typeof toolEffectSchema>
export type ToolRecoveryAction = z.infer<typeof toolRecoveryActionSchema>
export type ToolResult = z.infer<typeof toolResultSchema>
export type ToolSuccess = z.infer<typeof toolSuccessSchema>
export type ToolFailure = z.infer<typeof toolFailureSchema>

interface CreateToolSuccessInput {
  toolCallId: string
  tool: string
  summary: string
  durationMs: number
  data: unknown
  effects?: ToolEffect
  truncated?: boolean
  artifactRefs?: ToolSuccess['artifactRefs']
}

interface CreateToolFailureInput {
  toolCallId: string
  tool: string
  summary: string
  durationMs: number
  code: ToolErrorCode
  message: string
  retryable: boolean
  retryAfterMs?: number
  details?: Record<string, unknown>
  recovery: ToolRecoveryAction[]
  effects?: ToolEffect
  truncated?: boolean
  artifactRefs?: ToolFailure['artifactRefs']
}

export function createToolSuccess(input: CreateToolSuccessInput): ToolSuccess {
  return toolSuccessSchema.parse({
    schemaVersion: 1,
    ok: true,
    effects: input.effects ?? { kind: 'none' },
    truncated: input.truncated ?? false,
    ...input,
  })
}

export function createToolFailure(input: CreateToolFailureInput): ToolFailure {
  const { code, message, retryable, retryAfterMs, details, recovery, ...common } = input
  return toolFailureSchema.parse({
    schemaVersion: 1,
    ok: false,
    effects: input.effects ?? { kind: 'none' },
    truncated: input.truncated ?? false,
    ...common,
    error: { code, message, retryable, retryAfterMs, details, recovery },
  })
}

interface InvalidArgumentInput {
  toolCallId: string
  tool: string
  issues: Array<{ path: string; message: string }>
}

export function createInvalidArgumentFailure(input: InvalidArgumentInput): ToolFailure {
  return createToolFailure({
    toolCallId: input.toolCallId,
    tool: input.tool,
    summary: `工具 ${input.tool} 的参数无效`,
    durationMs: 0,
    code: 'INVALID_ARGUMENT',
    message: '工具参数未通过校验。',
    retryable: false,
    details: { issues: input.issues },
    recovery: [{ action: 'retry', reason: '请根据参数错误修正后重新调用工具' }],
  })
}

interface UnexpectedFailureInput {
  toolCallId: string
  tool: string
  error: unknown
  durationMs?: number
}

export function createUnexpectedToolFailure(input: UnexpectedFailureInput): ToolFailure {
  void input.error
  return createToolFailure({
    toolCallId: input.toolCallId,
    tool: input.tool,
    summary: `工具 ${input.tool} 执行失败`,
    durationMs: input.durationMs ?? 0,
    code: 'INTERNAL_ERROR',
    message: '工具执行遇到未知错误，内部细节已隐藏。',
    retryable: true,
    effects: { kind: 'unknown' },
    recovery: [{ action: 'retry', reason: '可重试一次；若仍失败，请检查工作区状态' }],
  })
}

export function projectToolResult(result: ToolResult): {
  status: 'success' | 'error'
  summary: string
  errorCode?: ToolErrorCode
} {
  return result.ok
    ? { status: 'success', summary: result.summary }
    : { status: 'error', summary: result.summary, errorCode: result.error.code }
}

export function limitToolText(text: string, limit: number): {
  text: string
  originalLength: number
  truncated: boolean
} {
  if (!Number.isInteger(limit) || limit < 0) throw new RangeError('limit must be a non-negative integer')
  return {
    text: text.slice(0, limit),
    originalLength: text.length,
    truncated: text.length > limit,
  }
}

function byteLength(value: string): number {
  return new TextEncoder().encode(value).byteLength
}

function safeJson(value: unknown): string {
  try {
    return JSON.stringify(value) ?? 'null'
  } catch {
    return '"[Unserializable data]"'
  }
}

export interface ToolModelOutput {
  schemaVersion: 1
  toolCallId: string
  tool: string
  ok: boolean
  summary: string
  effects: ToolEffect
  truncated: boolean
  artifactRefs?: ToolResult['artifactRefs']
  data?: unknown
  error?: ToolFailure['error']
}

function fitPreview(base: Omit<ToolModelOutput, 'data' | 'error'>, data: unknown): ToolModelOutput {
  const serialized = safeJson(data)
  const originalBytes = byteLength(serialized)
  let preview = serialized
  let output = { ...base, truncated: true, data: { preview, originalBytes } }
  while (preview.length > 0 && byteLength(JSON.stringify(output)) > TOOL_BUDGETS.modelOutputBytes) {
    const excess = byteLength(JSON.stringify(output)) - TOOL_BUDGETS.modelOutputBytes
    preview = preview.slice(0, Math.max(0, preview.length - Math.max(excess, 256)))
    output = { ...base, truncated: true, data: { preview, originalBytes } }
  }
  return output
}

export function toToolModelOutput(result: ToolResult): ToolModelOutput {
  const base: Omit<ToolModelOutput, 'data' | 'error'> = {
    schemaVersion: result.schemaVersion,
    toolCallId: result.toolCallId,
    tool: result.tool,
    ok: result.ok,
    summary: result.summary,
    effects: result.effects,
    truncated: result.truncated,
    artifactRefs: result.artifactRefs,
  }
  if (!result.ok) return { ...base, error: result.error }
  const output = { ...base, data: result.data }
  return byteLength(safeJson(output)) <= TOOL_BUDGETS.modelOutputBytes
    ? output
    : fitPreview(base, result.data)
}
