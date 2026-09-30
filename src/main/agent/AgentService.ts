import { readUIMessageStream } from 'ai'
import { randomUUID } from 'node:crypto'
import { PiRunner, type AgentRunner } from './pi/PiRunner.js'
import { type AgentRunEvent, type AgentRunRequest } from '@shared/contracts.js'
import type { SettingsService } from '../settings/SettingsService.js'
import type { WorkspaceService } from '../workspaces/WorkspaceService.js'
import { getAgentErrorMessage } from './getAgentErrorMessage.js'
import { RunMessageWriter } from './runMessageWriter.js'
import type { WriteApprovalResponse } from '../../shared/contracts.js'
import type { AskUserInteractionResponse } from './pi/AskUserInteraction.js'

type EventSink = (runId: string, event: AgentRunEvent) => void
interface AgentServiceDependencies {
  runner: AgentRunner
  piStorageDirectory: string
  onFileChange: (chatId: string) => void
  workspace: WorkspaceService
  /** Test seam for the streamed-message persistence interval. */
  runPersistIntervalMs?: number
}

export class AgentService {
  private readonly controllers = new Map<string, AbortController>()
  private readonly chatRuns = new Map<string, string>()
  private readonly completions = new Map<string, Promise<void>>()
  private readonly compactions = new Map<string, AbortController>()
  private readonly runner?: AgentRunner
  private readonly workspace?: WorkspaceService
  private readonly runPersistIntervalMs?: number
  constructor(
    private readonly emit: EventSink,
    private readonly settings: SettingsService,
    dependencies: Partial<AgentServiceDependencies> = {},
  ) {
    this.runner =
      dependencies.runner ??
      (dependencies.piStorageDirectory
        ? new PiRunner(dependencies.piStorageDirectory, undefined, dependencies.onFileChange)
        : undefined)
    this.workspace = dependencies.workspace
    this.runPersistIntervalMs = dependencies.runPersistIntervalMs
  }
  async start(input: AgentRunRequest): Promise<void> {
    if (
      this.controllers.has(input.runId) ||
      this.chatRuns.has(input.chatId) ||
      this.compactions.has(input.chatId)
    )
      throw new Error('此会话已有运行中的任务。')
    const controller = new AbortController()
    let resolveCompletion: () => void = () => {}
    const completion = new Promise<void>((resolve) => {
      resolveCompletion = resolve
    })
    this.controllers.set(input.runId, controller)
    this.chatRuns.set(input.chatId, input.runId)
    this.completions.set(input.runId, completion)
    // Snapshot configuration at invocation, before any workspace I/O or UI changes.
    const modelSnapshot = this.settings.resolveActiveModel().then(
      (value) => ({ value }),
      (error) => ({ error }),
    )
    let failure: string | null = null
    try {
      const request = this.workspace ? await this.workspace.validateRequest(input) : input
      await this.workspace?.beginRun(request)
      const resolved = await modelSnapshot
      if ('error' in resolved) throw resolved.error
      const configuredModel = resolved.value
      if (!configuredModel) throw new Error('请先在设置中配置并选择模型。')
      if (controller.signal.aborted) return
      const toolContext = this.workspace
        ? await this.workspace.resolveToolContext(request.chatId, controller.signal, request.runId)
        : undefined
      const chat = this.workspace ? await this.workspace.getChat(request.chatId) : undefined
      if (!this.runner) throw new Error('Pi 会话存储尚未配置。')
      const chunks = this.runner.run({
        request,
        config: configuredModel,
        onPiEvent: (event) => {
          if (event.chatId === request.chatId && event.runId === request.runId)
            this.emit(request.runId, { type: 'pi-event', event })
        },
        context: toolContext,
        sideContextSnapshot: chat?.parentChatId ? chat.contextSnapshot : undefined,
        isSideChat: Boolean(chat?.parentChatId),
        signal: controller.signal,
        ...(this.workspace
          ? {
              updatePlan: (plan) => this.workspace!.updatePlan(request.chatId, request.runId, plan),
            }
          : {}),
      })
      const stream = ReadableStream.from(chunks)
      const forward = async (chunks: typeof stream) => {
        for await (const chunk of chunks) {
          if (chunk.type === 'error') failure = chunk.errorText
          this.emit(request.runId, { type: 'chunk', chunk })
        }
      }
      if (this.workspace) {
        const [clientStream, persistenceStream] = stream.tee()
        const workspace = this.workspace
        const lastMessage = request.messages.at(-1)
        const persistenceMessage = lastMessage?.role === 'assistant' ? lastMessage : undefined
        const requestedMessages = request.messages
        const writer = new RunMessageWriter((message) => {
          if (!message.id) return Promise.resolve()
          // A resumed assistant message replaces the copy the request carried.
          const history =
            lastMessage?.id === message.id ? requestedMessages.slice(0, -1) : requestedMessages
          return workspace.updateRun(request.chatId, request.runId, [...history, message])
        }, this.runPersistIntervalMs)
        const save = async () => {
          try {
            for await (const message of readUIMessageStream({
              message: persistenceMessage,
              stream: persistenceStream,
              onError: () => {
                failure ??= '任务流读取失败。'
              },
            })) {
              writer.write(message)
            }
          } finally {
            await writer.flush()
          }
        }
        await Promise.all([forward(clientStream), save()])
      } else await forward(stream)
    } catch (error) {
      if (!controller.signal.aborted) {
        failure = getAgentErrorMessage(error, '任务运行失败。')
        this.emit(input.runId, { type: 'chunk', chunk: { type: 'error', errorText: failure } })
      }
    } finally {
      try {
        await this.workspace?.finishRun(
          input.chatId,
          input.runId,
          controller.signal.aborted ? 'stopped' : failure ? 'error' : 'completed',
          failure,
        )
      } finally {
        this.controllers.delete(input.runId)
        this.chatRuns.delete(input.chatId)
        resolveCompletion()
        this.completions.delete(input.runId)
        this.emit(input.runId, { type: 'end' })
      }
    }
  }
  respondToApproval(response: WriteApprovalResponse): void {
    if (!this.runner?.respondToApproval) throw new Error('审批请求不存在或已失效。')
    this.runner.respondToApproval(response)
  }
  respondToAskUser(response: AskUserInteractionResponse): void {
    if (!this.runner?.respondToAskUser) throw new Error('用户问题不存在或已失效。')
    this.runner.respondToAskUser(response)
  }
  revokeApprovals(chatId: string): void {
    this.runner?.revokeApprovals?.(chatId)
  }
  async deleteChat(chatId: string): Promise<void> {
    if (this.chatRuns.has(chatId)) throw new Error('请先停止会话运行。')
    await this.runner?.deleteChat?.(chatId)
  }
  async abort(runId: string): Promise<void> {
    this.runner?.revokeRun?.(runId)
    const controller = this.controllers.get(runId)
    if (!controller) return
    controller.abort()
    await this.completions.get(runId)
  }
  async compact(chatId: string): Promise<import('ai').UIMessage[]> {
    if (!this.runner?.compact || !this.workspace) throw new Error('当前运行时不支持手动压缩。')
    if (this.chatRuns.has(chatId) || this.compactions.has(chatId))
      throw new Error('请等待当前会话完成后再压缩上下文。')
    const controller = new AbortController()
    const operationId = randomUUID()
    this.compactions.set(chatId, controller)
    try {
      const chat = await this.workspace.getChat(chatId)
      if (chat.status === 'running') throw new Error('请等待当前会话完成后再压缩上下文。')
      if (!chat.messages.length) throw new Error('当前会话没有可压缩的上下文。')
      const configured = await this.settings.resolveActiveModel()
      if (!configured) throw new Error('请先在设置中配置并选择模型。')
      const context = await this.workspace.resolveToolContext(chatId, controller.signal)
      const outcome = await this.runner.compact({
        chatId,
        operationId,
        config: configured,
        context,
        isSideChat: Boolean(chat.parentChatId),
        signal: controller.signal,
        onPiEvent: (event) => {
          if (event.chatId === chatId && event.runId === operationId)
            this.emit(operationId, { type: 'pi-event', event })
        },
      })
      const messages = await this.workspace.appendPiEvent(chatId, outcome.event)
      if (outcome.error) throw new Error(outcome.error)
      return messages
    } finally {
      this.compactions.delete(chatId)
    }
  }
  abortAll(): void {
    for (const runId of this.controllers.keys()) void this.abort(runId)
    for (const controller of this.compactions.values()) controller.abort()
  }
}
