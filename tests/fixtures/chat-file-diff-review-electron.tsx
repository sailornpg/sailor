import '@/styles/globals.css'
import { useEffect, useState } from 'react'
import { createRoot } from 'react-dom/client'
import type { Chat } from '@ai-sdk/react'
import type { UIMessage } from 'ai'
import { WorkspaceChats } from '@/lib/WorkspaceChats'
import { SailorChatProvider } from '@/components/chat/runtime/SailorChatProvider'
import { SailorComposer } from '@/components/chat/composer/SailorComposer'
import { TurnFileChangeCard } from '@/components/chat/review/TurnFileChangeCard'
import { Thread, type ThreadComponents } from '@/components/assistant-ui/elements/thread.aui'
import { PanelDock } from '@/components/layout/PanelDock'
import { panelDescriptors } from '@/lib/panels/descriptors'
import { createPanelRegistry } from '@/lib/panels/registry'
import { subscribePanelRequests } from '@/lib/panels/panelData'
import { usePanelLayout } from '@/lib/panels/usePanelLayout'
import type { PanelRuntimeData } from '@/lib/panels/panelData'

const chats = new WorkspaceChats(window.sailor.workspaces)
const registry = createPanelRegistry(panelDescriptors)

declare global {
  interface Window {
    __reviewSmoke: { select: (id: string) => void; openTurn: (turnId: string) => void }
  }
}

function ReviewThread({ chatId }: { chatId: string }) {
  const components: ThreadComponents = {
    FileChangeCard: ({ turnId }) => <TurnFileChangeCard chatId={chatId} turnId={turnId} />,
    Composer: () => null,
    Welcome: () => null,
  }
  return <Thread autoFocus={false} components={components} />
}

function App() {
  const [chatId, setChatId] = useState('chat-a')
  const [chat, setChat] = useState<Chat<UIMessage> | null>(null)
  const [panelData, setPanelData] = useState<PanelRuntimeData>({})
  const context = { chatId, projectId: 'project-1' }
  const panels = usePanelLayout(registry, context)

  useEffect(() => {
    let active = true
    void chats.get(chatId).then((value) => {
      if (active) setChat(value)
    })
    return () => {
      active = false
    }
  }, [chatId])
  useEffect(
    () =>
      subscribePanelRequests((request) => {
        panels.open(request.panelId)
        setPanelData(request.data ?? {})
      }),
    [panels.open],
  )
  window.__reviewSmoke = {
    select: setChatId,
    openTurn: (turnId) => {
      setPanelData({ review: { turnId } })
      panels.open('review')
    },
  }

  return (
    <main className="flex h-screen min-w-0 bg-background text-foreground" data-active-chat={chatId}>
      <section className="flex min-w-0 flex-1 flex-col justify-end gap-4 px-4 pb-4">
        {chat?.id === chatId && (
          <SailorChatProvider chat={chat}>
            <div className="flex h-80 w-full min-w-0 flex-col" data-turn-message-list>
              <ReviewThread chatId={chatId} />
            </div>
            <div className="w-full min-w-0">
              <SailorComposer
                chatId={chatId}
                registry={chats}
                project={{
                  id: 'project-1',
                  name: 'Test',
                  rootPath: '/fixture',
                  permissionMode: 'allow-all',
                }}
                settings={{ providers: [], activeModel: null }}
                onSelectModel={async () => {}}
                onOpenSettings={() => {}}
                onNewChat={async () => {}}
                onCompact={async () => {}}
                onRetrySave={() => {}}
              />
            </div>
          </SailorChatProvider>
        )}
      </section>
      <div className="relative w-[min(420px,48vw)] shrink-0">
        <PanelDock
          layout={panels.layout}
          registry={registry}
          context={context}
          data={panelData}
          platform="mac"
          onActivate={panels.activate}
          onClose={panels.close}
          onPick={panels.open}
          onResize={panels.setWidth}
        />
      </div>
    </main>
  )
}

createRoot(document.getElementById('root')!).render(<App />)
