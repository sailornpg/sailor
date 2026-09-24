import { randomUUID } from 'node:crypto'
import { z } from 'zod'
import {
  TERMINAL_LIMITS,
  terminalInputBytes,
  type TerminalAttachResult,
  type TerminalEvent,
  type TerminalIpcEvent,
  type TerminalLimits,
  type TerminalSessionInfo,
} from '../../shared/terminal.js'
import { TerminalError, type TerminalService } from './TerminalService.js'
import { TerminalSubscriberQueue, type TerminalSchedule } from './TerminalOutputBuffer.js'

export const TERMINAL_SUBSCRIPTION_LIMIT = 8
export const MAX_SUBSCRIPTION_ID_LENGTH = 64

/** The main window's webContents, reduced to what routing and teardown need. */
export interface TerminalSender {
  readonly id: number
  isDestroyed(): boolean
  send(payload: TerminalIpcEvent): void
}

export interface TerminalIpcOptions {
  service: TerminalService
  isTrustedSender(sender: TerminalSender): boolean
  limits?: Partial<TerminalLimits>
  generateSubscriptionId?: () => string
  /** Injectable timer for deterministic delivery batching. */
  schedule?: TerminalSchedule
}

interface Subscription {
  projectId: string
  sessionId: string
  sender: TerminalSender
  queue: TerminalSubscriberQueue
}

function buildSchemas(limits: TerminalLimits) {
  const projectId = z.string().min(1).max(200)
  const sessionId = z.string().min(1).max(200)
  const cols = z.number().int().min(limits.minCols).max(limits.maxCols)
  const rows = z.number().int().min(limits.minRows).max(limits.maxRows)
  const session = z.strictObject({ projectId, sessionId })
  return {
    create: z.strictObject({ projectId, cols, rows }),
    list: z.strictObject({ projectId }),
    session,
    attach: z.strictObject({ projectId, sessionId, sinceSeq: z.number().int().min(0).optional() }),
    write: z.strictObject({
      projectId,
      sessionId,
      data: z.string().refine(value => terminalInputBytes(value) <= limits.maxWriteBytes),
    }),
    resize: z.strictObject({ projectId, sessionId, cols, rows }),
    detach: z.string().min(1).max(MAX_SUBSCRIPTION_ID_LENGTH),
  }
}

/**
 * The only bridge between the renderer's terminal panel and the PTY service.
 * Every request is validated here: trusted sender, strict payload shape, session
 * ownership, and bounded input. Extra keys (an executable path, cwd or env from
 * the renderer) are rejected rather than ignored.
 */
export class TerminalIpcHandler {
  private readonly limits: TerminalLimits
  private readonly schemas: ReturnType<typeof buildSchemas>
  private readonly subscriptions = new Map<string, Subscription>()
  private readonly release: () => void
  private disposed = false

  constructor(private readonly options: TerminalIpcOptions) {
    this.limits = { ...TERMINAL_LIMITS, ...options.limits }
    this.schemas = buildSchemas(this.limits)
    this.release = options.service.subscribe(event => this.route(event))
  }

  async create(sender: TerminalSender, input: unknown): Promise<TerminalSessionInfo> {
    this.assertTrusted(sender)
    const value = this.parse(this.schemas.create, input)
    return this.options.service.create(value.projectId, { cols: value.cols, rows: value.rows })
  }

  async list(sender: TerminalSender, input: unknown): Promise<TerminalSessionInfo[]> {
    this.assertTrusted(sender)
    const value = this.parse(this.schemas.list, input)
    return this.options.service.list(value.projectId)
  }

  async write(sender: TerminalSender, input: unknown): Promise<void> {
    this.assertTrusted(sender)
    const value = this.parse(this.schemas.write, input)
    await this.options.service.write(value.projectId, value.sessionId, value.data)
  }

  async resize(sender: TerminalSender, input: unknown): Promise<TerminalSessionInfo> {
    this.assertTrusted(sender)
    const value = this.parse(this.schemas.resize, input)
    return this.options.service.resize(value.projectId, value.sessionId, value.cols, value.rows)
  }

  async terminate(sender: TerminalSender, input: unknown): Promise<void> {
    this.assertTrusted(sender)
    const value = this.parse(this.schemas.session, input)
    await this.options.service.terminate(value.projectId, value.sessionId)
  }

  async attach(sender: TerminalSender, input: unknown): Promise<TerminalAttachResult> {
    this.assertTrusted(sender)
    const value = this.parse(this.schemas.attach, input)
    const info = this.options.service.find(value.projectId, value.sessionId)
    if (!info || info.status !== 'running') {
      throw new TerminalError('SESSION_NOT_FOUND', '终端会话不存在或已经结束。')
    }

    this.pruneSubscriptions()
    if (this.subscriptions.size >= TERMINAL_SUBSCRIPTION_LIMIT) {
      throw new TerminalError('INVALID_INPUT', '终端订阅数量已达上限。')
    }

    this.options.service.markActive(value.projectId, value.sessionId)
    const subscriptionId = this.options.generateSubscriptionId?.() ?? randomUUID()
    // Snapshot and registration happen in the same synchronous block, so no chunk can
    // slip between the replay window and the live stream.
    const snapshot = this.options.service.outputSnapshot(value.projectId, value.sessionId, value.sinceSeq ?? 0)
    this.subscriptions.set(subscriptionId, {
      projectId: value.projectId,
      sessionId: value.sessionId,
      sender,
      queue: this.createQueue(subscriptionId, sender, value.projectId, value.sessionId),
    })
    return { subscriptionId, info, ...snapshot }
  }

  async detach(sender: TerminalSender, subscriptionId: unknown): Promise<void> {
    this.assertTrusted(sender)
    const id = this.parse(this.schemas.detach, subscriptionId)
    const subscription = this.subscriptions.get(id)
    if (!subscription || subscription.sender.id !== sender.id) return
    subscription.queue.dispose()
    this.subscriptions.delete(id)
  }

  dispose(): void {
    this.disposed = true
    this.release()
    for (const subscription of this.subscriptions.values()) subscription.queue.dispose()
    this.subscriptions.clear()
  }

  private createQueue(subscriptionId: string, sender: TerminalSender, projectId: string, sessionId: string): TerminalSubscriberQueue {
    return new TerminalSubscriberQueue({
      limitBytes: this.limits.subscriberLimitBytes,
      flushDelayMs: this.limits.flushIntervalMs,
      schedule: this.options.schedule,
      deliver: (chunks, droppedBytes) => {
        if (sender.isDestroyed()) return
        try {
          if (droppedBytes > 0) {
            sender.send({ subscriptionId, event: { type: 'dropped', projectId, sessionId, bytes: droppedBytes } })
          }
          for (const chunk of chunks) {
            sender.send({ subscriptionId, event: { type: 'output', projectId, sessionId, seq: chunk.seq, data: chunk.data } })
          }
        } catch {
          // The renderer went away; the next routing pass prunes this subscription.
        }
      },
    })
  }

  private route(event: TerminalEvent): void {
    for (const [subscriptionId, subscription] of [...this.subscriptions]) {
      if (subscription.sessionId !== event.sessionId) continue
      if (subscription.sender.isDestroyed()) {
        subscription.queue.dispose()
        this.subscriptions.delete(subscriptionId)
        continue
      }
      if (event.type === 'output') {
        subscription.queue.enqueue({ seq: event.seq, data: event.data })
        continue
      }
      // State changes must not overtake output that is still queued.
      subscription.queue.flush()
      try {
        subscription.sender.send({ subscriptionId, event })
      } catch {
        subscription.queue.dispose()
        this.subscriptions.delete(subscriptionId)
      }
    }
  }

  private pruneSubscriptions(): void {
    for (const [subscriptionId, subscription] of [...this.subscriptions]) {
      if (subscription.sender.isDestroyed()) {
        subscription.queue.dispose()
        this.subscriptions.delete(subscriptionId)
      }
    }
  }

  private assertTrusted(sender: TerminalSender): void {
    if (this.disposed) throw new TerminalError('UNTRUSTED_SENDER', '终端通道已关闭。')
    if (!sender || typeof sender.id !== 'number' || !this.options.isTrustedSender(sender)) {
      throw new TerminalError('UNTRUSTED_SENDER', '终端请求来源不可信，已拒绝。')
    }
  }

  private parse<T>(schema: z.ZodType<T>, input: unknown): T {
    const result = schema.safeParse(input)
    if (!result.success) throw new TerminalError('INVALID_INPUT', '终端请求参数不合法，已拒绝。')
    return result.data
  }
}
