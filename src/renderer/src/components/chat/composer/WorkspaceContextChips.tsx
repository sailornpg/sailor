import {
  useWorkspaceContexts,
  workspaceContextDrafts,
} from '@/lib/workspaceContextDrafts'
import { requestPanelOpen } from '@/lib/panels/panelData'
import { Button } from '@/components/ui/button'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/assistant-ui/elements/popover'
import { FileText, MessageSquareQuote, X } from 'lucide-react'
import type { WorkspaceContextData } from '@shared/workspaceContext'
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
    <Popover>
      <PopoverTrigger asChild>
        <div className="workspace-context-summary" role="button" tabIndex={0} aria-label="查看已选文本片段">
          <MessageSquareQuote size={15} aria-hidden />
          <span>{parts.length} 个已选文本片段</span>
          <button type="button" className="workspace-context-clear" aria-label="清空已选文本片段" onClick={(event) => { event.stopPropagation(); parts.forEach(({ data }) => workspaceContextDrafts.remove(chatId, data.id)) }}><X size={14} /></button>
        </div>
      </PopoverTrigger>
      <PopoverContent className="workspace-context-popover" align="start" side="top">
        <div className="workspace-context-popover-title">已选文本片段</div>
        <div className="workspace-context-popover-list">
          {parts.map(({ data }) => <div className="workspace-context-item" key={data.id}>
            <FileText size={14} aria-hidden />
            <button type="button" className="workspace-context-item-source" onClick={() => revealWorkspaceContext(data)} title={data.relativePath}>{data.relativePath}<span>{data.kind === 'file' ? '整文件' : `L${data.startLine}–${data.endLine}`}</span></button>
            <Button size="icon" variant="ghost" aria-label={`移除引用 ${data.relativePath}`} onClick={() => workspaceContextDrafts.remove(chatId, data.id)}><X size={14} /></Button>
          </div>)}
        </div>
      </PopoverContent>
    </Popover>
  )
}
