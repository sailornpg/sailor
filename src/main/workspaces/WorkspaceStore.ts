import { randomUUID } from 'node:crypto'
import { mkdir, readFile, realpath, rename, stat, writeFile, rm } from 'node:fs/promises'
import { basename, dirname } from 'node:path'
import { z } from 'zod'
import type { UIMessage } from 'ai'
import { mergePlanTodoList, planTodoListSchema, type PlanTodoList } from '../../shared/planTodo.js'
import type {
  WorkspaceChat,
  WorkspacePreferences,
  WorkspaceSnapshot,
  ChatManagement,
} from '../../shared/workspaces.js'
import type { WorkspacePermissionMode } from '../../shared/contracts.js'

const messageSchema = z
  .object({
    id: z.string(),
    role: z.enum(['system', 'user', 'assistant']),
    parts: z.array(z.object({ type: z.string() }).passthrough()),
  })
  .passthrough()
const chatSchema = z.object({
  id: z.string(),
  projectId: z.string(),
  title: z.string(),
  updatedAt: z.number(),
  runId: z.string().nullable(),
  status: z.enum(['idle', 'running', 'completed', 'stopped', 'error']),
  archived: z.boolean().default(false),
  titleOverride: z.string().optional(),
  parentChatId: z.string().optional(),
  forkMessageId: z.string().optional(),
  contextSnapshot: z.string().optional(),
  plan: planTodoListSchema.optional(),
  unread: z.boolean(),
  error: z.string().nullable(),
  messages: z.array(messageSchema),
})
const fileSchema = z.object({
  version: z.literal(1),
  projects: z.array(
    z.object({
      id: z.string(),
      name: z.string(),
      rootPath: z.string(),
      permissionMode: z.enum(['allow-reads', 'allow-edits', 'allow-all']).default('allow-all'),
    }),
  ),
  chats: z.array(chatSchema),
  activeChatId: z.string().nullable(),
  collapsedProjectIds: z.array(z.string()),
})
type State = Omit<z.infer<typeof fileSchema>, 'chats'> & { chats: WorkspaceChat[] }

export class WorkspaceStore {
  private operation: Promise<unknown> = Promise.resolve()
  private readonly filePath: string
  constructor(filePath: string) {
    this.filePath = filePath
  }

  async snapshot(): Promise<WorkspaceSnapshot> {
    await this.operation
    const { projects, chats, activeChatId, collapsedProjectIds } = await this.read()
    return {
      projects,
      chats: chats
        .map(({ messages: _messages, contextSnapshot: _contextSnapshot, ...chat }) => chat)
        .sort((a, b) => b.updatedAt - a.updatedAt),
      activeChatId,
      collapsedProjectIds,
    }
  }
  async getChat(id: string): Promise<WorkspaceChat> {
    await this.operation
    const chat = (await this.read()).chats.find((chat) => chat.id === id)
    if (!chat) throw new Error('会话不存在。')
    return chat
  }
  async addProject(selectedPath: string) {
    let rootPath: string
    try {
      rootPath = await realpath(selectedPath)
      if (!(await stat(rootPath)).isDirectory()) throw new Error()
    } catch {
      throw new Error('所选目录不存在或无法访问。')
    }
    return this.mutate((state) => {
      const existing = state.projects.find((project) => project.rootPath === rootPath)
      if (existing) return existing
      const project = {
        id: randomUUID(),
        name: basename(rootPath) || rootPath,
        rootPath,
        permissionMode: 'allow-all' as const,
      }
      state.projects.push(project)
      return project
    })
  }
  setProjectPermission(projectId: string, permissionMode: WorkspacePermissionMode): Promise<void> {
    return this.mutate((state) => {
      const project = state.projects.find((candidate) => candidate.id === projectId)
      if (!project) throw new Error('工作区不存在。')
      project.permissionMode = permissionMode
    })
  }
  createChat(projectId: string): Promise<WorkspaceChat> {
    return this.mutate((state) => {
      if (!state.projects.some((p) => p.id === projectId)) throw new Error('工作区不存在。')
      const chat: WorkspaceChat = {
        id: randomUUID(),
        projectId,
        title: '新会话',
        updatedAt: Date.now(),
        messages: [],
        runId: null,
        status: 'idle',
        unread: false,
        error: null,
      }
      state.chats.push(chat)
      state.activeChatId = chat.id
      return chat
    })
  }
  createSideChat(
    parentId: string,
    forkMessageId: string,
    contextSnapshot?: string,
  ): Promise<WorkspaceChat> {
    return this.mutate((state) => {
      const parent = state.chats.find((chat) => chat.id === parentId)
      if (!parent || parent.parentChatId || parent.archived || parent.status !== 'completed')
        throw new Error('只能从已完成的主会话创建侧聊。')
      if (
        parent.messages.at(-1)?.id !== forkMessageId ||
        parent.messages.at(-1)?.role !== 'assistant'
      )
        throw new Error('主会话分叉点已变化，请重试。')
      const chat: WorkspaceChat = {
        id: randomUUID(),
        projectId: parent.projectId,
        parentChatId: parent.id,
        forkMessageId,
        contextSnapshot,
        title: '侧聊',
        updatedAt: Date.now(),
        messages: [],
        runId: null,
        status: 'idle',
        archived: false,
        unread: false,
        error: null,
      }
      state.chats.push(chat)
      return chat
    })
  }
  updateChat(
    id: string,
    patch: Partial<
      Pick<WorkspaceChat, 'messages' | 'runId' | 'status' | 'unread' | 'error' | 'plan'>
    >,
    expectedRunId?: string,
  ): Promise<WorkspaceChat> {
    const captured = structuredClone(patch)
    return this.mutate((state) => {
      const chat = state.chats.find((c) => c.id === id)
      if (!chat) throw new Error('会话不存在。')
      if (expectedRunId !== undefined && chat.runId !== expectedRunId)
        throw new Error('过期运行不能修改会话。')
      Object.assign(chat, captured)
      if (captured.messages) {
        const first = chat.messages.find((m) => m.role === 'user')
        const title = first?.parts
          .filter((p) => p.type === 'text')
          .map((p) => p.text)
          .join(' ')
          .trim()
          .replace(/\s+/g, ' ')
        chat.title =
          chat.titleOverride ??
          Array.from(title || '新会话')
            .slice(0, 40)
            .join('')
        chat.updatedAt = Date.now()
      }
      return chat
    })
  }
  updatePlan(id: string, runId: string, input: PlanTodoList): Promise<PlanTodoList> {
    const next = planTodoListSchema.parse(input)
    return this.mutate((state) => {
      const chat = state.chats.find((candidate) => candidate.id === id)
      if (!chat) throw new Error('会话不存在。')
      if (chat.runId !== runId || chat.status !== 'running') throw new Error('计划运行已失效。')
      const merged = mergePlanTodoList(chat.plan, next)
      chat.plan = merged
      chat.updatedAt = Date.now()
      return merged
    })
  }
  manageChat(id: string, input: ChatManagement): Promise<string[]> {
    return this.mutate((state) => {
      const chat = state.chats.find((c) => c.id === id)
      if (!chat) throw new Error('会话不存在。')
      const affected = [chat, ...state.chats.filter((c) => c.parentChatId === id)]
      if (input.action === 'rename') {
        const title = z.string().trim().min(1).max(120).parse(input.title)
        chat.title = title
        chat.titleOverride = title
      } else if (input.action === 'delete') {
        const ids = new Set(affected.map((c) => c.id))
        state.chats = state.chats.filter((c) => !ids.has(c.id))
      } else for (const item of affected) item.archived = input.action === 'archive'
      if ((input.action === 'archive' || input.action === 'delete') && state.activeChatId === id)
        state.activeChatId = null
      return input.action === 'delete' ? affected.map((c) => c.id) : []
    })
  }
  setPreferences(preferences: Partial<WorkspacePreferences>): Promise<void> {
    return this.mutate((state) => {
      if (preferences.activeChatId !== undefined) {
        if (
          preferences.activeChatId !== null &&
          !state.chats.some((c) => c.id === preferences.activeChatId)
        )
          throw new Error('会话不存在。')
        state.activeChatId = preferences.activeChatId
      }
      if (preferences.collapsedProjectIds)
        state.collapsedProjectIds = preferences.collapsedProjectIds.filter((id) =>
          state.projects.some((p) => p.id === id),
        )
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
    this.operation = result.then(
      () => undefined,
      () => undefined,
    )
    return result
  }
  private async read(): Promise<State> {
    try {
      const state = fileSchema.parse(JSON.parse(await readFile(this.filePath, 'utf8'))) as State
      const ids = new Set(state.projects.map((p) => p.id))
      const chats = new Set(state.chats.map((c) => c.id))
      if (
        ids.size !== state.projects.length ||
        chats.size !== state.chats.length ||
        state.chats.some((c) => !ids.has(c.projectId)) ||
        (state.activeChatId !== null && !chats.has(state.activeChatId))
      )
        throw new Error('无效引用')
      const byId = new Map(state.chats.map((chat) => [chat.id, chat]))
      for (const chat of state.chats) {
        const hasSideMetadata =
          chat.parentChatId !== undefined ||
          chat.forkMessageId !== undefined ||
          chat.contextSnapshot !== undefined
        if (!hasSideMetadata) continue
        const parent = chat.parentChatId ? byId.get(chat.parentChatId) : undefined
        if (
          !parent ||
          parent.parentChatId ||
          parent.projectId !== chat.projectId ||
          !chat.forkMessageId
        )
          throw new Error('无效侧聊引用')
        if (chat.contextSnapshot !== undefined) {
          if (Buffer.byteLength(chat.contextSnapshot, 'utf8') > 64 * 1024)
            throw new Error('侧聊上下文超限')
          z.array(z.object({ role: z.enum(['user', 'assistant']), text: z.string() }))
            .min(1)
            .parse(JSON.parse(chat.contextSnapshot))
        }
      }
      return state
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT')
        return { version: 1, projects: [], chats: [], activeChatId: null, collapsedProjectIds: [] }
      throw new Error('工作区数据无法读取或格式损坏，原文件已保留。', { cause: error })
    }
  }
}
