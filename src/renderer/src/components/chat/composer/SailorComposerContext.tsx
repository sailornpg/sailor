import { ComposerContext } from '@/components/assistant-ui/elements/composer'
import { useSailorChat } from '../runtime/SailorChatProvider'
import { latestContextUsage } from './contextUsage'

export function SailorComposerContext() {
  const { messages } = useSailorChat()
  const usage = latestContextUsage(messages)
  return <ComposerContext usage={usage ? {
    system: 0, tools: 0, messages: (usage.inputTokens + usage.outputTokens) / 1000,
    total: usage.contextWindow / 1000,
  } : { system: 0, tools: 0, messages: 0, total: 0 }}
    details={usage ? [
      { label: '输入（含系统、工具与历史）', value: usage.inputTokens / 1000 },
      { label: '输出', value: usage.outputTokens / 1000 },
    ] : []}
    note={usage ? `${usage.modelId} · 最近一次有效统计；压缩后的占用以下次调用为准。` : '暂无用量：旧消息未记录统计，或提供商未返回 token 用量。'}
    unavailable={!usage}
  />
}
