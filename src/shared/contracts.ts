import type { WorkspaceChat, WorkspacePreferences, WorkspaceSnapshot, ChatManagement } from './workspaces.js'
import type { UIMessage, UIMessageChunk } from 'ai'

export type ChatId = string
export type ReasoningEffort =
  | 'provider-default'
  | 'none'
  | 'minimal'
  | 'low'
  | 'medium'
  | 'high'
  | 'xhigh'

const reasoningEffortOrder: ReasoningEffort[] = [
  'minimal',
  'low',
  'medium',
  'high',
  'xhigh',
]

export function getAvailableReasoningEfforts(levels: string[]): ReasoningEffort[] {
  const configured = new Set(levels)
  const supported = reasoningEffortOrder.filter((level) => configured.has(level))
  return supported.length === 0
    ? ['provider-default']
    : ['provider-default', 'none', ...supported]
}

export function resolveReasoningEffort(
  selected: ReasoningEffort,
  levels: string[],
): ReasoningEffort {
  return getAvailableReasoningEfforts(levels).includes(selected)
    ? selected
    : 'provider-default'
}

export interface ProjectSummary {
  id: string
  name: string
  rootPath: string
}

export interface ChatSummary {
  id: ChatId
  projectId: string
  title: string
  updatedAt: number
}

export interface AgentRunRequest {
  runId: string
  chatId: ChatId
  messages: UIMessage[]
  reasoning: ReasoningEffort
}

export interface WriteApprovalResponse {
  chatId: ChatId
  approvalId: string
  toolCallId: string
  toolName: string
  approved: boolean
  reason?: string
}

export type ProviderProtocol = 'openai-completions' | 'openai-responses' | 'anthropic-messages'
export type ProviderKind = 'builtin' | 'custom'

export interface ModelConfig {
  id: string
  name: string
  contextWindow: number | null
  maxOutputTokens: number | null
  reasoningLevels: string[]
  vision: boolean
}

export interface ProviderInput {
  id: string
  name: string
  baseUrl: string
  protocol: ProviderProtocol
  apiKey?: string
  models: ModelConfig[]
}

export interface ProviderSummary extends Omit<ProviderInput, 'apiKey'> {
  kind: ProviderKind
  hasApiKey: boolean
}

export interface ModelSelection {
  providerId: string
  modelId: string
}

export interface FetchProviderModelsInput {
  providerId: string
  baseUrl: string
  apiKey?: string
}

export interface SettingsSnapshot {
  providers: ProviderSummary[]
  activeModel: ModelSelection | null
}

export interface ResolvedModel extends ModelSelection {
  providerName: string
  baseUrl: string
  protocol: ProviderProtocol
  apiKey: string
  reasoningLevels: string[]
  maxOutputTokens?: number
  contextWindow?: number
  vision?: boolean
}

export type AgentRunEvent =
  | { type: 'chunk'; chunk: UIMessageChunk }
  | { type: 'end' }

export interface SailorApi {
  app: {
    getVersion(): Promise<string>
  }
  agent: {
    start(request: AgentRunRequest): Promise<void>
    abort(runId: string): Promise<void>
    respondToApproval(response: WriteApprovalResponse): Promise<void>
    revokeApprovals(chatId: ChatId): Promise<void>
    subscribe(listener: (runId: string, event: AgentRunEvent) => void): () => void
  }
  workspaces: {
    manageChat(chatId: string, input: ChatManagement): Promise<void>
    snapshot(): Promise<WorkspaceSnapshot>
    subscribe(listener: () => void): () => void
    retrySave(chatId: string): Promise<void>
    pickProject(): Promise<ProjectSummary | null>
    createChat(projectId: string): Promise<WorkspaceChat>
    getChat(chatId: string): Promise<WorkspaceChat>
    setPreferences(input: Partial<WorkspacePreferences>): Promise<void>
  }
  settings: {
    getSnapshot(): Promise<SettingsSnapshot>
    saveProvider(input: ProviderInput): Promise<SettingsSnapshot>
    deleteProvider(providerId: string): Promise<SettingsSnapshot>
    setActiveModel(selection: ModelSelection): Promise<SettingsSnapshot>
    fetchModels(input: FetchProviderModelsInput): Promise<string[]>
  }
}

export const IPC = {
  workspaceManageChat: 'workspace:manage-chat',
  workspaceChanged: 'workspace:changed',
  workspaceRetrySave: 'workspace:retry-save',
  workspaceSnapshot: 'workspace:snapshot',
  workspacePick: 'workspace:pick',
  workspaceCreateChat: 'workspace:create-chat',
  workspaceGetChat: 'workspace:get-chat',
  workspacePreferences: 'workspace:preferences',
  appVersion: 'app:version',
  agentStart: 'agent:start',
  agentAbort: 'agent:abort',
  agentRespondToApproval: 'agent:respond-to-approval',
  agentRevokeApprovals: 'agent:revoke-approvals',
  agentEvent: 'agent:event',
  settingsProviders: 'settings:providers',
  settingsSaveProvider: 'settings:save-provider',
  settingsDeleteProvider: 'settings:delete-provider',
  settingsSetActiveModel: 'settings:set-active-model',
  settingsFetchModels: 'settings:fetch-models',
} as const
