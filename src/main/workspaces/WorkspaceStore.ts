import { randomUUID } from 'node:crypto'
import { mkdir, readFile, realpath, rename, stat, writeFile, rm } from 'node:fs/promises'
import { basename, dirname } from 'node:path'
import { z } from 'zod'
import type { UIMessage } from 'ai'
import type { WorkspaceChat, WorkspacePreferences, WorkspaceSnapshot, ChatManagement } from '../../shared/workspaces.js'

const messageSchema = z.object({ id: z.string(), role: z.enum(['system', 'user', 'assistant']), parts: z.array(z.object({ type: z.string() }).passthrough()) }).passthrough()
const chatSchema = z.object({
  id: z.string(), projectId: z.string(), title: z.string(), updatedAt: z.number(),
  runId: z.string().nullable(), status: z.enum(['idle', 'running', 'completed', 'stopped', 'error']),
  archived: z.boolean().default(false), titleOverride: z.string().optional(),
  unread: z.boolean(), error: z.string().nullable(), messages: z.array(messageSchema),
})
const fileSchema = z.object({
  version: z.literal(1),
  projects: z.array(z.object({ id: z.string(), name: z.string(), rootPath: z.string() })),
  chats: z.array(chatSchema), activeChatId: z.string().nullable(), collapsedProjectIds: z.array(z.string()),
})
type State = Omit<z.infer<typeof fileSchema>, 'chats'> & { chats: WorkspaceChat[] }

export class WorkspaceStore {
  private operation: Promise<unknown> = Promise.resolve()
  private readonly filePath: string
  constructor(filePath: string) { this.filePath = filePath }

  async snapshot(): Promise<WorkspaceSnapshot> {
    await this.operation
    const { projects, chats, activeChatId, collapsedProjectIds } = await this.read()
    return { projects, chats: chats.map(({ messages: _messages, ...chat }) => chat).sort((a, b) => b.updatedAt - a.updatedAt), activeChatId, collapsedProjectIds }
  }
  async getChat(id: string): Promise<WorkspaceChat> {
    await this.operation
    const chat = (await this.read()).chats.find(chat => chat.id === id)
    if (!chat) throw new Error('会话不存在。')
    return chat
  }
  async addProject(selectedPath: string) {
    let rootPath: string
    try {
      rootPath = await realpath(selectedPath)
      if (!(await stat(rootPath)).isDirectory()) throw new Error()
    } catch { throw new Error('所选目录不存在或无法访问。') }
    return this.mutate(state => {
      const existing = state.projects.find(project => project.rootPath === rootPath)
      if (existing) return existing
      const project = { id: randomUUID(), name: basename(rootPath) || rootPath, rootPath }
      state.projects.push(project)
      return project
    })
  }
  createChat(projectId: string): Promise<WorkspaceChat> {
    return this.mutate(state => {
      if (!state.projects.some(p => p.id === projectId)) throw new Error('工作区不存在。')
      const chat: WorkspaceChat = { id: randomUUID(), projectId, title: '新会话', updatedAt: Date.now(), messages: [], runId: null, status: 'idle', unread: false, error: null }
      state.chats.push(chat)
      state.activeChatId = chat.id
      return chat
    })
  }
  updateChat(id: string, patch: Partial<Pick<WorkspaceChat, 'messages' | 'runId' | 'status' | 'unread' | 'error'>>, expectedRunId?: string): Promise<WorkspaceChat> {
    const captured = structuredClone(patch)
    return this.mutate(state => {
      const chat = state.chats.find(c => c.id === id)
      if (!chat) throw new Error('会话不存在。')
      if (expectedRunId !== undefined && chat.runId !== expectedRunId) throw new Error('过期运行不能修改会话。')
      Object.assign(chat, captured)
      if (captured.messages) {
        const first = chat.messages.find(m => m.role === 'user')
        const title = first?.parts.filter(p => p.type === 'text').map(p => p.text).join(' ').trim().replace(/\s+/g, ' ')
        chat.title = chat.titleOverride ?? Array.from(title || '新会话').slice(0, 40).join('')
        chat.updatedAt = Date.now()
      }
      return chat
    })
  }
  manageChat(id: string, input: ChatManagement): Promise<void> {
    return this.mutate(state => {
      const chat = state.chats.find(c => c.id === id)
      if (!chat) throw new Error('会话不存在。')
      if (input.action === 'rename') {
        const title = z.string().trim().min(1).max(120).parse(input.title)
        chat.title = title
        chat.titleOverride = title
      } else if (input.action === 'delete') {
        state.chats = state.chats.filter(c => c.id !== id)
      } else chat.archived = input.action === 'archive'
      if ((input.action === 'archive' || input.action === 'delete') && state.activeChatId === id) state.activeChatId = null
    })
  }
  setPreferences(preferences: Partial<WorkspacePreferences>): Promise<void> {
    return this.mutate(state => {
      if (preferences.activeChatId !== undefined) {
        if (preferences.activeChatId !== null && !state.chats.some(c => c.id === preferences.activeChatId)) throw new Error('会话不存在。')
        state.activeChatId = preferences.activeChatId
      }
      if (preferences.collapsedProjectIds) state.collapsedProjectIds = preferences.collapsedProjectIds.filter(id => state.projects.some(p => p.id === id))
    })
  }
  private mutate<T>(update: (state: State) => T): Promise<T> {
    const result = this.operation.then(async () => {
      const state = await this.read()
      const value = update(state)
      await mkdir(dirname(this.filePath), { recursive: true })
      const temporary = `${this.filePath}.${randomUUID()}.tmp`
      try {
        await writeFile(temporary, JSON.stringify(state), { encoding: 'utf8', mode: 0o600 })
        await rename(temporary, this.filePath)
      } catch (error) {
        await rm(temporary, { force: true }).catch(() => undefined)
        throw new Error('工作区数据保存失败，请检查磁盘空间与目录权限。', { cause: error })
      }
      return value
    })
    this.operation = result.then(() => undefined, () => undefined)
    return result
  }
  private async read(): Promise<State> {
    try {
      const state = fileSchema.parse(JSON.parse(await readFile(this.filePath, 'utf8'))) as State
      const ids = new Set(state.projects.map(p => p.id))
      const chats = new Set(state.chats.map(c => c.id))
      if (ids.size !== state.projects.length || chats.size !== state.chats.length || state.chats.some(c => !ids.has(c.projectId)) || (state.activeChatId !== null && !chats.has(state.activeChatId))) throw new Error('无效引用')
      return state
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return { version: 1, projects: [], chats: [], activeChatId: null, collapsedProjectIds: [] }
      throw new Error('工作区数据无法读取或格式损坏，原文件已保留。', { cause: error })
    }
  }
}
