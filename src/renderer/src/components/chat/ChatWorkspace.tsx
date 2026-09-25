import type { Chat } from '@ai-sdk/react'
import type { UIMessage } from 'ai'
import { Component, type ErrorInfo, type ReactNode } from 'react'
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

class ChatRenderBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false }

  static getDerivedStateFromError(): { failed: boolean } {
    return { failed: true }
  }

  componentDidCatch(error: unknown, _info: ErrorInfo) {
    // Keep the shell usable when an untrusted streamed part cannot be rendered.
    // The next chat selection remounts this boundary and gives the runtime a clean view.
    console.error('[sailor] chat render failed', error)
  }

  render() {
    if (!this.state.failed) return this.props.children
    return (
      <main className="workspace flex items-center justify-center p-6">
        <div className="border-destructive/30 bg-destructive/5 text-destructive max-w-md rounded-xl border p-5 text-sm">
          <h2 className="mb-2 text-base font-medium">这条回答暂时无法显示</h2>
          <p className="text-destructive/80">
            回答数据出现异常，当前会话仍然保留。请重新打开会话后再试。
          </p>
          <button
            type="button"
            className="border-destructive/30 hover:bg-destructive/10 mt-4 rounded-md border px-3 py-1.5"
            onClick={() => window.location.reload()}
          >
            重新加载界面
          </button>
        </div>
      </main>
    )
  }
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
    <ChatRenderBoundary key={chat.id}>
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
    </ChatRenderBoundary>
  )
}
