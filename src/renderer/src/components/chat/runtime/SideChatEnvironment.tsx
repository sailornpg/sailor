import { createContext, useContext, type ReactNode } from 'react'
import type { ModelSelection, SettingsSnapshot } from '@shared/contracts'
import type { WorkspaceSnapshot } from '@shared/workspaces'
import type { WorkspaceChats } from '@/lib/WorkspaceChats'

export interface SideChatEnvironmentValue {
  registry: WorkspaceChats
  snapshot: WorkspaceSnapshot
  settings: SettingsSnapshot
  createChat(projectId?: string): Promise<void>
  createSideChat(parentChatId: string, question?: string): Promise<void>
  onSelectModel(selection: ModelSelection): Promise<void>
  onOpenSettings(): void
}

const SideChatEnvironmentContext = createContext<SideChatEnvironmentValue | null>(null)

export function SideChatEnvironment({
  value,
  children,
}: {
  value: SideChatEnvironmentValue
  children: ReactNode
}) {
  return (
    <SideChatEnvironmentContext.Provider value={value}>
      {children}
    </SideChatEnvironmentContext.Provider>
  )
}

export function useSideChatEnvironment(): SideChatEnvironmentValue {
  const value = useContext(SideChatEnvironmentContext)
  if (!value) throw new Error('SideChatPanel requires SideChatEnvironment')
  return value
}
