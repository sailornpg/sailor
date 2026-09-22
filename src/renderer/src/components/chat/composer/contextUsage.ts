export interface ContextUsage {
  inputTokens: number
  outputTokens: number
  contextWindow: number
  modelId: string
}

export function readContextUsage(metadata: unknown): ContextUsage | undefined {
  if (!metadata || typeof metadata !== 'object' || !('contextUsage' in metadata)) return
  const value = metadata.contextUsage
  if (!value || typeof value !== 'object') return
  const usage = value as ContextUsage
  if (![usage.inputTokens, usage.outputTokens, usage.contextWindow].every(value => Number.isSafeInteger(value) && value >= 0)
    || usage.contextWindow === 0 || typeof usage.modelId !== 'string') return
  return usage
}

export function latestContextUsage(messages: readonly { role: string; metadata?: unknown }[]): ContextUsage | undefined {
  for (let index = messages.length - 1; index >= 0; index--) {
    const message = messages[index]
    if (message.role !== 'assistant') continue
    const usage = readContextUsage(message.metadata)
    if (usage) return usage
  }
}
