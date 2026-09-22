import { createHash, randomBytes } from 'node:crypto'
import type { ModelMessage, ToolApprovalStatus } from 'ai'
import type { WriteApprovalResponse } from '../../../src/shared/contracts.js'

const DEFAULT_TTL_MS = 5 * 60 * 1_000
const WRITE_TOOL_NAMES = new Set(['write_file', 'apply_patch'])

type ApprovalState = 'pending' | 'approved' | 'denied' | 'authorized' | 'consumed' | 'revoked' | 'expired'

interface ApprovalContext {
  chatId: string
  runId: string
}

interface ToolCallLike {
  toolCallId: string
  toolName: string
  input: unknown
}

interface ApprovalRecord {
  chatId: string
  originRunId: string
  authorizedRunId?: string
  toolCallId: string
  toolName: string
  inputHash: string
  summary: string
  scope: { kind: 'workspace-file'; path: string }
  approvalId?: string
  state: ApprovalState
  issuedAt: number
  expiresAt: number
}

interface WorkspaceWriteApprovalOptions {
  ttlMs?: number
  now?: () => number
  signingSecret?: Uint8Array
}

export interface ConsumeWriteGrantInput extends ApprovalContext, ToolCallLike {}

export interface WriteGrant {
  approvalId: string
  originRunId: string
  scope: ApprovalRecord['scope']
}

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize)
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, entry]) => [key, canonicalize(entry)]))
  }
  return value
}

function hashInput(input: unknown): string {
  return createHash('sha256').update(JSON.stringify(canonicalize(input))).digest('hex')
}

function describeCall(call: ToolCallLike): { summary: string; path: string } {
  const value = call.input && typeof call.input === 'object'
    ? call.input as Record<string, unknown>
    : {}
  const path = typeof value.path === 'string' && value.path ? value.path : '(未指定路径)'
  if (call.toolName === 'write_file') {
    const action = value.mode === 'overwrite' ? '覆盖' : '创建'
    return { path, summary: `请求${action}工作区文件 ${path}；授权仅适用于本次调用。` }
  }
  return { path, summary: `请求修改工作区文件 ${path}；授权仅适用于本次调用。` }
}

function findApprovalResponse(messages: ModelMessage[], toolCallId: string): {
  approvalId: string
  approved: boolean
} | undefined {
  const approvalIds = new Set<string>()
  for (const message of messages) {
    if (message.role !== 'assistant' || typeof message.content === 'string') continue
    for (const part of message.content) {
      if (part.type === 'tool-approval-request' && part.toolCallId === toolCallId) {
        approvalIds.add(part.approvalId)
      }
    }
  }
  for (const message of messages) {
    if (message.role !== 'tool') continue
    for (const part of message.content) {
      if (part.type === 'tool-approval-response' && approvalIds.has(part.approvalId)) {
        return { approvalId: part.approvalId, approved: part.approved }
      }
    }
  }
  return undefined
}

export class WorkspaceWriteApproval {
  readonly signingSecret: Uint8Array
  private readonly records = new Map<string, ApprovalRecord>()
  private readonly ttlMs: number
  private readonly now: () => number

  constructor(options: WorkspaceWriteApprovalOptions = {}) {
    this.ttlMs = options.ttlMs ?? DEFAULT_TTL_MS
    this.now = options.now ?? Date.now
    this.signingSecret = options.signingSecret ?? randomBytes(32)
  }

  createPolicy(context: ApprovalContext) {
    return async ({ toolCall, messages }: {
      toolCall: ToolCallLike
      messages: ModelMessage[]
    }): Promise<ToolApprovalStatus> => {
      if (!WRITE_TOOL_NAMES.has(toolCall.toolName)) return 'not-applicable'
      const response = findApprovalResponse(messages, toolCall.toolCallId)
      if (response) {
        if (!response.approved || !this.authorize(context, toolCall, response.approvalId)) {
          return { type: 'denied', reason: '写入授权与当前调用不匹配或已失效。' }
        }
        return { type: 'user-approval', reason: '已验证本次工作区写入授权。' }
      }
      return this.request(context, toolCall)
    }
  }

  respond(response: WriteApprovalResponse): void {
    const record = this.records.get(this.key(response.chatId, response.toolCallId))
    if (!record) throw new Error('审批请求不存在或已失效。')
    this.expire(record)
    if (record.state === 'expired') throw new Error('审批请求已过期。')
    if (record.state === 'revoked') throw new Error('审批请求已撤销或失效。')
    if (record.state !== 'pending') throw new Error('审批请求已处理或失效。')
    if (record.toolName !== response.toolName) throw new Error('审批请求与工具调用不匹配。')
    record.approvalId = response.approvalId
    record.state = response.approved ? 'approved' : 'denied'
  }

  consumeGrant(input: ConsumeWriteGrantInput): WriteGrant {
    const record = this.records.get(this.key(input.chatId, input.toolCallId))
    if (!record) throw new Error('写入授权不存在或已失效。')
    this.expire(record)
    if (record.state !== 'authorized') {
      const reason = record.state === 'denied' ? '写入授权已被拒绝或失效。' : '写入授权已使用或失效。'
      throw new Error(reason)
    }
    if (
      record.authorizedRunId !== input.runId
      || record.toolName !== input.toolName
      || record.inputHash !== hashInput(input.input)
    ) {
      throw new Error('写入授权与当前调用不匹配或已失效。')
    }
    record.state = 'consumed'
    return {
      approvalId: record.approvalId!,
      originRunId: record.originRunId,
      scope: { ...record.scope },
    }
  }

  revokeRun(runId: string): void {
    for (const record of this.records.values()) {
      if ((record.originRunId === runId || record.authorizedRunId === runId) && this.isOpen(record)) {
        record.state = 'revoked'
      }
    }
  }

  revokeChat(chatId: string): void {
    for (const record of this.records.values()) {
      if (record.chatId === chatId && this.isOpen(record)) record.state = 'revoked'
    }
  }

  private request(context: ApprovalContext, call: ToolCallLike): ToolApprovalStatus {
    const key = this.key(context.chatId, call.toolCallId)
    const existing = this.records.get(key)
    if (existing) {
      this.expire(existing)
      if (
        existing.state === 'pending'
        && existing.originRunId === context.runId
        && existing.toolName === call.toolName
        && existing.inputHash === hashInput(call.input)
      ) {
        return { type: 'user-approval', reason: existing.summary }
      }
      return { type: 'denied', reason: '写入授权与当前调用不匹配或已失效。' }
    }
    const { summary, path } = describeCall(call)
    const issuedAt = this.now()
    this.records.set(key, {
      chatId: context.chatId,
      originRunId: context.runId,
      toolCallId: call.toolCallId,
      toolName: call.toolName,
      inputHash: hashInput(call.input),
      summary,
      scope: { kind: 'workspace-file', path },
      state: 'pending',
      issuedAt,
      expiresAt: issuedAt + this.ttlMs,
    })
    return { type: 'user-approval', reason: summary }
  }

  private authorize(context: ApprovalContext, call: ToolCallLike, approvalId: string): boolean {
    const record = this.records.get(this.key(context.chatId, call.toolCallId))
    if (!record) return false
    this.expire(record)
    if (
      record.state !== 'approved'
      || record.approvalId !== approvalId
      || record.toolName !== call.toolName
      || record.inputHash !== hashInput(call.input)
    ) return false
    record.state = 'authorized'
    record.authorizedRunId = context.runId
    return true
  }

  private expire(record: ApprovalRecord): void {
    if (this.isOpen(record) && this.now() > record.expiresAt) record.state = 'expired'
  }

  private isOpen(record: ApprovalRecord): boolean {
    return ['pending', 'approved', 'authorized'].includes(record.state)
  }

  private key(chatId: string, toolCallId: string): string {
    return `${chatId}\0${toolCallId}`
  }
}
