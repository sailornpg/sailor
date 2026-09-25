import { randomUUID } from 'node:crypto'
import {
  askUserRequestSchema,
  validateAskUserResponse,
  type AskUserInteractionResponse,
  type AskUserRequest,
  type AskUserResponse,
} from '../../../shared/askUser.js'

export type { AskUserInteractionResponse } from '../../../shared/askUser.js'

export interface AskUserInteractionContext {
  chatId: string
  runId: string
  toolCallId: string
}

export interface AskUserInteractionCreateInput extends AskUserInteractionContext {
  request: AskUserRequest
  interactionId?: string
}

export interface PendingAskUserInteraction {
  interactionId: string
  context: AskUserInteractionContext
  request: AskUserRequest
  promise: Promise<AskUserResponse>
}

interface PendingRecord extends PendingAskUserInteraction {
  expires: number
  resolve: (response: AskUserResponse) => void
  reject: (error: Error) => void
}

export interface AskUserInteractionStoreOptions {
  now?: () => number
  ttlMs?: number
}

export class AskUserInteractionStore {
  private readonly records = new Map<string, PendingRecord>()
  private readonly now: () => number
  private readonly ttlMs: number

  constructor(options: AskUserInteractionStoreOptions = {}) {
    this.now = options.now ?? Date.now
    this.ttlMs = options.ttlMs ?? 5 * 60_000
  }

  create(input: AskUserInteractionCreateInput): PendingAskUserInteraction {
    const request = askUserRequestSchema.parse(input.request)
    const interactionId = input.interactionId ?? randomUUID()
    let resolve!: (response: AskUserResponse) => void
    let reject!: (error: Error) => void
    const promise = new Promise<AskUserResponse>((resolvePromise, rejectPromise) => {
      resolve = resolvePromise
      reject = rejectPromise
    })
    const record: PendingRecord = {
      interactionId,
      context: {
        chatId: input.chatId,
        runId: input.runId,
        toolCallId: input.toolCallId,
      },
      request,
      promise,
      expires: this.now() + this.ttlMs,
      resolve,
      reject,
    }
    this.records.set(interactionId, record)
    return record
  }

  respond(input: AskUserInteractionResponse): void {
    const record = this.records.get(input.interactionId)
    if (!record || !this.matches(record, input) || record.expires < this.now()) {
      if (record?.expires !== undefined && record.expires < this.now())
        this.records.delete(input.interactionId)
      throw new Error('用户问题不存在、已处理或已失效。')
    }
    const response = validateAskUserResponse(record.request, input.response)
    this.records.delete(input.interactionId)
    record.resolve(response)
  }

  cancelRun(runId: string): void {
    this.cancelWhere((record) => record.context.runId === runId, '用户问题所属运行已取消。')
  }

  cancelChat(chatId: string): void {
    this.cancelWhere((record) => record.context.chatId === chatId, '用户问题所属会话已关闭。')
  }

  clear(): void {
    this.cancelWhere(() => true, '用户问题已失效，请重新发起。')
  }

  private matches(record: PendingRecord, input: AskUserInteractionResponse): boolean {
    return (
      record.context.chatId === input.chatId &&
      record.context.runId === input.runId &&
      record.context.toolCallId === input.toolCallId
    )
  }

  private cancelWhere(predicate: (record: PendingRecord) => boolean, message: string): void {
    for (const [id, record] of this.records) {
      if (!predicate(record)) continue
      this.records.delete(id)
      record.reject(new Error(message))
    }
  }
}
