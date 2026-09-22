import { useCallback, useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import type { Chat } from '@ai-sdk/react'
import type { UIMessage } from 'ai'
import type { ModelSelection, SettingsSnapshot } from '@shared/contracts'
import type { WorkspaceSnapshot } from '@shared/workspaces'
import { ChatWorkspace } from '@/components/chat/ChatWorkspace'
import { ProviderSettingsDialog } from '@/components/settings/ProviderSettingsDialog'
import { WorkspaceChats } from '@/lib/WorkspaceChats'
import { Button } from '@/components/ui/button'
import { FolderOpen } from 'lucide-react'
import { DEFAULT_PANEL_ID, panelDescriptors } from '@/lib/panels/descriptors'
import { subscribePanelRequests, type PanelRuntimeData } from '@/lib/panels/panelData'
import { createPanelRegistry } from '@/lib/panels/registry'
import { detectPanelPlatform } from '@/lib/panels/shortcuts'
import { usePanelLayout, usePanelShortcuts } from '@/lib/panels/usePanelLayout'
import { PanelAddButton } from './PanelAddButton'
import { PanelDock } from './PanelDock'
import { PanelToolbar } from './PanelToolbar'
import { ProjectSidebar } from './ProjectSidebar'

const emptySettings: SettingsSnapshot = {
  providers: [],
  activeModel: null,
}
const emptyWorkspace: WorkspaceSnapshot = { projects: [], chats: [], activeChatId: null, collapsedProjectIds: [] }
export function AppShell() {
  const [panelData, setPanelData] = useState<PanelRuntimeData>({})
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [settings, setSettings] = useState<SettingsSnapshot>(emptySettings)
  const [snapshot, setSnapshot] = useState(emptyWorkspace)
  const [chatRegistry] = useState(() => new WorkspaceChats(window.sailor.workspaces, error => setError(error instanceof Error ? error.message : '偏好保存失败。')))
  const [chat, setChat] = useState<Chat<UIMessage> | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [switching, setSwitching] = useState(false)
  const refreshVersion = useRef(0)
  const selectionVersion = useRef(0)
  const restored = useRef(false)
  const report = (error: unknown) => setError(error instanceof Error ? error.message : '操作失败，请重试。')
  const refresh = useCallback(async () => {
    const version = ++refreshVersion.current
    const next = await window.sailor.workspaces.snapshot()
    if (version === refreshVersion.current) { setSnapshot(next); setLoading(false) }
    return next
  }, [])
  const select = useCallback(async (id: string) => {
    const version = ++selectionVersion.current
    setSwitching(true)
    setError(null)
    try {
      const selected = await chatRegistry.select(id)
      if (selected && version === selectionVersion.current) { setChat(selected) }
    } catch (error) { if (version === selectionVersion.current) report(error) }
    finally { if (version === selectionVersion.current) setSwitching(false) }
  }, [chatRegistry])
  useEffect(() => {
    const unsubscribe = window.sailor.workspaces.subscribe(() => { void refresh().catch(report) })
    void refresh().then(next => {
      if (!restored.current) { restored.current = true; if (next.activeChatId) void select(next.activeChatId) }
    }).catch(error => { report(error); setLoading(false) })
    void window.sailor.settings.getSnapshot().then(setSettings).catch(report)
    return unsubscribe
  }, [refresh, select])
  const perform = (action: () => Promise<unknown>) => { setError(null); void action().catch(report) }
  const active = snapshot.chats.find(item => item.id === chat?.id)
  useEffect(() => {
    if (!loading && chat && !snapshot.chats.some(item => item.id === chat.id)) {
      ++selectionVersion.current
      chatRegistry.forget(chat.id)
      setChat(null)
      setSwitching(false)
    }
  }, [loading, chat, snapshot.chats, chatRegistry])
  const project = snapshot.projects.find(item => item.id === active?.projectId)

  const [panelRegistry] = useState(() => createPanelRegistry(panelDescriptors))
  const [platform] = useState(() => detectPanelPlatform(navigator.userAgent))
  const panelContext = { chatId: chat?.id ?? null, projectId: project?.id ?? null }
  const panels = usePanelLayout(panelRegistry, panelContext, DEFAULT_PANEL_ID)
  usePanelShortcuts(panelRegistry, panelContext, panels.open)
  useEffect(() => subscribePanelRequests(request => {
    if (request.data) setPanelData(current => ({ ...current, ...request.data }))
    panels.open(request.panelId)
  }), [panels.open])
  const openPanel = (panelId: string) => { panels.open(panelId) }
  const dockVisible = panels.layout.visible && panels.layout.open.length > 0
  const panelToolbar: ReactNode = <PanelToolbar context={panelContext} onPick={openPanel} onToggle={panels.toggleVisible} platform={platform} registry={panelRegistry} visible={dockVisible} />

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
  const selectModel = async (selection: ModelSelection) => { setSettings(await window.sailor.settings.setActiveModel(selection)) }
  return <div className="app-shell" data-dock={dockVisible ? 'open' : 'closed'} style={{ '--panel-width': `${panels.layout.width}px` } as CSSProperties}>
    <ProjectSidebar snapshot={snapshot} activeId={chat?.id ?? null} loading={loading} error={error}
      onOpenSettings={() => setSettingsOpen(true)} onAddProject={() => perform(addProject)} onNewChat={id => perform(() => createChat(id))}
      onSelect={id => { void select(id) }}
      onManage={async (id, input) => {
        await window.sailor.workspaces.manageChat(id, input)
        if (input.action === 'delete') chatRegistry.forget(id)
        if ((input.action === 'archive' || input.action === 'delete') && chat?.id === id) {
          ++selectionVersion.current
          setChat(null)
          setSwitching(false)
        }
        await refresh()
      }}
      onRetry={() => perform(refresh)} onCollapse={(id, open) => perform(async () => {
        const collapsedProjectIds = open ? snapshot.collapsedProjectIds.filter(value => value !== id) : [...snapshot.collapsedProjectIds, id]
        setSnapshot(current => ({ ...current, collapsedProjectIds }))
        await window.sailor.workspaces.setPreferences({ collapsedProjectIds })
      })} />
    {chat ? <ChatWorkspace key={chat.id} chat={chat} summary={active} project={project} registry={chatRegistry} switching={switching}
      onRetrySave={() => perform(() => window.sailor.workspaces.retrySave(chat.id))}
      onOpenSettings={() => setSettingsOpen(true)} onSelectModel={selectModel} panelToolbar={panelToolbar} settings={settings} />
      : <main className="workspace-empty"><FolderOpen size={36} /><h1>让想法从工作区开始</h1><p>选择一个本地目录，在这里开启独立的会话。</p><Button onClick={() => perform(() => createChat())}>选择目录并新建会话</Button>{(loading || switching) && <span role="status">正在加载…</span>}</main>}
    <PanelDock context={panelContext} data={panelData} layout={panels.layout} onActivate={panels.activate} onClose={panels.close}
      picker={<PanelAddButton context={panelContext} onPick={openPanel} platform={platform} registry={panelRegistry} />} registry={panelRegistry} />
    <ProviderSettingsDialog
      onChange={setSettings}
      onOpenChange={setSettingsOpen}
      open={settingsOpen}
      settings={settings}
    />
  </div>
}
