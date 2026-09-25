import { z } from 'zod'

export const ASK_USER_LIMITS = {
  questionMaxLength: 4_000,
  optionIdMaxLength: 80,
  optionLabelMaxLength: 200,
  optionDescriptionMaxLength: 500,
  maxOptions: 12,
  textMaxLength: 4_000,
  reasonMaxLength: 500,
} as const

const optionIdSchema = z
  .string()
  .trim()
  .min(1)
  .max(ASK_USER_LIMITS.optionIdMaxLength)
  .regex(/^[A-Za-z0-9][A-Za-z0-9._:-]*$/, '选项 ID 只能包含字母、数字、点、下划线、冒号和连字符')

const optionSchema = z.strictObject({
  id: optionIdSchema,
  label: z.string().trim().min(1).max(ASK_USER_LIMITS.optionLabelMaxLength),
  description: z.string().trim().min(1).max(ASK_USER_LIMITS.optionDescriptionMaxLength).optional(),
})

export const askUserRequestSchema = z
  .strictObject({
    question: z.string().trim().min(1).max(ASK_USER_LIMITS.questionMaxLength),
    options: z.array(optionSchema).max(ASK_USER_LIMITS.maxOptions).optional(),
    allowFreeform: z.boolean().default(false),
    allowSkip: z.boolean().default(false),
  })
  .superRefine((request, context) => {
    const ids = new Set<string>()
    for (const [index, option] of (request.options ?? []).entries()) {
      if (ids.has(option.id)) {
        context.addIssue({
          code: 'custom',
          path: ['options', index, 'id'],
          message: '选项 ID 必须唯一',
        })
      }
      ids.add(option.id)
    }
  })

const answeredSchema = z
  .strictObject({
    outcome: z.literal('answered'),
    optionId: optionIdSchema.optional(),
    text: z.string().trim().min(1).max(ASK_USER_LIMITS.textMaxLength).optional(),
  })
  .refine(({ optionId, text }) => optionId !== undefined || text !== undefined, {
    message: '回答必须选择一个选项或填写文本',
  })

const terminalResponseSchema = z.discriminatedUnion('outcome', [
  z.strictObject({ outcome: z.literal('skipped') }),
  z.strictObject({ outcome: z.literal('cancelled') }),
  z.strictObject({ outcome: z.literal('expired') }),
  z.strictObject({
    outcome: z.literal('denied'),
    reason: z.string().trim().min(1).max(ASK_USER_LIMITS.reasonMaxLength).optional(),
  }),
])

export const askUserResponseSchema = z.union([answeredSchema, terminalResponseSchema])

export type AskUserOption = z.infer<typeof optionSchema>
export type AskUserRequest = z.infer<typeof askUserRequestSchema>
export type AskUserResponse = z.infer<typeof askUserResponseSchema>

export interface AskUserInteractionResponse {
  chatId: string
  runId: string
  toolCallId: string
  interactionId: string
  response: AskUserResponse
}

export const askUserInteractionResponseSchema = z.strictObject({
  chatId: z.string().min(1).max(200),
  runId: z.string().min(1).max(256),
  toolCallId: z.string().min(1).max(256),
  interactionId: z.string().min(1).max(256),
  response: askUserResponseSchema,
})

export function validateAskUserResponse(
  request: AskUserRequest,
  response: AskUserResponse,
): AskUserResponse {
  const parsed = askUserResponseSchema.parse(response)
  if (parsed.outcome !== 'answered') {
    if (parsed.outcome === 'skipped' && !request.allowSkip) {
      throw new Error('当前问题不允许跳过')
    }
    return parsed
  }

  if (parsed.optionId !== undefined) {
    if (!(request.options ?? []).some((option) => option.id === parsed.optionId)) {
      throw new Error('回答中的选项不存在')
    }
  }
  if (parsed.text !== undefined && !request.allowFreeform) {
    throw new Error('当前问题不允许自由文本回答')
  }
  return parsed
}
