import type { PiHarnessSettings } from '@ai-sdk/harness-pi'
import {
  normalizeThinkingLevel,
  toPiThinkingLevel,
  type ReasoningEffort,
  type ResolvedModel,
} from '../../../shared/contracts.js'

export const DEFAULT_PI_CONTEXT_WINDOW = 128_000
export const DEFAULT_PI_MAX_OUTPUT_TOKENS = 8_192

export function createPiConfiguration(
  config: ResolvedModel,
  reasoning: ReasoningEffort,
): { model: string; settings: PiHarnessSettings } {
  const contextWindow =
    config.contextWindow && Number.isSafeInteger(config.contextWindow)
      ? config.contextWindow
      : DEFAULT_PI_CONTEXT_WINDOW
  const maxOutputTokens =
    config.maxOutputTokens && Number.isSafeInteger(config.maxOutputTokens)
      ? config.maxOutputTokens
      : DEFAULT_PI_MAX_OUTPUT_TOKENS
  if (maxOutputTokens >= contextWindow) throw new Error('模型最大输出 token 必须小于上下文窗口。')
  const thinkingLevel = toPiThinkingLevel(normalizeThinkingLevel(undefined, reasoning))
  return {
    model: `sailor/${config.modelId}`,
    settings: {
      auth: { SAILOR_API_KEY: config.apiKey, SAILOR_BASE_URL: config.baseUrl },
      providers: {
        sailor: {
          api: config.protocol,
          baseUrl: config.baseUrl,
          models: [
            {
              id: config.modelId,
              name: config.modelId,
              reasoning: config.reasoningLevels.length > 0,
              input: config.vision ? ['text', 'image'] : ['text'],
              ...(config.protocol === 'openai-completions'
                ? { compat: { supportsFinishReason: false } }
                : {}),
              contextWindow,
              maxTokens: maxOutputTokens,
              cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
            },
          ],
        },
      },
      ...(thinkingLevel === undefined ? {} : { thinkingLevel }),
    },
  }
}
