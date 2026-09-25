import { readUIMessageStream } from 'ai'
import { PiRunner, type AgentRunner } from './pi/PiRunner.js'
import { type AgentRunEvent, type AgentRunRequest } from '@shared/contracts.js'
import type { SettingsService } from '../settings/SettingsService.js'
import type { WorkspaceService } from '../workspaces/WorkspaceService.js'
import { getAgentErrorMessage } from './getAgentErrorMessage.js'
import type { WriteApprovalResponse } from '../../shared/contracts.js'
import type { AskUserInteractionResponse } from './pi/AskUserInteraction.js'

type EventSink = (runId: string, event: AgentRunEvent) => void
interface AgentServiceDependencies {
  runner: AgentRunner
  piStorageDirectory: string
  workspace: WorkspaceService
}

export class AgentService {
  private readonly controllers = new Map<string, AbortController>()
  private readonly chatRuns = new Map<string, string>()
  private readonly completions = new Map<string, Promise<void>>()
  private readonly runner?: AgentRunner
  private readonly workspace?: WorkspaceService
  constructor(
    private readonly emit: EventSink,
    private readonly settings: SettingsService,
    dependencies: Partial<AgentServiceDependencies> = {},
  ) {
    this.runner =
      dependencies.runner ??
      (dependencies.piStorageDirectory ? new PiRunner(dependencies.piStorageDirectory) : undefined)
    this.workspace = dependencies.workspace
  }
  async start(input: AgentRunRequest): Promise<void> {
    if (this.controllers.has(input.runId) || this.chatRuns.has(input.chatId))
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
        const save = async () => {
          for await (const message of readUIMessageStream({
            message: persistenceMessage,
            stream: persistenceStream,
            onError: () => {
              failure ??= '任务流读取失败。'
            },
          })) {
            const previous = request.messages.at(-1)
            const history =
              previous?.id === message.id ? request.messages.slice(0, -1) : request.messages
            if (message.id)
              await workspace.updateRun(request.chatId, request.runId, [...history, message])
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
  abortAll(): void {
    for (const runId of this.controllers.keys()) void this.abort(runId)
  }
}
