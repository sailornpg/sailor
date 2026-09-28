/**
 * 上下文卡片的取数与折算。
 *
 * 分工原则：**总量用官方 API**——`@assistant-ui/ai-sdk` 的
 * `getThreadMessageTokenUsage` / `useThreadTokenUsage` 负责从消息里提取
 * input/output/缓存 tokens（还会回退到 `metadata.steps[]` 求和）。
 * 官方**没有**的东西才由我们自己补：窗口上限，以及本轮真实 payload 的
 * 分类字符测量——provider 不提供 system/tools/attachments/conversation 的
 * token 拆分，所以分类只能用测量值按占比折算到那个官方总量上。
 */

/** 本轮真实 payload 的字符测量，由主进程写入消息 metadata。 */
export interface ContextPayloadMeasure {
  systemChars: number
  toolChars: number
  attachmentChars: number
  conversationChars: number
  images: number
}

/** 官方 usage 提取器的返回形状（`getThreadMessageTokenUsage` 的返回值）。 */
export interface ContextTokenUsage {
  inputTokens?: number
  outputTokens?: number
  totalTokens?: number
  cachedInputTokens?: number
  reasoningTokens?: number
}

/** 官方给不出的部分：窗口上限 + 分类测量（+ 早期消息里遗留的总量）。 */
export interface ContextExtras {
  contextWindow: number
  modelId?: string
  payload?: ContextPayloadMeasure
  /** 兼容：分类口径上线初期的消息把总量也写在这一侧，官方字段缺失时回退。 */
  legacyInputTokens?: number
  legacyOutputTokens?: number
}

/** 卡片的取数结果：总量来自官方 API，权重来自我们自己的测量。 */
export interface ContextUsage {
  inputTokens: number
  outputTokens: number
  contextWindow: number
  payload?: ContextPayloadMeasure
}

/** 与官方 context-breakdown demo 的四类一致；`input` 只用于没有分类测量的旧消息。 */
export type ContextSegmentKey = 'system' | 'tools' | 'attachments' | 'conversation' | 'input'

export interface ContextBreakdownView {
  segments: { key: ContextSegmentKey; tokens: number }[]
  /** 最近一次调用的输入 tokens，等于各分类之和。 */
  used: number
  limit: number
}

// 分类顺序即展示顺序，与官方 demo 一致：系统 → 工具 → 附件 → 会话。
const SEGMENT_ORDER: readonly ContextSegmentKey[] = [
  'system',
  'tools',
  'attachments',
  'conversation',
]

const PAYLOAD_FIELDS: readonly (keyof ContextPayloadMeasure)[] = [
  'systemChars',
  'toolChars',
  'attachmentChars',
  'conversationChars',
  'images',
]

const asCount = (value: unknown): number | undefined =>
  Number.isSafeInteger(value) && (value as number) >= 0 ? (value as number) : undefined

/**
 * 非法值丢弃整个分类测量（只保留精确总量）；**缺失字段按 0 处理**。
 * 后者是必须的：分类口径会随版本增补字段（例如后加的 attachmentChars），
 * 早于该字段的消息不该被整体判废，否则卡片的分类会成片消失。
 */
function readPayload(value: unknown): ContextPayloadMeasure | undefined {
  if (!value || typeof value !== 'object') return
  const candidate = value as Record<string, unknown>
  const measure: ContextPayloadMeasure = {
    systemChars: 0,
    toolChars: 0,
    attachmentChars: 0,
    conversationChars: 0,
    images: 0,
  }
  for (const field of PAYLOAD_FIELDS) {
    const raw = candidate[field]
    if (raw === undefined) continue
    const count = asCount(raw)
    if (count === undefined) return
    measure[field] = count
  }
  return measure
}

const contextUsageBag = (metadata: Record<string, unknown>): unknown => {
  if (metadata['contextUsage'] !== undefined) return metadata['contextUsage']
  // assistant-ui 的消息转换器把非白名单 metadata key 挪进 custom，
  // 所以从线程态读到的 extras 在 custom.contextUsage（官方 usage 同理在 custom.usage）。
  const custom = metadata['custom']
  return custom && typeof custom === 'object'
    ? (custom as Record<string, unknown>)['contextUsage']
    : undefined
}

export function readContextExtras(metadata: unknown): ContextExtras | undefined {
  if (!metadata || typeof metadata !== 'object') return
  const bag = contextUsageBag(metadata as Record<string, unknown>)
  if (!bag || typeof bag !== 'object') return
  const record = bag as Record<string, unknown>
  // 窗口上限官方不提供，没有它就无法渲染卡片。
  const contextWindow = asCount(record['contextWindow'])
  if (contextWindow === undefined || contextWindow === 0) return
  const payload = readPayload(record['payload'])
  const legacyInputTokens = asCount(record['inputTokens'])
  const legacyOutputTokens = asCount(record['outputTokens'])
  return {
    contextWindow,
    ...(typeof record['modelId'] === 'string' ? { modelId: record['modelId'] } : {}),
    ...(payload ? { payload } : {}),
    ...(legacyInputTokens !== undefined ? { legacyInputTokens } : {}),
    ...(legacyOutputTokens !== undefined ? { legacyOutputTokens } : {}),
  }
}

/**
 * 官方优先：总量取官方提取器的结果；官方对该消息没有用量时，回退到我们早期
 * 写在 `contextUsage` 里的总量。两者都没有就不渲染卡片。
 */
export function composeContextUsage(input: {
  tokens?: ContextTokenUsage | undefined
  extras?: ContextExtras | undefined
}): ContextUsage | undefined {
  const { tokens, extras } = input
  if (!extras) return
  const inputTokens = tokens?.inputTokens ?? extras.legacyInputTokens
  if (inputTokens === undefined) return
  return {
    inputTokens,
    outputTokens: tokens?.outputTokens ?? extras.legacyOutputTokens ?? 0,
    contextWindow: extras.contextWindow,
    ...(extras.payload ? { payload: extras.payload } : {}),
  }
}

/**
 * 最近一条带有用量的 assistant 消息；成功压缩后旧用量不再代表当前上下文。
 * 官方提取器由调用方注入
 * （应用里传 `getThreadMessageTokenUsage`，保持本模块与运行时解耦）。
 */
export function latestContextUsage(
  messages: readonly { role?: string; metadata?: unknown; parts?: readonly unknown[] }[],
  readTokens: (message: { role?: string; metadata?: unknown }) => ContextTokenUsage | undefined,
): ContextUsage | undefined {
  return latestContextUsageState(messages, readTokens).usage
}

export function latestContextUsageState(
  messages: readonly { role?: string; metadata?: unknown; parts?: readonly unknown[] }[],
  readTokens: (message: { role?: string; metadata?: unknown }) => ContextTokenUsage | undefined,
): { usage?: ContextUsage; pendingAfterCompaction: boolean } {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index]
    if (message.role !== 'assistant') continue
    if (message.parts?.some(isSuccessfulCompaction)) return { pendingAfterCompaction: true }
    const usage = composeContextUsage({
      tokens: readTokens(message),
      extras: readContextExtras(message.metadata),
    })
    if (usage) return { usage, pendingAfterCompaction: false }
  }
  return { pendingAfterCompaction: false }
}

function isSuccessfulCompaction(part: unknown): boolean {
  if (!part || typeof part !== 'object') return false
  const candidate = part as { type?: unknown; data?: unknown }
  if (candidate.type !== 'data-pi-event' || !candidate.data || typeof candidate.data !== 'object')
    return false
  const event = candidate.data as { kind?: unknown; phase?: unknown }
  return event.kind === 'compaction' && event.phase === 'succeeded'
}

const charsOf = (payload: ContextPayloadMeasure, key: ContextSegmentKey): number =>
  key === 'system'
    ? payload.systemChars
    : key === 'tools'
      ? payload.toolChars
      : key === 'attachments'
        ? payload.attachmentChars
        : payload.conversationChars

/**
 * 分类值 = 以真实 payload 的字符量为权重，把官方的精确总量分配下去
 * （Pi 自己估算上下文同样用 ceil(chars / 4)）。总量精确、权重可测，取整用
 * 最大余数法保证各分类之和严格等于总量。
 *
 * 没有分类测量的消息（早于该口径落库）不退化成散文，而是用官方精确总量
 * 渲染单行"输入" + Headroom，保持官方卡片形状且不编造分类。
 */
export function buildContextBreakdown(usage: ContextUsage): ContextBreakdownView {
  const payload = usage.payload
  // 按**测量到的字符数**决定是否给出该分类：没有任何内容的分类不占一行
  // （element 只对 0 占比的色条跳过，行列表不过滤，所以过滤必须在这里做）。
  const present = payload ? SEGMENT_ORDER.filter((key) => charsOf(payload, key) > 0) : []
  const weights = payload ? present.map((key) => Math.ceil(charsOf(payload, key) / 4)) : []
  const totalWeight = weights.reduce((sum, weight) => sum + weight, 0)

  if (!payload || totalWeight <= 0) {
    return {
      segments: [{ key: 'input', tokens: usage.inputTokens }],
      used: usage.inputTokens,
      limit: usage.contextWindow,
    }
  }

  const exact = weights.map((weight) => (weight * usage.inputTokens) / totalWeight)
  const tokens = exact.map((value) => Math.floor(value))
  let remainder = usage.inputTokens - tokens.reduce((sum, value) => sum + value, 0)
  const byFraction = exact
    .map((value, index) => ({ index, fraction: value - Math.floor(value) }))
    .sort((a, b) => b.fraction - a.fraction || a.index - b.index)
  for (const entry of byFraction) {
    if (remainder <= 0) break
    tokens[entry.index] += 1
    remainder -= 1
  }

  return {
    segments: present.map((key, index) => ({ key, tokens: tokens[index] })),
    used: usage.inputTokens,
    limit: usage.contextWindow,
  }
}
