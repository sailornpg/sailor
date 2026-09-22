import { FileDiff } from 'lucide-react'
import type { PanelProps } from '@/lib/panels/registry'
import { PanelPlaceholder } from './PanelPlaceholder'

export default function ReviewPanel({ context }: PanelProps) {
  return <PanelPlaceholder
    description="会话内的文件改动聚合与工作区 Git diff 都还没有接入，这里不会显示任何推测的改动。"
    hint={context.chatId ? '接入后，本会话的写入会按文件列出前后差异。' : '先打开一个会话。'}
    icon={FileDiff}
    title="审查"
  />
}
