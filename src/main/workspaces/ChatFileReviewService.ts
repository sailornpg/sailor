import type { ChatFileChangeJournal } from '../agent/pi/ChatFileChangeJournal.js'
import type {
  ChatFileChangeSummary,
  FileChange,
  TurnFileChangeSummary,
} from '../../shared/fileReview.js'

export interface ChatFileReviewDependencies {
  resolveChat: (chatId: string) => Promise<{ projectId: string }>
  resolveProjectRoot: (projectId: string) => Promise<string>
  journal: (chatId: string, workspaceRoot: string) => ChatFileChangeJournal
}

export class ChatFileReviewService {
  constructor(private readonly dependencies: ChatFileReviewDependencies) {}

  private async journal(chatId: string): Promise<ChatFileChangeJournal> {
    const chat = await this.dependencies.resolveChat(chatId)
    const root = await this.dependencies.resolveProjectRoot(chat.projectId)
    return this.dependencies.journal(chatId, root)
  }

  async summary(chatId: string): Promise<ChatFileChangeSummary> {
    const result = await (await this.journal(chatId)).getChanges(chatId)
    return { ...result, changes: result.changes.map((change) => ({ ...change, lines: [] })) }
  }

  async detail(chatId: string, changeId: string): Promise<FileChange> {
    const summary = await (await this.journal(chatId)).getChanges(chatId)
    const change = summary.changes.find((item) => item.id === changeId)
    if (!change) throw new Error('变更不存在或不属于当前会话。')
    return change
  }

  async turnSummary(chatId: string, turnId: string): Promise<TurnFileChangeSummary> {
    const result = await (await this.journal(chatId)).getTurnChanges(chatId, turnId)
    return {
      ...result,
      turnId,
      status: 'completed',
      changes: result.changes.map((change) => ({ ...change, lines: [] })),
    }
  }

  async turnDetail(chatId: string, turnId: string, changeId: string): Promise<FileChange> {
    const summary = await (await this.journal(chatId)).getTurnChanges(chatId, turnId)
    const change = summary.changes.find((item) => item.id === changeId)
    if (!change || change.turnId !== turnId) throw new Error('变更不存在或不属于当前轮次。')
    return change
  }
}
