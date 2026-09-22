import { useState } from 'react'
import { WebPreview } from '@/components/assistant-ui/elements/web-preview'

type InspectorTab = 'changes' | 'files' | 'terminal'
const labels: Record<InspectorTab, string> = { changes: '更改', files: '文件', terminal: '终端' }
const descriptions: Record<InspectorTab, string> = {
  changes: '尚未接入工作区 Git 更改。',
  files: '工作区目录已关联，文件浏览尚未接入。',
  terminal: '终端执行尚未启用。',
}
export interface WebPreviewState { url: string; content: string; title: string }
export function InspectorPanel({ preview }: { preview?: WebPreviewState }) {
  const [tab, setTab] = useState<InspectorTab>('changes')
  return <aside className="inspector">
    <div className="inspector-tabs" role="tablist">
      {(['changes', 'files', 'terminal'] as const).map(item => <button aria-selected={tab === item} className={tab === item ? 'active' : ''} key={item} onClick={() => setTab(item)} role="tab" type="button">{labels[item]}</button>)}
    </div>
    <div className="empty-diff" role="tabpanel">
      {preview ? <WebPreview origin={new URL(preview.url).hostname} loading={false} onOpenExternal={() => window.open(preview.url, '_blank')}>
        <div className="space-y-2 overflow-auto p-3 text-xs"><h2 className="font-medium">{preview.title}</h2><pre className="whitespace-pre-wrap leading-relaxed">{preview.content}</pre></div>
      </WebPreview> : descriptions[tab]}
    </div>
  </aside>
}
