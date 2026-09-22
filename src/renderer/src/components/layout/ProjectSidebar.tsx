import { ChevronDown, Folder, FolderOpen, Plus, Settings, SquarePen } from 'lucide-react'
import { WorkspaceThreadList } from '@/components/chat/sidebar/WorkspaceThreadList'
import type { ChatManagement, WorkspaceSnapshot } from '@shared/workspaces'
import { Button } from '@/components/ui/button'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'

interface ProjectSidebarProps {
  snapshot: WorkspaceSnapshot
  activeId: string | null
  loading: boolean
  error: string | null
  onOpenSettings: () => void
  onAddProject: () => void
  onNewChat: (projectId?: string) => void
  onSelect: (id: string) => void
  onCollapse: (id: string, open: boolean) => void
  onRetry: () => void
  onManage: (id: string, input: ChatManagement) => Promise<void>
}
export function ProjectSidebar({ snapshot, activeId, loading, error, onOpenSettings, onAddProject, onNewChat, onSelect, onCollapse, onRetry, onManage }: ProjectSidebarProps) {
  return (
    <aside className="sidebar">
      <div className="window-drag h-12" />
      <div className="sidebar-header workspace-brand"><strong>Sailor</strong></div>
      <Button className="new-chat-button" onClick={() => onNewChat()} variant="ghost"><SquarePen size={16} />新建会话</Button>
      <div className="workspace-section-heading"><span>工作区</span><Tooltip><TooltipTrigger asChild><Button aria-label="添加工作区" size="icon" variant="ghost" onClick={onAddProject}><Plus size={16} /></Button></TooltipTrigger><TooltipContent>选择本地目录</TooltipContent></Tooltip></div>
      <nav aria-label="工作区与会话" className="chat-list">
        {loading && !snapshot.projects.length && <p className="sidebar-empty" role="status">正在加载工作区…</p>}
        {error && <div className="sidebar-error" role="alert">{error}<button onClick={onRetry} type="button">重试加载</button></div>}
        {!loading && !error && !snapshot.projects.length && <p className="sidebar-empty">暂无工作区，点击 + 添加</p>}
        {snapshot.projects.map(project => {
          const open = !snapshot.collapsedProjectIds.includes(project.id)
          const chats = snapshot.chats.filter(chat => chat.projectId === project.id)
          return <Collapsible key={project.id} open={open} onOpenChange={value => onCollapse(project.id, value)}>
            <div className="workspace-project-row">
              <CollapsibleTrigger className="workspace-project-trigger" title={project.rootPath}>
                <ChevronDown size={13} className={open ? '' : 'collapsed-chevron'} />{open ? <FolderOpen size={17} /> : <Folder size={17} />}<span>{project.name}</span>
              </CollapsibleTrigger>
              <Button aria-label={`在 ${project.name} 中新建会话`} size="icon" variant="ghost" className="icon-button" onClick={() => onNewChat(project.id)}><Plus size={14} /></Button>
            </div>
            <CollapsibleContent className="workspace-chat-group">
              {!chats.length && <button className="workspace-empty-chat" onClick={() => onNewChat(project.id)} type="button">新建第一个会话</button>}
              <WorkspaceThreadList chats={chats} activeId={activeId} onSelect={onSelect} onManage={onManage} />
            </CollapsibleContent>
          </Collapsible>
        })}
      </nav>
      <div className="sidebar-footer"><button className="sidebar-action" onClick={onOpenSettings} type="button"><Settings size={16} />设置</button></div>
    </aside>
  )
}
