import { getThreadMessageTokenUsage } from '@assistant-ui/ai-sdk'
import { ComposerContext } from '@/components/assistant-ui/elements/composer'
import { useSailorChat } from '../runtime/SailorChatProvider'
import {
  buildContextBreakdown,
  latestContextUsageState,
  type ContextSegmentKey,
} from './contextUsage'

// 配色取官方 context-breakdown demo 的原值（灰阶两档 + 蓝色两档，深色用 blue-400），
// 顺序与官方一致：系统 → 工具 → 附件 → 会话。这是数据可视化色，不是新的一套品牌色。
const SEGMENT_STYLE: Record<ContextSegmentKey, { label: string; tint: string }> = {
  system: { label: '系统提示词', tint: 'bg-foreground/45' },
  tools: { label: '工具定义', tint: 'bg-foreground/25' },
  attachments: { label: '附件', tint: 'bg-blue-500/60 dark:bg-blue-400/60' },
  conversation: { label: '会话', tint: 'bg-blue-500 dark:bg-blue-400' },
  // 旧消息没有分类测量，用 provider 精确总量渲染单行，保持官方卡片形状。
  input: { label: '输入（最近一次调用）', tint: 'bg-foreground/45' },
}

export function SailorComposerContext() {
  const { messages } = useSailorChat()
  // 总量走官方提取器（含 metadata.usage / custom.usage / steps 回退）；
  // 窗口上限与分类测量官方没有，由主进程写入的 contextUsage 补充。
  const { usage, pendingAfterCompaction } = latestContextUsageState(
    messages,
    getThreadMessageTokenUsage,
  )
  const breakdown = usage ? buildContextBreakdown(usage) : undefined

  return (
    <ComposerContext
      segments={breakdown?.segments.map((segment) => ({
        ...SEGMENT_STYLE[segment.key],
        tokens: segment.tokens,
      }))}
      limit={usage?.contextWindow}
      used={usage?.inputTokens}
      unavailableLabel={pendingAfterCompaction ? '压缩后用量将在下次调用后更新' : undefined}
    />
  )
}
