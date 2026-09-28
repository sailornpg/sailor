import { workspaceContextDrafts } from './workspaceContextDrafts'
import { sideChatQuoteDrafts } from './sideChatQuoteDrafts'
import { lastAssistantMessageIsCompleteWithApprovalResponses, type UIMessage } from 'ai'
import { Chat } from '@ai-sdk/react'
import type { SailorApi, ThinkingLevel } from '@shared/contracts'
import type { PlanTodoList } from '@shared/planTodo'
import type { WorkspaceChatSummary } from '@shared/workspaces'
import { IpcChatTransport } from './IpcChatTransport'

// Lives above the selected view: unmounting a view never disposes its Chat or stream.
export class WorkspaceChats {
  private readonly entries = new Map<string, Promise<Chat<UIMessage>>>()
  // A workspace snapshot can briefly omit plan while a run's persistence is settling.
  // Keep the last valid projection per run so switching views does not erase it.
  private readonly planSnapshots = new Map<string, { runId: string | null; plan?: PlanTodoList }>()
  private selection = 0
  private readonly onPreferenceError: (error: unknown) => void
  private readonly api: Pick<SailorApi['workspaces'], 'getChat' | 'setPreferences'>
  readonly reasoning = new Map<string, ThinkingLevel>()
  activeId: string | null = null
  constructor(
    api: Pick<SailorApi['workspaces'], 'getChat' | 'setPreferences'>,
    onPreferenceError: (error: unknown) => void = () => {},
  ) {
    this.api = api
    this.onPreferenceError = onPreferenceError
  }
  get(id: string): Promise<Chat<UIMessage>> {
    let entry = this.entries.get(id)
    if (!entry) {
      entry = this.api.getChat(id).then(
        (saved) =>
          new Chat({
            id,
            messages: saved.messages,
            transport: new IpcChatTransport(() => this.reasoning.get(id) ?? 'provider-default'),
            sendAutomaticallyWhen: lastAssistantMessageIsCompleteWithApprovalResponses,
          }),
      )
      this.entries.set(id, entry)
      void entry.catch(() => {
        this.entries.delete(id)
      })
    }
    return entry
  }
  async applyMessages(id: string, messages: UIMessage[]): Promise<void> {
    const entry = this.entries.get(id)
    if (entry) (await entry).messages = messages
  }
  async refreshMessages(id: string): Promise<void> {
    const entry = this.entries.get(id)
    if (entry) (await entry).messages = (await this.api.getChat(id)).messages
  }
  forget(id: string) {
    workspaceContextDrafts.forget(id)
    sideChatQuoteDrafts.forget(id)
    this.entries.delete(id)
    this.planSnapshots.delete(id)
    this.reasoning.delete(id)
    if (this.activeId === id) {
      this.activeId = null
      ++this.selection
    }
  }

  rememberPlanSnapshots(chats: readonly WorkspaceChatSummary[]) {
    for (const chat of chats) {
      const previous = this.planSnapshots.get(chat.id)
      if (!previous || previous.runId !== chat.runId) {
        this.planSnapshots.set(chat.id, { runId: chat.runId, plan: chat.plan })
      } else if (chat.plan) {
        previous.plan = chat.plan
      }
    }
  }

  getStablePlan(chat: WorkspaceChatSummary | undefined): PlanTodoList | undefined {
    if (!chat) return undefined
    const previous = this.planSnapshots.get(chat.id)
    if (!previous || previous.runId !== chat.runId) return chat.plan
    return chat.plan ?? previous.plan
  }
  async select(id: string): Promise<Chat<UIMessage> | null> {
    const ticket = ++this.selection
    const chat = await this.get(id)
    if (ticket !== this.selection) return null
    this.activeId = id
    void this.api.setPreferences({ activeChatId: id }).catch(this.onPreferenceError)
    return chat
  }
}
