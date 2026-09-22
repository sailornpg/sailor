import { stat } from 'node:fs/promises'
import { type UIMessage } from 'ai'
import { validateChatMessages } from './validateChatMessages.js'
import { z } from 'zod'
import type { AgentRunRequest } from '../../shared/contracts.js'
import type { WorkspaceChat, WorkspacePreferences, RunStatus } from '../../shared/workspaces.js'
import type { WorkspaceStore } from './WorkspaceStore.js'
import { WorkspaceToolScope, type WorkspaceToolContext } from './WorkspaceToolScope.js'

const idSchema = z.string().min(1).max(200)
const requestSchema = z.object({
  runId: idSchema, chatId: idSchema, messages: z.array(z.unknown()),
  reasoning: z.enum(['provider-default', 'none', 'minimal', 'low', 'medium', 'high', 'xhigh']),
})
const preferencesSchema = z.object({ activeChatId: idSchema.nullable().optional(), collapsedProjectIds: z.array(idSchema).optional() })

export class WorkspaceService {
  private readonly live = new Map<string, WorkspaceChat>()
  private readonly pendingWrites = new Map<string, Promise<void>>()
  private readonly changed: () => void
  private readonly managing = new Set<string>()
  private viewedChatId: string | null | undefined
  protected readonly store: WorkspaceStore
  private readonly selectDirectory: () => Promise<string | null>
  constructor(store: WorkspaceStore, selectDirectory: () => Promise<string | null>, changed: () => void = () => {}) {
    this.changed = changed
    this.store = store
    this.selectDirectory = selectDirectory
  }
  async snapshot() {
    const snapshot = await this.store.snapshot()
    if (this.viewedChatId === undefined) this.viewedChatId = snapshot.activeChatId
    snapshot.chats = snapshot.chats.map(chat => {
      const live = this.live.get(chat.id)
      if (live) { const { messages: _messages, ...summary } = live; return summary }
      return chat.status === 'running' ? { ...chat, status: 'stopped' as const, error: '上次运行已中断，可继续发送消息。' } : chat
    }).sort((a, b) => b.updatedAt - a.updatedAt)
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
  async getChat(chatId: unknown) {
    const id = idSchema.parse(chatId)
    const chat = structuredClone(this.live.get(id) ?? await this.store.getChat(id))
    if (!this.live.has(id) && chat.status === 'running') { chat.status = 'stopped'; chat.error = '上次运行已中断，可继续发送消息。' }
    try { if (chat.messages.length) chat.messages = await validateChatMessages(chat.messages) }
    catch (error) { throw new Error('会话消息格式无效，原历史已保留。', { cause: error }) }
    return chat
  }
  async setPreferences(input: Partial<WorkspacePreferences>) {
    const parsed = preferencesSchema.parse(input)
    if (parsed.activeChatId !== undefined) this.viewedChatId = parsed.activeChatId
    await this.store.setPreferences(parsed)
    if (parsed.activeChatId) {
      const live = this.live.get(parsed.activeChatId)
      if (live) { live.unread = false; await this.persist(live.id) }
      else await this.store.updateChat(parsed.activeChatId, { unread: false })
    }
    this.changed()
  }
  async manageChat(chatId: unknown, input: unknown) {
    const id = idSchema.parse(chatId)
    const change = z.discriminatedUnion('action', [
      z.object({ action: z.literal('rename'), title: z.string().trim().min(1).max(120) }),
      z.object({ action: z.enum(['archive', 'unarchive', 'delete']) }),
    ]).parse(input)
    if (this.managing.has(id)) throw new Error('此会话正在更新，请稍后重试。')
    this.managing.add(id)
    try {
      const chat = await this.getChat(id)
      if (chat.status === 'running' || chat.saveError) throw new Error('请先停止生成并保存会话，再进行管理操作。')
      await this.pendingWrites.get(id)
      await this.store.manageChat(id, change)
      this.live.delete(id)
      this.pendingWrites.delete(id)
      if ((change.action === 'archive' || change.action === 'delete') && this.viewedChatId === id) this.viewedChatId = null
      this.changed()
    } finally { this.managing.delete(id) }
  }
  async beginRun(request: AgentRunRequest) {
    if (this.managing.has(request.chatId)) throw new Error('此会话正在更新，请稍后重试。')
    this.managing.add(request.chatId)
    try {
    const chat = await this.getChat(request.chatId)
    if (chat.archived) throw new Error('请先恢复已归档会话。')
    if (chat.saveError) throw new Error('请先重试保存此会话，再继续生成。')
    if (chat.status === 'running') throw new Error('此会话已有运行中的任务。')
    Object.assign(chat, { runId: request.runId, status: 'running', messages: request.messages, error: null, unread: false })
    const saved = await this.store.updateChat(chat.id, chat)
    this.live.set(chat.id, saved)
    this.changed()
    } finally { this.managing.delete(request.chatId) }
  }
  async updateRun(chatId: string, runId: string, messages: UIMessage[]) {
    const chat = this.live.get(chatId)
    if (!chat || chat.runId !== runId) return
    chat.messages = structuredClone(messages)
    chat.updatedAt = Date.now()
    await this.persist(chatId)
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
        const saved = await this.store.updateChat(chatId, { messages, runId, status, unread, error }, runId ?? undefined)
        chat.title = saved.title
        delete chat.saveError
      } catch { chat.saveError = '会话保存失败，输出仍保留在本次应用内；请重试保存。' }
      this.changed()
    })
    this.pendingWrites.set(chatId, operation)
    return operation
  }
  async validateRequest(input: unknown): Promise<AgentRunRequest> {
    const parsed = requestSchema.safeParse(input)
    if (!parsed.success) throw new Error('会话运行输入无效。')
    const chat = await this.getChat(parsed.data.chatId)
    const project = (await this.snapshot()).projects.find(p => p.id === chat.projectId)
    try {
      if (!project || !(await stat(project.rootPath)).isDirectory()) throw new Error()
    } catch { throw new Error('工作区目录不存在或无法访问；仍可查看历史会话。') }
    try {
      const messages = await validateChatMessages(parsed.data.messages)
      return { ...parsed.data, messages }
    } catch (error) { throw new Error('会话消息格式无效。', { cause: error }) }
  }
  async resolveToolContext(chatId: string, signal: AbortSignal, runId = ''): Promise<WorkspaceToolContext> {
    const chat = await this.getChat(idSchema.parse(chatId))
    const project = (await this.snapshot()).projects.find(item => item.id === chat.projectId)
    if (!project) throw new Error('工作区不存在。')
    const scope = await WorkspaceToolScope.create(project.rootPath, signal)
    return { chatId: chat.id, runId, rootPath: scope.rootPath, scope, signal }
  }
}
