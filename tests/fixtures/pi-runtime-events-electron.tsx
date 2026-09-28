import '@/styles/globals.css'
import { useEffect, useState } from 'react'
import { createRoot } from 'react-dom/client'
import type { Chat } from '@ai-sdk/react'
import type { UIMessage } from 'ai'
import { WorkspaceChats } from '@/lib/WorkspaceChats'
import { SailorChatProvider } from '@/components/chat/runtime/SailorChatProvider'
import { Thread, type ThreadComponents } from '@/components/assistant-ui/elements/thread.aui'
import { PiRuntimeEventStatus } from '@/components/chat/events/PiRuntimeEventStatus'
import { TransientErrorNotice } from '@/components/chat/composer/TransientErrorNotice'
import { SailorComposerContext } from '@/components/chat/composer/SailorComposerContext'
import { SailorToolFallback } from '@/components/chat/tools/sailorToolkit'
import { SailorToolCalls } from '@/components/chat/tools/SailorToolCall'

const registry = new WorkspaceChats(window.sailor.workspaces)

function App() {
  const [activeId, setActiveId] = useState('chat-a')
  const [chat, setChat] = useState<Chat<UIMessage> | null>(null)
  const [noticeVersion, setNoticeVersion] = useState(0)
  useEffect(() => {
    let active = true
    void registry.get(activeId).then((value) => {
      if (active) setChat(value)
    })
    return () => {
      active = false
    }
  }, [activeId])
  useEffect(() => {
    if (!chat) return
    ;(window as any).__piSmoke = {
      run: async (text: string) => {
        await chat.sendMessage({ text })
        await (window.sailor as any).fixture.saveMessages(chat.id, chat.messages)
      },
      compact: async () => {
        const messages = await window.sailor.agent.compact(chat.id)
        await registry.applyMessages(chat.id, messages)
      },
      select: async (id: string) => {
        setActiveId(id)
      },
      showError: () => setNoticeVersion((version) => version + 1),
      chatId: chat.id,
    }
  }, [chat])

  if (!chat || chat.id !== activeId) return <div role="status">正在加载会话</div>
  const components: ThreadComponents = {
    Composer: () => (
      <div className="flex justify-end px-4">
        <SailorComposerContext />
      </div>
    ),
    RuntimeEventStatus: () => <PiRuntimeEventStatus chatId={activeId} />,
    ToolFallback: SailorToolFallback,
    ToolGroup: SailorToolCalls,
  }
  return (
    <main className="relative h-screen min-w-0" data-active-chat={activeId}>
      <SailorChatProvider chat={chat}>
        <Thread autoFocus={false} components={components} />
      </SailorChatProvider>
      {noticeVersion > 0 && (
        <div className="absolute inset-x-4 bottom-8">
          <TransientErrorNotice key={noticeVersion} message="手动压缩失败，请重试。" />
        </div>
      )}
    </main>
  )
}

createRoot(document.getElementById('root')!).render(<App />)
