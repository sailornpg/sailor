import type { ReactNode } from 'react'
import {
  ChevronDown,
  Folder,
  FolderOpen,
  PanelLeft,
  PanelLeftClose,
  Plus,
  Settings,
  SquarePen,
} from 'lucide-react'
import { WorkspaceThreadList } from '@/components/chat/sidebar/WorkspaceThreadList'
import type { ChatManagement, WorkspaceSnapshot } from '@shared/workspaces'
import { Button } from '@/components/ui/button'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { SIDEBAR_TOGGLE_SHORTCUT } from '@/lib/layout/useUiLayout'
import { formatShortcut, type PanelPlatform } from '@/lib/panels/shortcuts'
import { SailboatLogo } from '@/components/home/SailboatLogo'

interface ProjectSidebarProps {
  /** The pane separator, rendered inside the sidebar so it anchors to this column. */
  resizer?: ReactNode
  snapshot: WorkspaceSnapshot
  activeId: string | null
  loading: boolean
  error: string | null
  collapsed: boolean
  platform: PanelPlatform
  onOpenSettings: () => void
  onAddProject: () => void
  onNewChat: (projectId?: string) => void
  onSelect: (id: string) => void
  onCollapse: (id: string, open: boolean) => void
  onRetry: () => void
  onManage: (id: string, input: ChatManagement) => Promise<void>
  onToggleCollapsed: () => void
}

/** Collapsed rail keeps every top-level entry reachable as one icon row. */
function SidebarRail({
  resizer,
  platform,
  onAddProject,
  onNewChat,
  onOpenSettings,
  onToggleCollapsed,
}: {
  resizer?: ReactNode
  platform: PanelPlatform
  onAddProject: () => void
  onNewChat: (projectId?: string) => void
  onOpenSettings: () => void
  onToggleCollapsed: () => void
}) {
  return (
    <aside aria-label="Sailor 导航" className="sidebar sidebar-rail" data-collapsed="true">
      {resizer}
      <div className="window-drag h-12" />
      <div className="sidebar-rail-group">
        <SailboatLogo size={26} />
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              aria-label="展开侧边栏"
              className="icon-button"
              onClick={onToggleCollapsed}
              size="icon"
              type="button"
              variant="ghost"
            >
              <PanelLeft size={17} />
            </Button>
          </TooltipTrigger>
          <TooltipContent>
            展开侧边栏 · {formatShortcut(SIDEBAR_TOGGLE_SHORTCUT, platform)}
          </TooltipContent>
        </Tooltip>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              aria-label="新建会话"
              className="icon-button"
              onClick={() => onNewChat()}
              size="icon"
              type="button"
              variant="ghost"
            >
              <SquarePen size={17} />
            </Button>
          </TooltipTrigger>
          <TooltipContent>新建会话</TooltipContent>
        </Tooltip>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              aria-label="添加工作区"
              className="icon-button"
              onClick={onAddProject}
              size="icon"
              type="button"
              variant="ghost"
            >
              <Plus size={17} />
            </Button>
          </TooltipTrigger>
          <TooltipContent>选择本地目录</TooltipContent>
        </Tooltip>
      </div>
      <div className="sidebar-rail-group">
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              aria-label="设置"
              className="icon-button"
              onClick={onOpenSettings}
              size="icon"
              type="button"
              variant="ghost"
            >
              <Settings size={17} />
            </Button>
          </TooltipTrigger>
          <TooltipContent>设置</TooltipContent>
        </Tooltip>
      </div>
    </aside>
  )
}

export function ProjectSidebar({
  resizer,
  snapshot,
  activeId,
  loading,
  error,
  collapsed,
  platform,
  onOpenSettings,
  onAddProject,
  onNewChat,
  onSelect,
  onCollapse,
  onRetry,
  onManage,
  onToggleCollapsed,
}: ProjectSidebarProps) {
  if (collapsed) {
    return (
      <SidebarRail
        onAddProject={onAddProject}
        onNewChat={onNewChat}
        onOpenSettings={onOpenSettings}
        onToggleCollapsed={onToggleCollapsed}
        platform={platform}
        resizer={resizer}
      />
    )
  }
  return (
    <aside className="sidebar" data-collapsed="false">
      {resizer}
      <div className="window-drag h-12" />
      <div className="sidebar-header workspace-brand">
        <div className="workspace-brand-name">
          <SailboatLogo size={30} />
          <strong>Sailor</strong>
        </div>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              aria-expanded={!collapsed}
              aria-label="收起侧边栏"
              className="icon-button"
              onClick={onToggleCollapsed}
              size="icon"
              type="button"
              variant="ghost"
            >
              <PanelLeftClose size={16} />
            </Button>
          </TooltipTrigger>
          <TooltipContent>
            收起侧边栏 · {formatShortcut(SIDEBAR_TOGGLE_SHORTCUT, platform)}
          </TooltipContent>
        </Tooltip>
      </div>
      <Button className="new-chat-button" onClick={() => onNewChat()} variant="ghost">
        <SquarePen size={16} />
        新建会话
      </Button>
      <div className="workspace-section-heading">
        <span>工作区</span>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button aria-label="添加工作区" size="icon" variant="ghost" onClick={onAddProject}>
              <Plus size={16} />
            </Button>
          </TooltipTrigger>
          <TooltipContent>选择本地目录</TooltipContent>
        </Tooltip>
      </div>
      <nav aria-label="工作区与会话" className="chat-list">
        {loading && !snapshot.projects.length && (
          <p className="sidebar-empty" role="status">
            正在加载工作区…
          </p>
        )}
        {error && (
          <div className="sidebar-error" role="alert">
            {error}
            <button onClick={onRetry} type="button">
              重试加载
            </button>
          </div>
        )}
        {!loading && !error && !snapshot.projects.length && (
          <p className="sidebar-empty">暂无工作区，点击 + 添加</p>
        )}
        {snapshot.projects.map((project) => {
          const open = !snapshot.collapsedProjectIds.includes(project.id)
          const chats = snapshot.chats.filter(
            (chat) => chat.projectId === project.id && !chat.parentChatId,
          )
          return (
            <Collapsible
              key={project.id}
              open={open}
              onOpenChange={(value) => onCollapse(project.id, value)}
            >
              <div className="workspace-project-row">
                <CollapsibleTrigger className="workspace-project-trigger" title={project.rootPath}>
                  <ChevronDown size={13} className={open ? '' : 'collapsed-chevron'} />
                  {open ? <FolderOpen size={17} /> : <Folder size={17} />}
                  <span>{project.name}</span>
                </CollapsibleTrigger>
                <Button
                  aria-label={`在 ${project.name} 中新建会话`}
                  size="icon"
                  variant="ghost"
                  className="icon-button"
                  onClick={() => onNewChat(project.id)}
                >
                  <Plus size={14} />
                </Button>
              </div>
              <CollapsibleContent className="workspace-chat-group">
                {!chats.length && (
                  <button
                    className="workspace-empty-chat"
                    onClick={() => onNewChat(project.id)}
                    type="button"
                  >
                    新建第一个会话
                  </button>
                )}
                <WorkspaceThreadList
                  chats={chats}
                  activeId={activeId}
                  onSelect={onSelect}
                  onManage={onManage}
                />
              </CollapsibleContent>
            </Collapsible>
          )
        })}
      </nav>
      <div className="sidebar-footer">
        <button className="sidebar-action" onClick={onOpenSettings} type="button">
          <Settings size={16} />
          设置
        </button>
      </div>
    </aside>
  )
}
