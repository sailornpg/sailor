import { limitToolText, toolResultSchema, type ToolEffect, type ToolRecoveryAction } from '@shared/toolFeedback'

export const FILE_CHANGE_PREVIEW_CHARS = 4_096

export type FileChangePhase = 'pending' | 'applied' | 'failed' | 'cancelled'

export interface FileChangeFeedback {
  kind: 'file-change'
  phase: FileChangePhase
  path: string
  summary: string
  effects: ToolEffect
  preview?: { text: string; originalLength: number; truncated: boolean }
  changes?: { addedLines: number; removedLines: number }
  beforeHash?: string
  afterHash?: string
  diffRef?: { id: string; kind: string; label?: string }
  errorCode?: string
  errorMessage?: string
  recovery?: ToolRecoveryAction[]
}

export interface FileChangeFeedbackInput {
  toolName: string
  args?: unknown
  result?: unknown
  status: 'requires-action' | 'running' | 'complete' | 'error' | 'cancelled'
}

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' ? value as Record<string, unknown> : null
}

function pathFrom(args: unknown, result: unknown): string {
  const resultData = record(record(result)?.ok === true ? record(result)?.data : undefined)
  const argsPath = record(args)?.path
  return typeof resultData?.path === 'string'
    ? resultData.path
    : typeof argsPath === 'string' ? argsPath : '(未指定路径)'
}

function previewFrom(args: unknown) {
  const patch = record(args)?.patch
  return typeof patch === 'string' ? limitToolText(patch, FILE_CHANGE_PREVIEW_CHARS) : undefined
}

export function projectFileChangeFeedback(input: FileChangeFeedbackInput): FileChangeFeedback | null {
  if (input.toolName !== 'apply_patch') return null
  const path = pathFrom(input.args, input.result)
  const preview = previewFrom(input.args)
  if (input.status === 'cancelled') {
    return { kind: 'file-change', phase: 'cancelled', path, summary: `补丁应用已停止：${path}`, effects: { kind: 'none' }, preview }
  }
  const parsed = toolResultSchema.safeParse(input.result)
  if (!parsed.success) {
    if (input.result === undefined) {
      return { kind: 'file-change', phase: 'pending', path, summary: `等待应用补丁：${path}`, effects: { kind: 'none' }, preview }
    }
    return null
  }
  if (!parsed.data.ok) {
    return {
      kind: 'file-change', phase: 'failed', path, summary: parsed.data.summary, effects: parsed.data.effects,
      errorCode: parsed.data.error.code, errorMessage: parsed.data.error.message, recovery: parsed.data.error.recovery, preview,
    }
  }
  const data = record(parsed.data.data)
  if (!data || typeof data.path !== 'string') return null
  const changes = record(data.changes)
  const diffRef = record(data.diffRef)
  return {
    kind: 'file-change', phase: 'applied', path: data.path, summary: parsed.data.summary,
    effects: parsed.data.effects,
    ...(preview ? { preview } : {}),
    ...(changes && typeof changes.addedLines === 'number' && typeof changes.removedLines === 'number'
      ? { changes: { addedLines: changes.addedLines, removedLines: changes.removedLines } } : {}),
    ...(typeof data.beforeHash === 'string' ? { beforeHash: data.beforeHash } : {}),
    ...(typeof data.afterHash === 'string' ? { afterHash: data.afterHash } : {}),
    ...(diffRef && typeof diffRef.id === 'string' && typeof diffRef.kind === 'string'
      ? { diffRef: { id: diffRef.id, kind: diffRef.kind, ...(typeof diffRef.label === 'string' ? { label: diffRef.label } : {}) } } : {}),
  }
}
