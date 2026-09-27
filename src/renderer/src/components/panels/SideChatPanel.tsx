import { useEffect, useState } from 'react'
import type { Chat } from '@ai-sdk/react'
import type { UIMessage } from 'ai'
import { MessageSquarePlus } from 'lucide-react'
import type { PanelProps } from '@/lib/panels/registry'
import { useSideChatEnvironment } from '@/components/chat/runtime/SideChatEnvironment'
import { SailorChatProvider } from '@/components/chat/runtime/SailorChatProvider'
import { SailorThread } from '@/components/chat/thread/SailorThread'
import { Button } from '@/components/ui/button'

export default function SideChatPanel({ context, data }: PanelProps) {
  const {
    registry,
    snapshot,
    settings,
    createChat,
    createSideChat,
    onSelectModel,
    onOpenSettings,
  } = useSideChatEnvironment()
  const parentChatId = context.chatId
  const available = snapshot.chats.filter(
    (item) => item.parentChatId === parentChatId && !item.archived,
  )
  const requestedId =
    data.sideChat?.parentChatId === parentChatId ? data.sideChat.chatId : undefined
  const selected = available.find((item) => item.id === requestedId) ?? available[0]
  const [chat, setChat] = useState<Chat<UIMessage> | null>(null)
  const [loadedId, setLoadedId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [creating, setCreating] = useState(false)

  useEffect(() => {
    let current = true
    setChat(null)
    setLoadedId(null)
    setError(null)
    if (selected)
      void registry
        .get(selected.id)
        .then((value) => {
          if (current) {
            setChat(value)
            setLoadedId(selected.id)
          }
        })
        .catch((cause) => {
          if (current) setError(cause instanceof Error ? cause.message : '侧聊加载失败。')
        })
    return () => {
      current = false
    }
  }, [registry, selected?.id])

  const start = async () => {
    if (!parentChatId || creating) return
    setCreating(true)
    setError(null)
    try {
      await createSideChat(parentChatId)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '侧聊创建失败。')
    } finally {
      setCreating(false)
    }
  }

  if (!parentChatId) return <div className="side-chat-empty">先打开主会话。</div>
  if (!selected)
    return (
      <div className="side-chat-empty">
        <Button
          disabled={creating}
          onClick={() => {
            void start()
          }}
        >
          <MessageSquarePlus aria-hidden /> 开始侧聊
        </Button>
        {error && <p role="alert">{error}</p>}
      </div>
    )
  if (!chat || loadedId !== selected.id)
    return (
      <div className="side-chat-empty" role={error ? 'alert' : 'status'}>
        {error ?? '正在加载侧聊…'}
      </div>
    )

  const project = snapshot.projects.find((item) => item.id === selected.projectId)
  return (
    <SailorChatProvider chat={chat}>
      <div className="side-chat-panel">
        <div className="side-chat-header">
          <span className="side-chat-title" title={selected.title}>
            {selected.title}
          </span>
          <Button
            aria-label="新建侧聊"
            disabled={creating}
            size="icon"
            title="新建侧聊"
            variant="ghost"
            onClick={() => {
              void start()
            }}
          >
            <MessageSquarePlus aria-hidden />
          </Button>
        </div>
        {error && (
          <div className="runtime-error" role="alert">
            {error}
          </div>
        )}
        <SailorThread
          chatId={selected.id}
          onOpenSettings={onOpenSettings}
          onNewChat={() => createChat(project?.id)}
          onCompact={() => window.sailor.agent.compact(selected.id)}
          onRetrySave={() => {
            void window.sailor.workspaces
              .retrySave(selected.id)
              .catch((cause) => setError(cause instanceof Error ? cause.message : '保存重试失败。'))
          }}
          onSelectModel={onSelectModel}
          project={project}
          registry={registry}
          settings={settings}
          summary={selected}
          variant="side"
        />
      </div>
    </SailorChatProvider>
  )
}
