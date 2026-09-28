import { useCallback, useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import type { Chat } from '@ai-sdk/react'
import type { UIMessage } from 'ai'
import type { ModelSelection, SettingsSnapshot } from '@shared/contracts'
import type { WorkspaceSnapshot } from '@shared/workspaces'
import { ChatWorkspace } from '@/components/chat/ChatWorkspace'
import { SideChatEnvironment } from '@/components/chat/runtime/SideChatEnvironment'
import { sideChatQuoteDrafts } from '@/lib/sideChatQuoteDrafts'
import { messageQuoteSchema, type MessageQuote } from '@shared/messageQuote'
import { ProviderSettingsDialog } from '@/components/settings/ProviderSettingsDialog'
import { WorkspaceChats } from '@/lib/WorkspaceChats'
import { Button } from '@/components/ui/button'
import { ParticleSailboat } from '@/components/home/ParticleSailboat'
import { SIDEBAR_WIDTH_MAX, SIDEBAR_WIDTH_MIN } from '@/lib/layout/uiLayout'
import { useUiLayout } from '@/lib/layout/useUiLayout'
import { panelDescriptors } from '@/lib/panels/descriptors'
import { subscribePanelRequests, type PanelRuntimeData } from '@/lib/panels/panelData'
import { createPanelRegistry } from '@/lib/panels/registry'
import { detectPanelPlatform } from '@/lib/panels/shortcuts'
import { usePanelLayout, usePanelShortcuts } from '@/lib/panels/usePanelLayout'
import { PaneResizer } from './PaneResizer'
import { PanelDock } from './PanelDock'
import { PanelToolbar } from './PanelToolbar'
import { ProjectSidebar } from './ProjectSidebar'

const emptySettings: SettingsSnapshot = {
  providers: [],
  activeModel: null,
}
const emptyWorkspace: WorkspaceSnapshot = {
  projects: [],
  chats: [],
  activeChatId: null,
  collapsedProjectIds: [],
}
export function AppShell() {
  const [panelData, setPanelData] = useState<PanelRuntimeData>({})
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [settings, setSettings] = useState<SettingsSnapshot>(emptySettings)
  const [snapshot, setSnapshot] = useState(emptyWorkspace)
  const [chatRegistry] = useState(
    () =>
      new WorkspaceChats(window.sailor.workspaces, (error) =>
        setError(error instanceof Error ? error.message : '偏好保存失败。'),
      ),
  )
  const [chat, setChat] = useState<Chat<UIMessage> | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [switching, setSwitching] = useState(false)
  const refreshVersion = useRef(0)
  const selectionVersion = useRef(0)
  const restored = useRef(false)
  const report = (error: unknown) =>
    setError(error instanceof Error ? error.message : '操作失败，请重试。')
  const refresh = useCallback(async () => {
    const version = ++refreshVersion.current
    const next = await window.sailor.workspaces.snapshot()
    if (version === refreshVersion.current) {
      chatRegistry.rememberPlanSnapshots(next.chats)
      setSnapshot(next)
      setLoading(false)
    }
    return next
  }, [])
  const select = useCallback(
    async (id: string) => {
      const version = ++selectionVersion.current
      setSwitching(true)
      setError(null)
      try {
        const selected = await chatRegistry.select(id)
        if (selected && version === selectionVersion.current) {
          setChat(selected)
        }
      } catch (error) {
        if (version === selectionVersion.current) report(error)
      } finally {
        if (version === selectionVersion.current) setSwitching(false)
      }
    },
    [chatRegistry],
  )
  useEffect(() => {
    const unsubscribe = window.sailor.workspaces.subscribe(() => {
      void refresh().catch(report)
    })
    void refresh()
      .then((next) => {
        if (!restored.current) {
          restored.current = true
          if (next.activeChatId) void select(next.activeChatId)
        }
      })
      .catch((error) => {
        report(error)
        setLoading(false)
      })
    void window.sailor.settings.getSnapshot().then(setSettings).catch(report)
    return unsubscribe
  }, [refresh, select])
  const perform = (action: () => Promise<unknown>) => {
    setError(null)
    void action().catch(report)
  }
  const active = snapshot.chats.find((item) => item.id === chat?.id)
  useEffect(() => {
    if (!loading && chat && !snapshot.chats.some((item) => item.id === chat.id)) {
      ++selectionVersion.current
      chatRegistry.forget(chat.id)
      setChat(null)
      setSwitching(false)
    }
  }, [loading, chat, snapshot.chats, chatRegistry])
  const project = snapshot.projects.find((item) => item.id === active?.projectId)

  const [panelRegistry] = useState(() => createPanelRegistry(panelDescriptors))
  const [platform] = useState(() => detectPanelPlatform(navigator.userAgent))
  const ui = useUiLayout()
  const panelContext = {
    chatId: chat?.id ?? null,
    projectId: project?.id ?? null,
  }
  const panels = usePanelLayout(panelRegistry, panelContext)
  usePanelShortcuts(panelRegistry, panelContext, panels.open)
  useEffect(
    () =>
      subscribePanelRequests((request) => {
        if (request.data) setPanelData((current) => ({ ...current, ...request.data }))
        panels.open(request.panelId)
      }),
    [panels.open],
  )
  const openPanel = (panelId: string) => {
    panels.open(panelId)
  }
  const dockVisible = panels.layout.visible
  const panelToolbar: ReactNode = (
    <PanelToolbar onToggle={panels.toggleVisible} visible={dockVisible} />
  )
  const shellStyle = {
    '--sidebar-width': `${ui.layout.leftWidth}px`,
    '--panel-width': `${panels.layout.width}px`,
  } as CSSProperties

  const addProject = async () => {
    const project = await window.sailor.workspaces.pickProject()
    await refresh()
    return project
  }
  const createChat = async (projectId?: string) => {
    const id = projectId ?? project?.id ?? (await addProject())?.id
    if (!id) return
    const created = await window.sailor.workspaces.createChat(id)
    await refresh()
    await select(created.id)
  }
  const selectModel = async (selection: ModelSelection) => {
    setSettings(await window.sailor.settings.setActiveModel(selection))
  }
  const createSideChat = async (parentChatId: string, question?: string, quote?: MessageQuote) => {
    if (chat?.id !== parentChatId) throw new Error('主会话已切换，请重新开启侧聊。')
    const selectedQuote = quote ? messageQuoteSchema.parse(quote) : undefined
    const side = await window.sailor.workspaces.createSideChat(parentChatId)
    if (selectedQuote) sideChatQuoteDrafts.set(side.id, selectedQuote)
    setPanelData((current) => ({ ...current, sideChat: { chatId: side.id, parentChatId } }))
    panels.open('side-chat')
    await refresh()
    if (question) {
      const sideChat = await chatRegistry.get(side.id)
      void sideChat.sendMessage({ text: question }).catch(report)
    }
  }
  return (
    <div
      className="app-shell"
      data-left={ui.layout.leftCollapsed ? 'collapsed' : 'open'}
      data-dock={dockVisible ? 'open' : 'closed'}
      style={shellStyle}
    >
      <ProjectSidebar
        snapshot={snapshot}
        activeId={chat?.id ?? null}
        collapsed={ui.layout.leftCollapsed}
        error={error}
        loading={loading}
        onAddProject={() => perform(addProject)}
        onCollapse={(id, open) =>
          perform(async () => {
            const collapsedProjectIds = open
              ? snapshot.collapsedProjectIds.filter((value) => value !== id)
              : [...snapshot.collapsedProjectIds, id]
            setSnapshot((current) => ({ ...current, collapsedProjectIds }))
            await window.sailor.workspaces.setPreferences({
              collapsedProjectIds,
            })
          })
        }
        onManage={async (id, input) => {
          await window.sailor.workspaces.manageChat(id, input)
          if (input.action === 'delete') {
            chatRegistry.forget(id)
            for (const child of snapshot.chats.filter((item) => item.parentChatId === id))
              chatRegistry.forget(child.id)
          }
          if ((input.action === 'archive' || input.action === 'delete') && chat?.id === id) {
            ++selectionVersion.current
            setChat(null)
            setSwitching(false)
          }
          await refresh()
        }}
        onNewChat={(id) => perform(() => createChat(id))}
        onOpenSettings={() => setSettingsOpen(true)}
        onRetry={() => perform(refresh)}
        onSelect={(id) => {
          void select(id)
        }}
        onToggleCollapsed={ui.toggleLeftCollapsed}
        platform={platform}
        /* Inside the pane it resizes: an absolutely positioned sibling would anchor to the shell, not the column. */
        resizer={
          <PaneResizer
            label="调整侧边栏宽度"
            max={SIDEBAR_WIDTH_MAX}
            min={SIDEBAR_WIDTH_MIN}
            onCollapse={() => ui.setLeftCollapsed(true)}
            onResize={ui.setLeftWidth}
            side="left"
            width={ui.layout.leftWidth}
          />
        }
      />
      {chat ? (
        <ChatWorkspace
          key={chat.id}
          chat={chat}
          summary={active}
          project={project}
          registry={chatRegistry}
          switching={switching}
          onRetrySave={() => perform(() => window.sailor.workspaces.retrySave(chat.id))}
          onOpenSettings={() => setSettingsOpen(true)}
          onOpenSideChat={(question, quote) => createSideChat(chat.id, question, quote)}
          onNewChat={() => createChat(project?.id)}
          onCompact={async () => {
            try {
              await chatRegistry.applyMessages(chat.id, await window.sailor.agent.compact(chat.id))
            } catch (error) {
              await chatRegistry.refreshMessages(chat.id).catch(() => {})
              throw error
            }
          }}
          onSelectModel={selectModel}
          panelToolbar={panelToolbar}
          settings={settings}
        />
      ) : (
        <main className="workspace-empty">
          <ParticleSailboat />
          <h1>呀嘞呀嘞……那就从这里起航吧</h1>
          <p>选择一个本地目录，在这里开启独立的会话。</p>
          <Button onClick={() => perform(() => createChat())}>选定港湾，起航</Button>
          {(loading || switching) && <span role="status">正在加载…</span>}
        </main>
      )}
      <SideChatEnvironment
        value={{
          registry: chatRegistry,
          snapshot,
          settings,
          createChat: (projectId) => createChat(projectId),
          createSideChat,
          onSelectModel: selectModel,
          onOpenSettings: () => setSettingsOpen(true),
        }}
      >
        <PanelDock
          context={panelContext}
          data={panelData}
          layout={panels.layout}
          onActivate={panels.activate}
          onClose={panels.close}
          onPick={openPanel}
          onResize={panels.setWidth}
          platform={platform}
          registry={panelRegistry}
        />
      </SideChatEnvironment>
      <ProviderSettingsDialog
        onChange={setSettings}
        onOpenChange={setSettingsOpen}
        open={settingsOpen}
        settings={settings}
      />
    </div>
  )
}
