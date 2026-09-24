import { Plus, Terminal as TerminalIcon, X } from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Spinner } from '@/components/ui/spinner'
import { TERMINAL_LIMITS } from '@shared/terminal'
import type { PanelProps } from '@/lib/panels/registry'
import {
  createTerminalController,
  initialTerminalState,
  type TerminalController,
  type TerminalViewState,
} from '@/lib/terminal/terminalSession'
import {
  activateTab,
  addTab,
  adoptSessions,
  canCreateTab,
  createTabsState,
  liveTabCount,
  removeTab,
  updateTab,
  type TerminalTab,
  type TerminalTabsState,
} from '@/lib/terminal/terminalTabs'
import { needsAutoStart, startFirstSession } from '@/lib/terminal/terminalStartup'
import { readTerminalTheme } from '@/lib/terminal/terminalTheme'
import { PanelPlaceholder } from './PanelPlaceholder'

export interface TerminalTabsViewProps {
  tabs: TerminalTab[]
  activeSessionId: string | null
  canCreate: boolean
  createHint: string
  onCreate(): void
  onSelect(sessionId: string): void
  onClose(sessionId: string): void
}

/** Session tab strip; it is the panel's whole chrome — no status/size/PID text. */
export function TerminalTabsView({ tabs, activeSessionId, canCreate, createHint, onCreate, onSelect, onClose }: TerminalTabsViewProps) {
  const listRef = useRef<HTMLDivElement | null>(null)

  // The strip scrolls once there are more tabs than fit; keep the active one reachable.
  useEffect(() => {
    listRef.current?.querySelector('[data-active="true"]')?.scrollIntoView({ block: 'nearest', inline: 'nearest' })
  }, [activeSessionId])

  return (
    <div className="panel-terminal-tabs">
      <div aria-label="终端会话" className="panel-terminal-tabs-scroll" ref={listRef} role="tablist">
          {tabs.map(tab => (
          <span className="panel-terminal-tab" data-active={tab.sessionId === activeSessionId} key={tab.sessionId}>
            <button
              aria-selected={tab.sessionId === activeSessionId}
              className="panel-terminal-tab-trigger"
              onClick={() => onSelect(tab.sessionId)}
              role="tab"
              type="button"
            >
              <span aria-hidden className="panel-terminal-tab-dot" data-status={tab.phase} />
              <span className="panel-terminal-tab-label">{tab.label}</span>
            </button>
            <button
              aria-label={`关闭${tab.label}`}
              className="panel-terminal-tab-close"
              onClick={() => onClose(tab.sessionId)}
              type="button"
            >
              <X size={12} />
            </button>
          </span>
        ))}
      </div>
      <button
        aria-label="新建终端"
        className="panel-terminal-tab-add"
        disabled={!canCreate}
        onClick={onCreate}
        title={canCreate ? '新建终端' : createHint}
        type="button"
      >
        <Plus size={14} />
      </button>
    </div>
  )
}

export interface TerminalSessionStatusProps {
  view: TerminalViewState
  onCreate(): void
}

/** Non-running states and truncation notices of one session, drawn over its terminal. */
export function TerminalSessionStatus({ view, onCreate }: TerminalSessionStatusProps) {
  if (view.phase === 'starting') {
    return (
      <p className="panel-terminal-status" role="status">
        <Spinner className="size-3" />
        正在启动终端
      </p>
    )
  }
  if (view.phase === 'exited') {
    return (
      <p className="panel-terminal-status" role="status">
        已退出（退出码 {view.info?.exit?.code ?? '—'}）
        <Button onClick={onCreate} size="sm" variant="ghost">
          <Plus className="size-3" />
          新建终端
        </Button>
      </p>
    )
  }
  if (view.phase === 'failed') {
    return (
      <p className="panel-terminal-status" role="alert">
        {view.error ?? '终端启动失败。'}
        <Button onClick={onCreate} size="sm" variant="ghost">
          <Plus className="size-3" />
          新建终端
        </Button>
      </p>
    )
  }
  if (view.truncated) return <p className="panel-terminal-notice">输出过多，已丢弃较早的内容。</p>
  return null
}

interface SessionSurfaceProps {
  api: NonNullable<Window['sailor']>['terminal']
  projectId: string
  tab: TerminalTab
  isActive: boolean
  onView(sessionId: string, view: TerminalViewState): void
  onCreate(): void
  register(sessionId: string, controller: TerminalController | null): void
}

/** One xterm instance per session; inactive tabs stay mounted so their buffer survives. */
function SessionSurface({ api, projectId, tab, isActive, onView, onCreate, register }: SessionSurfaceProps) {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const controllerRef = useRef<TerminalController | null>(null)
  const terminalRef = useRef<import('@xterm/xterm').Terminal | null>(null)
  const fitRef = useRef<{ fit(): void } | null>(null)
  const [view, setView] = useState<TerminalViewState>(initialTerminalState)

  const syncSize = useCallback(() => {
    if (!isActive || !terminalRef.current || !fitRef.current) return
    try {
      fitRef.current.fit()
    } catch {
      return
    }
    const terminal = terminalRef.current
    if (terminal.cols < 2 || terminal.rows < 1) return
    void controllerRef.current?.resize(terminal.cols, terminal.rows)
  }, [isActive])

  useEffect(() => {
    let cancelled = false
    let terminal: import('@xterm/xterm').Terminal | null = null
    let controller: TerminalController | null = null
    let dataSubscription: { dispose(): void } | null = null
    let themeObserver: MutationObserver | null = null

    const mount = async () => {
      const [{ Terminal }, { FitAddon }] = await Promise.all([import('@xterm/xterm'), import('@xterm/addon-fit')])
      const container = containerRef.current
      if (cancelled || !container) return
      terminal = new Terminal({
        cursorBlink: true,
        fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
        fontSize: 12,
        lineHeight: 1.35,
        scrollback: 5000,
        theme: readTerminalTheme(document.documentElement),
      })
      const fit = new FitAddon()
      terminal.loadAddon(fit)
      terminal.open(container)
      fitRef.current = fit
      terminalRef.current = terminal

      controller = createTerminalController({
        api,
        projectId,
        write: data => terminal?.write(data),
        reset: () => terminal?.reset(),
        onState: next => {
          if (cancelled) return
          setView(next)
          onView(tab.sessionId, next)
        },
      })
      controllerRef.current = controller
      register(tab.sessionId, controller)
      dataSubscription = terminal.onData(data => {
        void controller?.send(data)
      })
      await controller.attach(tab.sessionId, terminal.cols, terminal.rows)
    }

    void mount()

    themeObserver = new MutationObserver(() => {
      if (terminal) terminal.options.theme = readTerminalTheme(document.documentElement)
    })
    themeObserver.observe(document.documentElement, { attributes: true, attributeFilter: ['class', 'style'] })

    return () => {
      cancelled = true
      themeObserver?.disconnect()
      dataSubscription?.dispose()
      void controller?.dispose()
      register(tab.sessionId, null)
      terminal?.dispose()
      controllerRef.current = null
      terminalRef.current = null
      fitRef.current = null
    }
    // The session identity is immutable per surface; `api`/`projectId` change only with the workspace.
  }, [api, projectId, tab.sessionId, register, onView])

  useEffect(() => {
    if (!isActive) return
    syncSize()
    terminalRef.current?.focus()
  }, [isActive, syncSize])

  useEffect(() => {
    if (!isActive) return
    const container = containerRef.current
    if (!container || typeof ResizeObserver === 'undefined') return
    const observer = new ResizeObserver(() => syncSize())
    observer.observe(container)
    return () => observer.disconnect()
  }, [isActive, syncSize])

  return (
    <div className="panel-terminal-surface" data-active={isActive} ref={containerRef}>
      <TerminalSessionStatus view={view} onCreate={onCreate} />
    </div>
  )
}

function TerminalWorkspace({ projectId }: { projectId: string }) {
  const api = typeof window === 'undefined' ? undefined : window.sailor?.terminal
  const [state, setState] = useState<TerminalTabsState>(() => createTabsState())
  const [error, setError] = useState<string | null>(null)
  const [booting, setBooting] = useState(true)
  const controllers = useRef(new Map<string, TerminalController>())

  useEffect(() => {
    let cancelled = false
    if (!api) return
    const open = async () => {
      try {
        const infos = await api.list({ projectId })
        if (cancelled) return
        if (!needsAutoStart(infos)) {
          setState(adoptSessions(infos))
          setBooting(false)
          return
        }
        // Opening the panel is the user's request for a terminal: start the first one here.
        const created = await startFirstSession(api, projectId)
        if (cancelled) return
        setState(current => addTab(current, created))
        setBooting(false)
      } catch (reason) {
        if (cancelled) return
        setError(reason instanceof Error ? reason.message : String(reason))
        setBooting(false)
      }
    }
    void open()
    return () => {
      cancelled = true
    }
  }, [api, projectId])

  const register = useCallback((sessionId: string, controller: TerminalController | null) => {
    if (controller) controllers.current.set(sessionId, controller)
    else controllers.current.delete(sessionId)
  }, [])

  const handleView = useCallback((sessionId: string, view: TerminalViewState) => {
    setState(current =>
      updateTab(current, sessionId, {
        phase: view.phase,
        truncated: view.truncated,
        droppedBytes: view.droppedBytes,
        error: view.phase === 'failed' ? view.error : null,
      }),
    )
  }, [])

  const create = useCallback(async () => {
    if (!api) return
    setError(null)
    try {
      const info = await api.create({ projectId, cols: TERMINAL_LIMITS.defaultCols, rows: TERMINAL_LIMITS.defaultRows })
      setState(current => addTab(current, info))
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason))
    }
  }, [api, projectId])

  const close = useCallback(
    (sessionId: string) => {
      void controllers.current.get(sessionId)?.terminate()
      setState(current => removeTab(current, sessionId))
    },
    [],
  )

  const allowed = canCreateTab(state, TERMINAL_LIMITS.maxSessionsPerProject)
  const createHint = useMemo(
    () => `每个工作区最多同时打开 ${TERMINAL_LIMITS.maxSessionsPerProject} 个终端（当前 ${liveTabCount(state)} 个）。`,
    [state],
  )

  if (!api) {
    return <PanelPlaceholder icon={TerminalIcon} title="终端" description="终端通道不可用，请重启应用。" />
  }

  return (
    <div className="panel-terminal">
      <TerminalTabsView
        activeSessionId={state.activeSessionId}
        canCreate={allowed}
        createHint={createHint}
        onClose={close}
        onCreate={() => {
          void create()
        }}
        onSelect={sessionId => setState(current => activateTab(current, sessionId))}
        tabs={state.tabs}
      />
      {error ? (
        <p className="panel-terminal-banner" role="alert">
          {error}
        </p>
      ) : null}
      {booting ? (
        <div className="panel-terminal-empty" role="status">
          <p className="panel-terminal-empty-title">
            <Spinner className="size-3" />
            正在启动终端
          </p>
        </div>
      ) : null}
      {!booting && state.tabs.length === 0 ? (
        <div className="panel-terminal-empty">
          <p className="panel-terminal-empty-title">终端没有启动</p>
          <p className="panel-terminal-empty-hint">可以重试，或用顶部的 + 新建一个；工作目录就是当前工作区的项目根目录。</p>
          <Button onClick={() => void create()} size="sm" variant="outline">
            <Plus className="size-3" />
            新建终端
          </Button>
        </div>
      ) : null}
      {state.tabs.map(tab => (
        <SessionSurface
          api={api}
          isActive={tab.sessionId === state.activeSessionId}
          key={tab.sessionId}
          onCreate={() => void create()}
          onView={handleView}
          projectId={projectId}
          register={register}
          tab={tab}
        />
      ))}
    </div>
  )
}

export default function TerminalPanel({ context }: PanelProps) {
  if (!context.projectId) {
    return (
      <PanelPlaceholder
        icon={TerminalIcon}
        title="终端"
        description="先关联一个工作区，再使用终端。"
        hint="终端的工作目录就是该工作区的项目根目录。"
      />
    )
  }
  return <TerminalWorkspace projectId={context.projectId} />
}
