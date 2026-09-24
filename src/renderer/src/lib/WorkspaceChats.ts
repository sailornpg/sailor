import { workspaceContextDrafts } from './workspaceContextDrafts'
import { sideChatQuoteDrafts } from './sideChatQuoteDrafts'
import { lastAssistantMessageIsCompleteWithApprovalResponses, type UIMessage } from 'ai'
import { Chat } from '@ai-sdk/react'
import type { SailorApi, ReasoningEffort } from '@shared/contracts'
import { IpcChatTransport } from './IpcChatTransport'

// Lives above the selected view: unmounting a view never disposes its Chat or stream.
export class WorkspaceChats {
  private readonly entries = new Map<string, Promise<Chat<UIMessage>>>()
  private selection = 0
  private readonly onPreferenceError: (error: unknown) => void
  private readonly api: Pick<SailorApi['workspaces'], 'getChat' | 'setPreferences'>
  readonly reasoning = new Map<string, ReasoningEffort>()
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
  forget(id: string) {
    workspaceContextDrafts.forget(id)
    sideChatQuoteDrafts.forget(id)
    this.entries.delete(id)
    this.reasoning.delete(id)
    if (this.activeId === id) {
      this.activeId = null
      ++this.selection
    }
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
