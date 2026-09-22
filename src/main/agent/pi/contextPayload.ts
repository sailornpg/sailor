import { z } from 'zod'

/**
 * 本轮真正交给 harness 的 payload 有多大（按字符精确计数）。
 *
 * 分类的**绝对** token 数只有 provider 知道，所以这里只测量我们自己组装、
 * 能确证进入 prompt 的字符量；渲染端再按 Pi 的 `ceil(chars / 4)` 口径把
 * provider 报告的精确 inputTokens 折算到各分类。测量口径要贴着"实际发送"
 * 而不是"我们拥有"，否则占比会把窗口的去向讲错。
 */
export interface ContextPayloadMeasure {
  /** 系统提示词 + 技能目录（仅 name/description，正文由模型按需加载）。 */
  systemChars: number
  /** 工具名 + 描述 + provider 形态的入参 JSON Schema。 */
  toolChars: number
  /** 文档附件：路径提示 + read_document 读出的正文。 */
  attachmentChars: number
  /** 对话文本、推理文本、非附件工具入参与工具结果。 */
  conversationChars: number
  /** 图片 part 数量；其 token 由 provider 视觉公式决定，无法用字符推导。 */
  images: number
}

interface SkillLike {
  readonly name: string
  readonly description: string
}

interface Buckets {
  attachmentChars: number
  conversationChars: number
  images: number
}

const READ_DOCUMENT_TOOL = 'read_document'

function jsonChars(value: unknown): number {
  try {
    const text = JSON.stringify(value)
    return typeof text === 'string' ? text.length : 0
  } catch {
    return 0
  }
}

/**
 * zod schema 走 provider 实际收到的 JSON Schema；其他形态（已是 JSON Schema
 * 的对象、未知结构）退回原样序列化，无法序列化时按 0 处理而不是抛错。
 */
function schemaChars(schema: unknown): number {
  if (schema === undefined || schema === null) return 0
  try {
    const converted = z.toJSONSchema(schema as z.ZodType)
    if (converted !== undefined) return jsonChars(converted)
  } catch {
    // 不是 zod schema（或含无法转换的结构），退回直接序列化。
  }
  return jsonChars(schema)
}

function measureTools(tools: object): number {
  let total = 0
  for (const [name, tool] of Object.entries(tools)) {
    if (!tool || typeof tool !== 'object') continue
    const { description, inputSchema } = tool as {
      description?: unknown
      inputSchema?: unknown
    }
    total += name.length
    if (typeof description === 'string') total += description.length
    total += schemaChars(inputSchema)
  }
  return total
}

function textChars(value: unknown): number {
  return typeof value === 'string' ? value.length : 0
}

function addToBucket(buckets: Buckets, key: keyof Buckets, chars: number): void {
  if (key === 'images') buckets.images += chars
  else buckets[key] += chars
}

function addPart(part: Record<string, unknown>, buckets: Buckets, notice: string | undefined): void {
  switch (part['type']) {
    case 'text': {
      const text = typeof part['text'] === 'string' ? part['text'] : ''
      // 附件路径提示是本项目注入的固定文本，归到"附件"而不是用户会话。
      if (notice && text.includes(notice)) {
        buckets.attachmentChars += notice.length
        buckets.conversationChars += text.length - notice.length
        return
      }
      buckets.conversationChars += text.length
      return
    }
    case 'reasoning':
    case 'thinking':
      buckets.conversationChars += textChars(part['text']) + textChars(part['thinking'])
      return
    case 'tool-call':
      buckets.conversationChars += textChars(part['toolName']) + jsonChars(part['input'] ?? part['args'])
      return
    case 'tool-result': {
      const chars = textChars(part['toolName']) + jsonChars(part['output'] ?? part['result'])
      // 文档附件正文是经 read_document 工具结果进入上下文的，单独成类。
      addToBucket(buckets, part['toolName'] === READ_DOCUMENT_TOOL ? 'attachmentChars' : 'conversationChars', chars)
      return
    }
    case 'tool-approval-response':
      buckets.conversationChars += jsonChars(part)
      return
    case 'image':
      buckets.images += 1
      return
    case 'file':
      // 文档附件已被 stage 到会话文件系统，prompt 里只有路径提示文本（另计入）；
      // 图片则以 image part 随行，其字节数不是文本 token，不能计入字符。
      if (typeof part['mediaType'] === 'string' && part['mediaType'].startsWith('image/'))
        buckets.images += 1
      return
    default:
      buckets.conversationChars += textChars(part['text'])
  }
}

function addMessage(message: unknown, buckets: Buckets, notice: string | undefined): void {
  if (!message || typeof message !== 'object') return
  const content = (message as { content?: unknown }).content
  if (typeof content === 'string') {
    buckets.conversationChars += content.length
    return
  }
  if (!Array.isArray(content)) return
  for (const part of content) {
    if (typeof part === 'string') {
      buckets.conversationChars += part.length
      continue
    }
    if (!part || typeof part !== 'object') continue
    addPart(part as Record<string, unknown>, buckets, notice)
  }
}

export function measureContextPayload(input: {
  instructions: string
  skills: readonly SkillLike[]
  tools: object
  messages: readonly unknown[]
  /** 本项目注入的附件路径提示原文；命中它的文本算"附件"而不是"会话"。 */
  attachmentNotice?: string | undefined
}): ContextPayloadMeasure {
  const buckets: Buckets = { attachmentChars: 0, conversationChars: 0, images: 0 }
  for (const message of input.messages) addMessage(message, buckets, input.attachmentNotice)

  return {
    systemChars:
      input.instructions.length +
      input.skills.reduce(
        (total, skill) => total + skill.name.length + skill.description.length,
        0,
      ),
    toolChars: measureTools(input.tools),
    attachmentChars: buckets.attachmentChars,
    conversationChars: buckets.conversationChars,
    images: buckets.images,
  }
}
