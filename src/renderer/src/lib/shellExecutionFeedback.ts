import { toolResultSchema, type ToolRecoveryAction } from '@shared/toolFeedback'

export interface ShellExecutionFeedback {
  kind: 'shell-execution'
  phase: 'pending' | 'running' | 'succeeded' | 'failed' | 'cancelled'
  command: string
  cwd: string
  timeoutMs?: number
  summary: string
  stdoutTail?: string
  stderrTail?: string
  exitCode?: number | null
  signal?: string | null
  terminationReason?: string
  truncated: boolean
  logRef?: { id: string; kind: string; label?: string }
  errorMessage?: string
  recovery?: ToolRecoveryAction[]
}

interface FeedbackInput { toolName: string; args?: unknown; result?: unknown; status: 'requires-action' | 'running' | 'complete' | 'error' | 'cancelled' }
const record = (value: unknown): Record<string, unknown> | null => value && typeof value === 'object' ? value as Record<string, unknown> : null

export function projectShellExecutionFeedback(input: FeedbackInput): ShellExecutionFeedback | null {
  if (input.toolName !== 'execute_shell') return null
  const args = record(input.args)
  const base = {
    kind: 'shell-execution' as const,
    command: typeof args?.command === 'string' ? args.command : '(未指定命令)',
    cwd: typeof args?.cwd === 'string' ? args.cwd : '.',
    ...(typeof args?.timeoutMs === 'number' ? { timeoutMs: args.timeoutMs } : {}),
  }
  if (input.status === 'cancelled') return { ...base, phase: 'cancelled', summary: '命令已停止', truncated: false }
  const parsed = toolResultSchema.safeParse(input.result)
  if (!parsed.success) {
    if (input.result !== undefined) return null
    return { ...base, phase: input.status === 'running' ? 'running' : 'pending', summary: input.status === 'running' ? '正在执行命令' : '等待批准本机命令', truncated: false }
  }
  const details = record(parsed.data.ok ? parsed.data.data : parsed.data.error.details)
  const logRef = parsed.data.artifactRefs?.find(item => item.kind === 'shell-log')
  const common = {
    ...base,
    summary: parsed.data.summary,
    truncated: parsed.data.truncated,
    ...(typeof details?.stdoutTail === 'string' ? { stdoutTail: details.stdoutTail } : {}),
    ...(typeof details?.stderrTail === 'string' ? { stderrTail: details.stderrTail } : {}),
    ...(typeof details?.exitCode === 'number' || details?.exitCode === null ? { exitCode: details.exitCode as number | null } : {}),
    ...(typeof details?.signal === 'string' || details?.signal === null ? { signal: details.signal as string | null } : {}),
    ...(typeof details?.terminationReason === 'string' ? { terminationReason: details.terminationReason } : {}),
    ...(logRef ? { logRef } : {}),
  }
  return parsed.data.ok
    ? { ...common, phase: 'succeeded' }
    : { ...common, phase: parsed.data.error.code === 'CANCELLED' ? 'cancelled' : 'failed', errorMessage: parsed.data.error.message, recovery: parsed.data.error.recovery }
}

export function createShellLogThrottle(intervalMs: number, now: () => number = Date.now) {
  let lastSent = Number.NEGATIVE_INFINITY
  let pending = ''
  return {
    push(chunk: string): string | null {
      pending += chunk
      const current = now()
      if (current - lastSent < intervalMs) return null
      lastSent = current
      const value = pending
      pending = ''
      return value
    },
  }
}
