import type { Chat } from '@ai-sdk/react'
import type { UIMessage } from 'ai'
import type { ReactNode } from 'react'
import type { ModelSelection, ProjectSummary, SettingsSnapshot } from '@shared/contracts'
import type { WorkspaceChatSummary } from '@shared/workspaces'
import type { MessageQuote } from '@shared/messageQuote'
import type { WorkspaceChats } from '@/lib/WorkspaceChats'
import { SailorChatProvider } from './runtime/SailorChatProvider'
import { SailorThread } from './thread/SailorThread'

interface ChatWorkspaceProps {
  chat: Chat<UIMessage>
  summary?: WorkspaceChatSummary
  project?: ProjectSummary
  registry: WorkspaceChats
  switching: boolean
  onRetrySave: () => void
  settings: SettingsSnapshot
  onSelectModel: (selection: ModelSelection) => Promise<void>
  onOpenSettings: () => void
  onOpenSideChat: (question?: string, quote?: MessageQuote) => Promise<void>
  /** Panel picker and dock toggle, owned by the layout layer. */
  panelToolbar?: ReactNode
}

export function ChatWorkspace({
  chat,
  summary,
  project,
  registry,
  switching,
  onRetrySave,
  settings,
  onSelectModel,
  onOpenSettings,
  onOpenSideChat,
  panelToolbar,
}: ChatWorkspaceProps) {
  const isGenerating = summary?.status === 'running'

  return (
    <SailorChatProvider chat={chat}>
      <main className="workspace">
        <header className="topbar window-drag">
          <div className="title-group no-drag">
            <span className="workspace-current-title" title={summary?.title}>
              {summary?.title ?? '新会话'}
            </span>
            {switching && (
              <span className="muted" role="status">
                切换中…
              </span>
            )}
            <span className={isGenerating ? 'status-dot busy' : 'status-dot'} />
          </div>
          <div className="topbar-actions no-drag">
            {/* <span className="workspace-path" title={project?.rootPath}>{project?.name}</span> */}
            {panelToolbar}
          </div>
        </header>

        <SailorThread
          chatId={chat.id}
          onOpenSettings={onOpenSettings}
          onOpenSideChat={onOpenSideChat}
          onRetrySave={onRetrySave}
          onSelectModel={onSelectModel}
          project={project}
          registry={registry}
          settings={settings}
          summary={summary}
        />
      </main>
    </SailorChatProvider>
  )
}
