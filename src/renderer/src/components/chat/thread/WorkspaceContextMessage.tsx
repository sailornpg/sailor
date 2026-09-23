import {
  useAssistantDataUI,
  type DataMessagePartProps,
} from '@assistant-ui/react'
import { workspaceContextSchema } from '@shared/workspaceContext'
import { revealWorkspaceContext } from '../composer/WorkspaceContextChips'
import { Button } from '@/components/ui/button'
import { FileCode2, ExternalLink } from 'lucide-react'
export function WorkspaceContextMessage({ data }: DataMessagePartProps) {
  const parsed = workspaceContextSchema.safeParse(data)
  if (!parsed.success) return <span>引用格式无效。</span>
  const ref = parsed.data
  return (
    <details className="workspace-context-message">
      <summary>
        <FileCode2 className="workspace-context-message-icon" size={16} aria-hidden />
        <span className="workspace-context-message-path">{ref.relativePath}</span>
        <span className="workspace-context-message-range">
          {ref.kind === 'file' ? '整文件' : `L${ref.startLine}–${ref.endLine}`} · 快照
        </span>
      </summary>
      <pre>{ref.text}</pre>
      <Button
        size="sm"
        variant="ghost"
        onClick={() => revealWorkspaceContext(ref)}
      >
        <ExternalLink size={14} aria-hidden />
        打开当前文件
      </Button>
    </details>
  )
}
export function WorkspaceContextRenderer() {
  useAssistantDataUI({
    name: 'workspace-context',
    render: WorkspaceContextMessage,
  })
  return null
}
