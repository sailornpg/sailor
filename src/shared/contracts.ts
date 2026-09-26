import type {
  WorkspaceChat,
  WorkspacePreferences,
  WorkspaceSnapshot,
  ChatManagement,
} from './workspaces.js'
import type { TerminalApi } from './terminal.js'
import type { UIMessage, UIMessageChunk } from 'ai'
import { askUserInteractionResponseSchema, type AskUserInteractionResponse } from './askUser.js'

export { askUserInteractionResponseSchema }
export type { AskUserInteractionResponse }

export type ChatId = string
export type ThinkingLevel =
  'provider-default' | 'off' | 'minimal' | 'low' | 'medium' | 'high' | 'xhigh' | 'max'

/** @deprecated Use ThinkingLevel. Kept for persisted requests and older callers. */
export type ReasoningEffort = ThinkingLevel | 'none'

const thinkingLevelOrder: ThinkingLevel[] = [
  'provider-default',
  'off',
  'minimal',
  'low',
  'medium',
  'high',
  'xhigh',
  'max',
]

export function getAvailableThinkingLevels(): ThinkingLevel[] {
  return [...thinkingLevelOrder]
}

export function toPiThinkingLevel(
  level: ThinkingLevel | 'none',
): Exclude<ThinkingLevel, 'provider-default'> | undefined {
  if (level === 'provider-default') return undefined
  if (level === 'none') return 'off'
  return level
}

export function normalizeThinkingLevel(
  thinkingLevel: ThinkingLevel | 'none' | undefined,
  legacyReasoning?: ReasoningEffort,
): ThinkingLevel {
  if (thinkingLevel === 'none') return 'off'
  if (thinkingLevel) return thinkingLevel
  if (legacyReasoning === 'none') return 'off'
  return legacyReasoning ?? 'provider-default'
}

const reasoningEffortOrder: ReasoningEffort[] = ['minimal', 'low', 'medium', 'high', 'xhigh']

export function getAvailableReasoningEfforts(levels: string[]): ReasoningEffort[] {
  const configured = new Set(levels)
  const supported = reasoningEffortOrder.filter((level) => configured.has(level))
  return supported.length === 0 ? ['provider-default'] : ['provider-default', 'none', ...supported]
}

export function resolveReasoningEffort(
  selected: ReasoningEffort,
  levels: string[],
): ReasoningEffort {
  return getAvailableReasoningEfforts(levels).includes(selected) ? selected : 'provider-default'
}

export interface ProjectSummary {
  id: string
  name: string
  rootPath: string
  permissionMode?: WorkspacePermissionMode
}

export type WorkspacePermissionMode = 'allow-reads' | 'allow-edits' | 'allow-all'

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
  thinkingLevel?: ThinkingLevel
  /** @deprecated Use thinkingLevel. */
  reasoning?: ReasoningEffort
}

export interface WriteApprovalResponse {
  chatId: ChatId
  approvalId: string
  toolCallId: string
  toolName: string
  approved: boolean
  reason?: string
  optionId?: string
  text?: string
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

export interface WorkspaceFilesListInput {
  projectId: string
  path?: string
  cursor?: string
}

export interface WorkspaceFilesReadInput {
  projectId: string
  path: string
}

export interface WorkspaceFileTreeEntry {
  name: string
  relativePath: string
  kind: 'file' | 'directory'
  size?: number
  modifiedAt?: number
  previewable?: boolean
}

export interface WorkspaceFileTreePage {
  entries: WorkspaceFileTreeEntry[]
  nextCursor?: string
}

export interface WorkspaceFilePreview {
  relativePath: string
  language: string | null
  content: string
  lineCount: number
  byteLength: number
  sha256: string
  truncated: boolean
  previewable: boolean
  reason?: string
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

export type AgentRunEvent = { type: 'chunk'; chunk: UIMessageChunk } | { type: 'end' }

export interface SailorApi {
  app: {
    getVersion(): Promise<string>
  }
  agent: {
    start(request: AgentRunRequest): Promise<void>
    abort(runId: string): Promise<void>
    respondToApproval(response: WriteApprovalResponse): Promise<void>
    respondToAskUser(response: AskUserInteractionResponse): Promise<void>
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
    createSideChat(parentChatId: string): Promise<WorkspaceChat>
    getChat(chatId: string): Promise<WorkspaceChat>
    setPermission(input: { projectId: string; mode: WorkspacePermissionMode }): Promise<void>
    setPreferences(input: Partial<WorkspacePreferences>): Promise<void>
    files: {
      list(input: WorkspaceFilesListInput): Promise<WorkspaceFileTreePage>
      read(input: WorkspaceFilesReadInput): Promise<WorkspaceFilePreview>
    }
  }
  settings: {
    getSnapshot(): Promise<SettingsSnapshot>
    saveProvider(input: ProviderInput): Promise<SettingsSnapshot>
    deleteProvider(providerId: string): Promise<SettingsSnapshot>
    setActiveModel(selection: ModelSelection): Promise<SettingsSnapshot>
    fetchModels(input: FetchProviderModelsInput): Promise<string[]>
  }
  /** User-driven host terminal; the agent runtime never receives this surface. */
  terminal: TerminalApi
}

export const IPC = {
  workspaceManageChat: 'workspace:manage-chat',
  workspaceChanged: 'workspace:changed',
  workspaceRetrySave: 'workspace:retry-save',
  workspaceSnapshot: 'workspace:snapshot',
  workspacePick: 'workspace:pick',
  workspaceCreateChat: 'workspace:create-chat',
  workspaceCreateSideChat: 'workspace:create-side-chat',
  workspaceGetChat: 'workspace:get-chat',
  workspacePermission: 'workspace:permission',
  workspacePreferences: 'workspace:preferences',
  workspaceFilesList: 'workspace-files:list',
  workspaceFilesRead: 'workspace-files:read',
  appVersion: 'app:version',
  agentStart: 'agent:start',
  agentAbort: 'agent:abort',
  agentRespondToApproval: 'agent:respond-to-approval',
  agentRespondToAskUser: 'agent:respond-to-ask-user',
  agentRevokeApprovals: 'agent:revoke-approvals',
  agentEvent: 'agent:event',
  settingsProviders: 'settings:providers',
  settingsSaveProvider: 'settings:save-provider',
  settingsDeleteProvider: 'settings:delete-provider',
  settingsSetActiveModel: 'settings:set-active-model',
  settingsFetchModels: 'settings:fetch-models',
  terminalCreate: 'terminal:create',
  terminalList: 'terminal:list',
  terminalAttach: 'terminal:attach',
  terminalDetach: 'terminal:detach',
  terminalWrite: 'terminal:write',
  terminalResize: 'terminal:resize',
  terminalTerminate: 'terminal:terminate',
  terminalEvent: 'terminal:event',
} as const
