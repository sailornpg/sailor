export type DiffLine = { kind: 'context' | 'added' | 'removed'; text: string }
export type FileChangeState = 'current' | 'stale' | 'unavailable'
export type FileChangeTurnStatus = 'running' | 'completed' | 'stopped' | 'error'

export interface FileChange {
  id: string
  chatId: string
  turnId: string
  runId: string
  path: string
  kind: 'added' | 'modified' | 'deleted'
  beforeHash: string | null
  afterHash: string | null
  state: FileChangeState
  addedLines: number | null
  removedLines: number | null
  lines: readonly DiffLine[]
  truncated: boolean
}

export interface ChatFileChangeSummary {
  chatId: string
  turnId?: string
  status?: FileChangeTurnStatus
  fileCount: number
  addedLines: number | null
  removedLines: number | null
  hasUntrackedHostExec: boolean
  hasTrackingError: boolean
  hasIncompleteDiff: boolean
  changes: readonly FileChange[]
}

export interface TurnFileChangeSummary extends ChatFileChangeSummary {
  turnId: string
  status: FileChangeTurnStatus
}
