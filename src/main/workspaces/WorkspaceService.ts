import { projectWorkspaceMessages } from '../agent/pi/workspaceContext.js'
import { stat } from 'node:fs/promises'
import { randomUUID } from 'node:crypto'
import { Buffer } from 'node:buffer'
import { type UIMessage } from 'ai'
import { validateChatMessages } from './validateChatMessages.js'
import { z } from 'zod'
import { isImageMediaType } from '../../shared/attachments.js'
import type { AgentRunRequest } from '../../shared/contracts.js'
import type { PiDisplayEvent } from '../../shared/piDisplayEvent.js'
import type { WorkspaceChat, WorkspacePreferences, RunStatus } from '../../shared/workspaces.js'
import { planTodoListSchema, type PlanTodoList } from '../../shared/planTodo.js'
import type { WorkspaceStore } from './WorkspaceStore.js'
import { WorkspaceToolScope, type WorkspaceToolContext } from './WorkspaceToolScope.js'

const idSchema = z.string().min(1).max(200)
const requestSchema = z
  .object({
    runId: idSchema,
    chatId: idSchema,
    messages: z.array(z.unknown()),
    thinkingLevel: z
      .enum(['provider-default', 'off', 'minimal', 'low', 'medium', 'high', 'xhigh', 'max'])
      .optional(),
    reasoning: z
      .enum(['provider-default', 'none', 'off', 'minimal', 'low', 'medium', 'high', 'xhigh', 'max'])
      .optional(),
  })
  .refine((value) => value.thinkingLevel !== undefined || value.reasoning !== undefined)
const preferencesSchema = z.object({
  activeChatId: idSchema.nullable().optional(),
  collapsedProjectIds: z.array(idSchema).optional(),
})
const permissionSchema = z.object({
  projectId: idSchema,
  mode: z.enum(['allow-reads', 'allow-edits', 'allow-all']),
})

export class WorkspaceService {
  private readonly live = new Map<string, WorkspaceChat>()
  private readonly pendingWrites = new Map<string, Promise<void>>()
  private readonly changed: () => void
  private readonly managing = new Set<string>()
  private viewedChatId: string | null | undefined
  protected readonly store: WorkspaceStore
  private readonly selectDirectory: () => Promise<string | null>
  constructor(
    store: WorkspaceStore,
    selectDirectory: () => Promise<string | null>,
    changed: () => void = () => {},
    private readonly forkPiSession?: (parentId: string, sideId: string) => Promise<boolean>,
  ) {
    this.changed = changed
    this.store = store
    this.selectDirectory = selectDirectory
  }
  async snapshot() {
    const snapshot = await this.store.snapshot()
    if (this.viewedChatId === undefined) this.viewedChatId = snapshot.activeChatId
    snapshot.chats = snapshot.chats
      .map((chat) => {
        const live = this.live.get(chat.id)
        if (live) {
          const { messages: _messages, contextSnapshot: _contextSnapshot, ...summary } = live
          return summary
        }
        return chat.status === 'running'
          ? { ...chat, status: 'stopped' as const, error: '上次运行已中断，可继续发送消息。' }
          : chat
      })
      .sort((a, b) => b.updatedAt - a.updatedAt)
    return snapshot
  }
  async pickProject() {
    const path = await this.selectDirectory()
    const project = path === null ? null : await this.store.addProject(path)
    this.changed()
    return project
  }
  async createChat(projectId: unknown) {
    const chat = await this.store.createChat(idSchema.parse(projectId))
    this.viewedChatId = chat.id
    this.changed()
    return chat
  }
  async createSideChat(parentChatId: unknown) {
    const id = idSchema.parse(parentChatId)
    if (this.managing.has(id)) throw new Error('主会话正在更新，请稍后重试。')
    this.managing.add(id)
    try {
      await this.pendingWrites.get(id)
      const parent = await this.getChat(id)
      if (parent.parentChatId) throw new Error('侧聊不能作为主会话再次分叉。')
      if (parent.archived || parent.status !== 'completed' || parent.saveError)
        throw new Error('请等待主会话完成并保存后再创建侧聊。')
      const last = parent.messages.at(-1)
      if (
        last?.role !== 'assistant' ||
        !last.parts.some((part) => part.type === 'text' && part.text.trim())
      )
        throw new Error('主会话尚无完整回答，不能创建侧聊。')
      const entries = parent.messages.flatMap((message) => {
        if (message.role !== 'user' && message.role !== 'assistant') return []
        const text = message.parts
          .filter((part) => part.type === 'text')
          .map((part) => part.text)
          .join('\n')
        return text ? [{ role: message.role, text }] : []
      })
      const textSnapshot = JSON.stringify(entries)
      const contextSnapshot =
        Buffer.byteLength(textSnapshot, 'utf8') <= 64 * 1024 ? textSnapshot : undefined
      const hasImages = parent.messages.some((message) =>
        message.parts.some((part) => part.type === 'file' && isImageMediaType(part.mediaType)),
      )
      const side = await this.store.createSideChat(id, last.id, contextSnapshot)
      try {
        const forked = await this.forkPiSession?.(id, side.id)
        if (!forked && hasImages)
          throw new Error(
            '主会话图片缺少可分叉的 Pi 状态，无法完整继承上下文。请在主会话继续一轮后重新创建侧聊。',
          )
        if (!forked && !contextSnapshot)
          throw new Error('主会话文本快照超过 64 KiB，且无可用 Pi 状态，无法创建侧聊。')
      } catch (error) {
        await this.store.manageChat(side.id, { action: 'delete' })
        throw error
      }
      this.changed()
      return side
    } finally {
      this.managing.delete(id)
    }
  }
  async getChat(chatId: unknown) {
    const id = idSchema.parse(chatId)
    const chat = structuredClone(this.live.get(id) ?? (await this.store.getChat(id)))
    if (!this.live.has(id) && chat.status === 'running') {
      chat.status = 'stopped'
      chat.error = '上次运行已中断，可继续发送消息。'
    }
    try {
      if (chat.messages.length) chat.messages = await validateChatMessages(chat.messages)
    } catch (error) {
      throw new Error('会话消息格式无效，原历史已保留。', { cause: error })
    }
    return chat
  }
  async setPreferences(input: Partial<WorkspacePreferences>) {
    const parsed = preferencesSchema.parse(input)
    if (parsed.activeChatId !== undefined) this.viewedChatId = parsed.activeChatId
    await this.store.setPreferences(parsed)
    if (parsed.activeChatId) {
      const live = this.live.get(parsed.activeChatId)
      if (live) {
        live.unread = false
        await this.persist(live.id)
      } else await this.store.updateChat(parsed.activeChatId, { unread: false })
    }
    this.changed()
  }
  async setPermission(input: unknown) {
    const parsed = permissionSchema.parse(input)
    await this.store.setProjectPermission(parsed.projectId, parsed.mode)
    this.changed()
  }
  async manageChat(chatId: unknown, input: unknown) {
    const id = idSchema.parse(chatId)
    const change = z
      .discriminatedUnion('action', [
        z.object({ action: z.literal('rename'), title: z.string().trim().min(1).max(120) }),
        z.object({ action: z.enum(['archive', 'unarchive', 'delete']) }),
      ])
      .parse(input)
    const changeTouchesChildren =
      change.action === 'archive' || change.action === 'unarchive' || change.action === 'delete'
    const descendants = changeTouchesChildren
      ? (await this.store.snapshot()).chats
          .filter((chat) => chat.parentChatId === id)
          .map((chat) => chat.id)
      : []
    const ids = [id, ...descendants]
    if (ids.some((chatId) => this.managing.has(chatId)))
      throw new Error('此会话或侧聊正在更新，请稍后重试。')
    for (const chatId of ids) this.managing.add(chatId)
    try {
      for (const chatId of ids) {
        await this.pendingWrites.get(chatId)
        const chat = await this.getChat(chatId)
        if (chat.status === 'running' || chat.saveError)
          throw new Error(
            chatId === id
              ? '请先停止生成并保存会话，再进行管理操作。'
              : '请先停止生成并保存侧聊，再管理主会话。',
          )
      }
      const deletedIds = await this.store.manageChat(id, change)
      for (const chatId of ids) {
        this.live.delete(chatId)
        this.pendingWrites.delete(chatId)
      }
      if ((change.action === 'archive' || change.action === 'delete') && this.viewedChatId === id)
        this.viewedChatId = null
      this.changed()
      return deletedIds
    } finally {
      for (const chatId of ids) this.managing.delete(chatId)
    }
  }
  async beginRun(request: AgentRunRequest) {
    if (this.managing.has(request.chatId)) throw new Error('此会话正在更新，请稍后重试。')
    this.managing.add(request.chatId)
    try {
      const chat = await this.getChat(request.chatId)
      if (chat.archived) throw new Error('请先恢复已归档会话。')
      if (chat.saveError) throw new Error('请先重试保存此会话，再继续生成。')
      if (chat.status === 'running') throw new Error('此会话已有运行中的任务。')
      // Approval continuations use a fresh transport runId but resume the same
      // user task. Only a new user prompt starts a new plan lifecycle.
      const continuation = request.messages.at(-1)?.role === 'assistant'
      Object.assign(chat, {
        runId: request.runId,
        status: 'running',
        messages: request.messages,
        plan: continuation ? chat.plan : undefined,
        error: null,
        unread: false,
      })
      const saved = await this.store.updateChat(chat.id, chat)
      this.live.set(chat.id, saved)
      this.changed()
    } finally {
      this.managing.delete(request.chatId)
    }
  }
  async updateRun(chatId: string, runId: string, messages: UIMessage[]) {
    const chat = this.live.get(chatId)
    if (!chat || chat.runId !== runId) return
    chat.messages = structuredClone(messages)
    chat.updatedAt = Date.now()
    await this.persist(chatId)
  }
  async appendPiEvent(chatId: string, event: PiDisplayEvent): Promise<UIMessage[]> {
    if (this.managing.has(chatId)) throw new Error('此会话正在更新，请稍后重试。')
    this.managing.add(chatId)
    try {
      const chat = await this.getChat(chatId)
      if (chat.status === 'running') throw new Error('请等待当前会话完成后再压缩上下文。')
      if (chat.saveError) throw new Error('请先重试保存此会话。')
      const messages = structuredClone(chat.messages)
      const index = messages.findLastIndex((message) => message.role === 'assistant')
      const part = { type: 'data-pi-event' as const, data: event }
      if (index >= 0)
        messages[index] = { ...messages[index], parts: [...messages[index].parts, part] }
      else messages.push({ id: randomUUID(), role: 'assistant', parts: [part] })
      chat.messages = messages
      chat.updatedAt = Date.now()
      this.live.set(chatId, chat)
      await this.persist(chatId)
      if (chat.saveError) throw new Error(chat.saveError)
      return structuredClone(messages)
    } finally {
      this.managing.delete(chatId)
    }
  }
  async updatePlan(chatId: string, runId: string, input: PlanTodoList): Promise<void> {
    const plan = planTodoListSchema.parse(input)
    const chat = this.live.get(chatId)
    if (!chat || chat.runId !== runId) throw new Error('计划运行已失效。')
    chat.plan = await this.store.updatePlan(chatId, runId, plan)
    chat.updatedAt = Date.now()
    this.changed()
  }
  async finishRun(chatId: string, runId: string, status: RunStatus, error: string | null = null) {
    const chat = this.live.get(chatId)
    if (!chat || chat.runId !== runId) return
    chat.status = status
    chat.error = error
    chat.unread = this.viewedChatId !== chatId
    await this.persist(chatId)
  }
  async retrySave(chatId: unknown) {
    const id = idSchema.parse(chatId)
    if (!this.live.has(id)) throw new Error('此会话没有待重试的保存。')
    await this.persist(id)
    if (this.live.get(id)?.saveError) throw new Error('会话仍无法保存，请检查磁盘空间与目录权限。')
  }
  private persist(chatId: string): Promise<void> {
    const previous = this.pendingWrites.get(chatId) ?? Promise.resolve()
    const operation = previous.then(async () => {
      const chat = this.live.get(chatId)
      if (!chat) return
      const { messages, runId, status, unread, error } = chat
      try {
        const saved = await this.store.updateChat(
          chatId,
          { messages, runId, status, unread, error },
          runId ?? undefined,
        )
        chat.title = saved.title
        delete chat.saveError
      } catch {
        chat.saveError = '会话保存失败，输出仍保留在本次应用内；请重试保存。'
      }
      this.changed()
    })
    this.pendingWrites.set(chatId, operation)
    return operation
  }
  async validateRequest(input: unknown): Promise<AgentRunRequest> {
    const parsed = requestSchema.safeParse(input)
    if (!parsed.success) throw new Error('会话运行输入无效。')
    const chat = await this.getChat(parsed.data.chatId)
    const project = (await this.snapshot()).projects.find((p) => p.id === chat.projectId)
    try {
      if (!project || !(await stat(project.rootPath)).isDirectory()) throw new Error()
    } catch {
      throw new Error('工作区目录不存在或无法访问；仍可查看历史会话。')
    }
    try {
      const messages = await validateChatMessages(parsed.data.messages)
      projectWorkspaceMessages(messages, chat.projectId)
      return { ...parsed.data, messages }
    } catch (error) {
      throw new Error('会话消息格式无效。', { cause: error })
    }
  }
  async resolveToolContext(
    chatId: string,
    signal: AbortSignal,
    runId = '',
  ): Promise<WorkspaceToolContext> {
    const chat = await this.getChat(idSchema.parse(chatId))
    const project = (await this.snapshot()).projects.find((item) => item.id === chat.projectId)
    if (!project) throw new Error('工作区不存在。')
    const scope = await WorkspaceToolScope.create(project.rootPath, signal)
    return {
      chatId: chat.id,
      runId,
      rootPath: scope.rootPath,
      scope,
      signal,
      permissionMode: project.permissionMode ?? 'allow-all',
    }
  }

  async resolveProjectRoot(projectId: unknown): Promise<string> {
    const id = idSchema.parse(projectId)
    const project = (await this.snapshot()).projects.find((item) => item.id === id)
    if (!project) throw new Error('工作区不存在。')
    return project.rootPath
  }
}
