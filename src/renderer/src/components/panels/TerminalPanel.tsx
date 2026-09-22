import { Terminal } from 'lucide-react'
import type { PanelProps } from '@/lib/panels/registry'
import { PanelPlaceholder } from './PanelPlaceholder'

export default function TerminalPanel({ context }: PanelProps) {
  return <PanelPlaceholder
    description="终端尚未启用。交互式 PTY 需要新增原生依赖并单独评审，因为那等于开放一条任意命令通道。"
    hint={context.chatId ? '下一步先提供本会话 agent 已执行命令与输出的只读记录。' : '先打开一个会话。'}
    icon={Terminal}
    title="终端"
  />
}
