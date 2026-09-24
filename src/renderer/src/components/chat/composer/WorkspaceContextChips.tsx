import { useWorkspaceContexts, workspaceContextDrafts } from '@/lib/workspaceContextDrafts'
import { requestPanelOpen } from '@/lib/panels/panelData'
import { Button } from '@/components/ui/button'
import { FileText, MessageSquareQuote, X } from 'lucide-react'
import type { WorkspaceContextData } from '@shared/workspaceContext'
import { ReferenceSummary } from './ReferenceSummary'
export function revealWorkspaceContext(data: WorkspaceContextData) {
  requestPanelOpen({
    panelId: 'files',
    data: {
      file: {
        projectId: data.projectId,
        path: data.relativePath,
        nonce: crypto.randomUUID(),
      },
    },
  })
}
export function WorkspaceContextChips({ chatId }: { chatId: string }) {
  const parts = useWorkspaceContexts(chatId)
  if (!parts.length) return null
  return (
    <ReferenceSummary
      icon={<MessageSquareQuote size={15} aria-hidden />}
      label={`${parts.length} 个已选文本片段`}
      title="已选文本片段"
      dismiss={
        <button
          type="button"
          className="workspace-context-clear"
          aria-label="清空已选文本片段"
          onClick={() =>
            parts.forEach(({ data }) => workspaceContextDrafts.remove(chatId, data.id))
          }
        >
          <X size={14} aria-hidden />
        </button>
      }
    >
      <div className="workspace-context-popover-list">
        {parts.map(({ data }) => (
          <div className="workspace-context-item" key={data.id}>
            <FileText size={14} aria-hidden />
            <button
              type="button"
              className="workspace-context-item-source"
              onClick={() => revealWorkspaceContext(data)}
              title={data.relativePath}
            >
              {data.relativePath}
              <span>{data.kind === 'file' ? '整文件' : `L${data.startLine}–${data.endLine}`}</span>
            </button>
            <Button
              size="icon"
              variant="ghost"
              aria-label={`移除引用 ${data.relativePath}`}
              onClick={() => workspaceContextDrafts.remove(chatId, data.id)}
            >
              <X size={14} />
            </Button>
          </div>
        ))}
      </div>
    </ReferenceSummary>
  )
}
