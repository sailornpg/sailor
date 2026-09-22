import { useCallback, useEffect, useRef, useState } from 'react'
import type { Chat } from '@ai-sdk/react'
import type { UIMessage } from 'ai'
import type { ModelSelection, SettingsSnapshot } from '@shared/contracts'
import type { WorkspaceSnapshot } from '@shared/workspaces'
import { ChatWorkspace } from '@/components/chat/ChatWorkspace'
import { ProviderSettingsDialog } from '@/components/settings/ProviderSettingsDialog'
import { WorkspaceChats } from '@/lib/WorkspaceChats'
import { Button } from '@/components/ui/button'
import { FolderOpen } from 'lucide-react'
import { InspectorPanel, type WebPreviewState } from './InspectorPanel'
import { ProjectSidebar } from './ProjectSidebar'

const emptySettings: SettingsSnapshot = {
  providers: [],
  activeModel: null,
}
const emptyWorkspace: WorkspaceSnapshot = { projects: [], chats: [], activeChatId: null, collapsedProjectIds: [] }
export function AppShell() {
  const [rightVisible, setRightVisible] = useState(false)
  const [webPreview, setWebPreview] = useState<WebPreviewState | undefined>()
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [settings, setSettings] = useState<SettingsSnapshot>(emptySettings)
  const [snapshot, setSnapshot] = useState(emptyWorkspace)
  const [registry] = useState(() => new WorkspaceChats(window.sailor.workspaces, error => setError(error instanceof Error ? error.message : '偏好保存失败。')))
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
      const selected = await registry.select(id)
      if (selected && version === selectionVersion.current) { setChat(selected) }
    } catch (error) { if (version === selectionVersion.current) report(error) }
    finally { if (version === selectionVersion.current) setSwitching(false) }
  }, [registry])
  useEffect(() => {
    const unsubscribe = window.sailor.workspaces.subscribe(() => { void refresh().catch(report) })
    void refresh().then(next => {
      if (!restored.current) { restored.current = true; if (next.activeChatId) void select(next.activeChatId) }
    }).catch(error => { report(error); setLoading(false) })
    void window.sailor.settings.getSnapshot().then(setSettings).catch(report)
    return unsubscribe
  }, [refresh, select])
  useEffect(() => {
    const onPreview = (event: Event) => {
      const detail = (event as CustomEvent<WebPreviewState>).detail
      if (!detail || typeof detail.url !== 'string' || typeof detail.content !== 'string') return
      setWebPreview(detail)
      setRightVisible(true)
    }
    window.addEventListener('sailor:web-preview', onPreview)
    return () => window.removeEventListener('sailor:web-preview', onPreview)
  }, [])
  const perform = (action: () => Promise<unknown>) => { setError(null); void action().catch(report) }
  const active = snapshot.chats.find(item => item.id === chat?.id)
  useEffect(() => {
    if (!loading && chat && !snapshot.chats.some(item => item.id === chat.id)) {
      ++selectionVersion.current
      registry.forget(chat.id)
      setChat(null)
      setSwitching(false)
    }
  }, [loading, chat, snapshot.chats, registry])
  const project = snapshot.projects.find(item => item.id === active?.projectId)
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
  return <div className="app-shell">
    <ProjectSidebar snapshot={snapshot} activeId={chat?.id ?? null} loading={loading} error={error}
      onOpenSettings={() => setSettingsOpen(true)} onAddProject={() => perform(addProject)} onNewChat={id => perform(() => createChat(id))}
      onSelect={id => { void select(id) }}
      onManage={async (id, input) => {
        await window.sailor.workspaces.manageChat(id, input)
        if (input.action === 'delete') registry.forget(id)
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
    {chat ? <ChatWorkspace key={chat.id} chat={chat} summary={active} project={project} registry={registry} switching={switching}
      onRetrySave={() => perform(() => window.sailor.workspaces.retrySave(chat.id))}
      onOpenSettings={() => setSettingsOpen(true)} onSelectModel={selectModel} onToggleInspector={() => setRightVisible(value => !value)} settings={settings} />
      : <main className="workspace-empty"><FolderOpen size={36} /><h1>让想法从工作区开始</h1><p>选择一个本地目录，在这里开启独立的会话。</p><Button onClick={() => perform(() => createChat())}>选择目录并新建会话</Button>{(loading || switching) && <span role="status">正在加载…</span>}</main>}
    {rightVisible && <InspectorPanel preview={webPreview} />}
    <ProviderSettingsDialog
      onChange={setSettings}
      onOpenChange={setSettingsOpen}
      open={settingsOpen}
      settings={settings}
    />
  </div>
}
