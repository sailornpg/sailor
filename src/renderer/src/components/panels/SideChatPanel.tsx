import { MessageSquarePlus } from 'lucide-react'
import type { PanelProps } from '@/lib/panels/registry'
import { PanelPlaceholder } from './PanelPlaceholder'

export default function SideChatPanel(_props: PanelProps) {
  return <PanelPlaceholder
    description="侧边聊天尚未接入。它会复用现有 chat 运行时，在同一窗口里再挂一个会话视图。"
    hint="同一个会话不会同时挂在两个视图上。"
    icon={MessageSquarePlus}
    title="侧边聊天"
  />
}
