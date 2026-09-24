import { createContext, useContext, type ReactNode } from 'react'
import { ConversationMapAui } from '@/components/assistant-ui/elements/conversation-map.aui'
import { ChatEntryContext, useChatEntry } from './ChatEntryContext'
import { ChatParticleBackdrop } from './ChatParticleBackdrop'
import { ComposerTransition } from './ComposerTransition'
import { Thread, type ThreadComponents } from '@/components/assistant-ui/elements/thread.aui'
import type { WorkspaceChats } from '@/lib/WorkspaceChats'
import type { ModelSelection, ProjectSummary, SettingsSnapshot } from '@shared/contracts'
import type { WorkspaceChatSummary } from '@shared/workspaces'
import { SailorComposer } from '../composer/SailorComposer'
import { SailorToolCall, SailorToolCalls } from '../tools/SailorToolCall'
import { SelectionQuoteToolbar } from './SelectionQuoteToolbar'
import type { MessageQuote } from '@shared/messageQuote'

interface SailorThreadProps {
  chatId: string
  project?: ProjectSummary
  registry: WorkspaceChats
  summary?: WorkspaceChatSummary
  settings: SettingsSnapshot
  onSelectModel: (selection: ModelSelection) => Promise<void>
  onOpenSettings: () => void
  onOpenSideChat?: (question?: string, quote?: MessageQuote) => Promise<void>
  onRetrySave: () => void
  variant?: 'main' | 'side'
}

const SailorThreadContext = createContext<SailorThreadProps | null>(null)

function useSailorThreadConfig() {
  const value = useContext(SailorThreadContext)
  if (!value) throw new Error('Sailor thread slot rendered without configuration')
  return value
}

function SailorWelcome() {
  const { project } = useSailorThreadConfig()
  return (
    <div className="sailor-thread-welcome">
      <div className="particle-sailboat" data-boat-anchor aria-hidden="true" />
      <h1>呀嘞呀嘞……那就交给我吧。</h1>
      <p>{project?.name ?? '工作区'}</p>
    </div>
  )
}

function SailorComposerSlot() {
  return <SailorComposer {...useSailorThreadConfig()} />
}

function SailorConversationMap() {
  return <ConversationMapAui side="right" />
}

const THREAD_COMPONENTS: ThreadComponents = {
  ViewportNavigation: SailorConversationMap,
  Welcome: SailorWelcome,
  Composer: SailorComposerSlot,
  ToolFallback: SailorToolCall,
  ToolGroup: SailorToolCalls,
}

export function SailorThread(props: SailorThreadProps): ReactNode {
  if (props.variant === 'side') return <SailorSideThreadView key={props.chatId} {...props} />
  return <SailorThreadView key={props.chatId} {...props} />
}

function SailorSideThreadView(props: SailorThreadProps): ReactNode {
  return (
    <SailorThreadContext.Provider value={props}>
      <div className="side-chat-thread">
        <Thread
          autoFocus
          components={{ ...THREAD_COMPONENTS, ViewportNavigation: undefined, Welcome: () => null }}
        />
      </div>
    </SailorThreadContext.Provider>
  )
}

function SailorThreadView(props: SailorThreadProps): ReactNode {
  const entry = useChatEntry(props.chatId)
  return (
    <SailorThreadContext.Provider value={props}>
      <ChatEntryContext.Provider value={entry.layout}>
        <div ref={entry.host} className="sailor-chat-stage" data-entry-phase={entry.phase}>
          <ChatParticleBackdrop {...entry} />
          <ComposerTransition
            phase={entry.phase}
            reduced={entry.reduced}
            footer={entry.layout.footerRef}
            host={entry.host}
          >
            <Thread autoFocus={false} components={THREAD_COMPONENTS} />
          </ComposerTransition>
          {props.onOpenSideChat && (
            <SelectionQuoteToolbar root={entry.host} onOpenSideChat={props.onOpenSideChat} />
          )}
        </div>
      </ChatEntryContext.Provider>
    </SailorThreadContext.Provider>
  )
}
