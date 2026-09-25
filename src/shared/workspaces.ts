import type { UIMessage } from 'ai'
import type { ChatSummary, ProjectSummary } from './contracts.js'
import type { PlanTodoList } from './planTodo.js'

export type RunStatus = 'idle' | 'running' | 'completed' | 'stopped' | 'error'
export interface WorkspaceChatSummary extends ChatSummary {
  archived?: boolean
  titleOverride?: string
  parentChatId?: string
  forkMessageId?: string
  runId: string | null
  status: RunStatus
  unread: boolean
  error: string | null
  saveError?: string
  plan?: PlanTodoList
}
export interface WorkspaceChat extends WorkspaceChatSummary {
  messages: UIMessage[]
  contextSnapshot?: string
  plan?: PlanTodoList
}
export interface WorkspacePreferences {
  activeChatId: string | null
  collapsedProjectIds: string[]
}
export interface WorkspaceSnapshot extends WorkspacePreferences {
  projects: ProjectSummary[]
  chats: WorkspaceChatSummary[]
}

export type ChatManagement =
  { action: 'rename'; title: string } | { action: 'archive' | 'unarchive' | 'delete' }
