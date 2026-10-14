import { ArrowLeft, ArrowRight, Globe, Plus, RotateCw, X } from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'
import type { BrowserSiteState, BrowserTabBounds } from '@shared/browser'
import { browserTargetFromInput } from '@shared/browser'
import { Button } from '@/components/ui/button'
import type { PanelProps } from '@/lib/panels/registry'
import {
  hasBlockingOverlay,
  sameBrowserBounds,
  shouldShowBrowserSurface,
  toBrowserBounds,
} from '@/lib/panels/browserSurface'
import { PanelPlaceholder } from './PanelPlaceholder'

function errorMessage(error: unknown): string {
  if (error instanceof Error && error.message.trim() !== '') return error.message
  return '浏览器操作失败。'
}

/** IPC 回来的错误带 Electron 前缀，这里只保留可读部分。 */
function readableFailure(error: unknown): string {
  return errorMessage(error).replace(/^Error invoking remote method '[^']+':\s*/, '')
}

export default function BrowserPanel({ context, data }: PanelProps) {
  const projectId = context.projectId
  const [state, setState] = useState<BrowserSiteState | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [address, setAddress] = useState('')
  const [editingAddress, setEditingAddress] = useState(false)
  const [overlayed, setOverlayed] = useState(false)
  const [documentHidden, setDocumentHidden] = useState(
    typeof document === 'undefined' ? false : document.hidden,
  )
  const surfaceRef = useRef<HTMLDivElement | null>(null)
  const lastBoundsRef = useRef<BrowserTabBounds | null>(null)
  const handledPreviewRef = useRef<string | null>(null)

  const activeTab = state?.tabs.find((tab) => tab.id === state.activeTabId) ?? null

  const run = useCallback(async (action: () => Promise<BrowserSiteState>) => {
    try {
      const next = await action()
      setState(next)
      setError(null)
    } catch (failure) {
      setError(readableFailure(failure))
    }
  }, [])

  useEffect(() => {
    if (!projectId) return
    let cancelled = false
    window.sailor.browser
      .attach({ projectId })
      .then((next) => {
        if (!cancelled) setState(next)
      })
      .catch((failure) => {
        if (!cancelled) setError(readableFailure(failure))
      })
    const unsubscribe = window.sailor.browser.subscribe((next) => {
      if (next.projectId !== projectId) return
      setState(next)
    })
    return () => {
      cancelled = true
      unsubscribe()
      // 面板切走只把原生视图摘下来，页面本身留在 main 里。
      void window.sailor.browser.detach({ projectId }).catch(() => {})
    }
  }, [projectId])

  // 原生视图永远画在页面之上，所以只要可能被盖住就必须主动摘掉。
  useEffect(() => {
    const update = () => setOverlayed(hasBlockingOverlay(document))
    update()
    const observer = new MutationObserver(update)
    observer.observe(document.body, { childList: true, subtree: true })
    return () => observer.disconnect()
  }, [])

  useEffect(() => {
    const update = () => setDocumentHidden(document.hidden)
    document.addEventListener('visibilitychange', update)
    return () => document.removeEventListener('visibilitychange', update)
  }, [])

  useEffect(() => {
    if (editingAddress || activeTab === null) return
    setAddress(activeTab.url === 'about:blank' ? '' : activeTab.url)
  }, [activeTab?.url, activeTab === null, editingAddress])

  const visible = shouldShowBrowserSurface({
    mounted: true,
    active: true,
    overlayed,
    documentHidden,
    hasActiveTab: activeTab !== null,
  })

  // 抓取类工具会把结果投递到浏览器面板：这里直接打开真实页面，
  // 面板不再是"渲染一段文本"，而是真的把那一条 URL 浏览出来。
  const previewUrl = data.preview?.url ?? null
  useEffect(() => {
    if (!projectId || previewUrl === null || previewUrl === '') return
    if (handledPreviewRef.current === previewUrl) return
    handledPreviewRef.current = previewUrl
    void run(() => window.sailor.browser.navigate({ projectId, input: previewUrl }))
  }, [previewUrl, projectId, run])

  const reportBounds = useCallback(() => {
    if (!projectId) return
    const element = surfaceRef.current
    const next =
      visible && element !== null ? toBrowserBounds(element.getBoundingClientRect()) : null
    if (sameBrowserBounds(lastBoundsRef.current, next)) return
    lastBoundsRef.current = next
    void window.sailor.browser.setBounds({ projectId, bounds: next }).catch(() => {})
  }, [projectId, visible])

  useEffect(() => {
    reportBounds()
  }, [reportBounds, state?.activeTabId])

  useEffect(() => {
    const element = surfaceRef.current
    if (element === null) return
    const observer = new ResizeObserver(() => reportBounds())
    observer.observe(element)
    window.addEventListener('resize', reportBounds)
    const frame = requestAnimationFrame(reportBounds)
    return () => {
      observer.disconnect()
      window.removeEventListener('resize', reportBounds)
      cancelAnimationFrame(frame)
    }
  }, [reportBounds, visible])

  if (!projectId) {
    return (
      <PanelPlaceholder
        description="浏览器绑定到工作区。"
        hint="先关联一个工作区，再打开浏览器。"
        icon={Globe}
        title="浏览器"
      />
    )
  }

  const submitAddress = () => {
    setEditingAddress(false)
    const parsed = browserTargetFromInput(address)
    if (!parsed.ok) {
      setError(parsed.reason)
      return
    }
    void run(() => window.sailor.browser.navigate({ projectId, input: address }))
  }

  return (
    <div className="panel-web">
      <div className="panel-web-toolbar">
        <Button
          aria-label="后退"
          disabled={activeTab?.canGoBack !== true}
          onClick={() =>
            void run(() => window.sailor.browser.history({ projectId, direction: 'back' }))
          }
          size="icon-sm"
          type="button"
          variant="ghost"
        >
          <ArrowLeft />
        </Button>
        <Button
          aria-label="前进"
          disabled={activeTab?.canGoForward !== true}
          onClick={() =>
            void run(() => window.sailor.browser.history({ projectId, direction: 'forward' }))
          }
          size="icon-sm"
          type="button"
          variant="ghost"
        >
          <ArrowRight />
        </Button>
        <Button
          aria-label={activeTab?.loading === true ? '停止加载' : '刷新'}
          onClick={() =>
            void run(() =>
              activeTab?.loading === true
                ? window.sailor.browser.stop({ projectId })
                : window.sailor.browser.reload({ projectId }),
            )
          }
          size="icon-sm"
          type="button"
          variant="ghost"
        >
          {activeTab?.loading === true ? <X /> : <RotateCw />}
        </Button>
        <label className="panel-web-address" data-loading={activeTab?.loading === true}>
          <input
            aria-label="地址"
            onChange={(event) => {
              setEditingAddress(true)
              setAddress(event.target.value)
            }}
            onKeyDown={(event) => {
              if (event.key === 'Enter') submitAddress()
              if (event.key === 'Escape') {
                setEditingAddress(false)
                setAddress(activeTab?.url === 'about:blank' ? '' : (activeTab?.url ?? ''))
              }
            }}
            placeholder="输入地址，回车打开"
            spellCheck={false}
            value={address}
          />
          <span className="panel-web-address-status">
            {activeTab?.loading === true ? '加载中' : ''}
          </span>
        </label>
      </div>

      <div className="panel-web-tabs">
        <div aria-label="浏览器标签页" className="panel-web-tabs-scroll" role="tablist">
          {state?.tabs.map((tab) => (
            <span className="panel-web-tab" data-active={tab.id === state.activeTabId} key={tab.id}>
              <button
                aria-selected={tab.id === state.activeTabId}
                className="panel-web-tab-trigger"
                onClick={() =>
                  void run(() => window.sailor.browser.activateTab({ projectId, tabId: tab.id }))
                }
                role="tab"
                type="button"
              >
                <span aria-hidden className="panel-web-tab-dot" data-loading={tab.loading} />
                <span className="panel-web-tab-label">
                  {tab.title === '' ? '新标签页' : tab.title}
                </span>
              </button>
              <button
                aria-label={`关闭${tab.title}`}
                className="panel-web-tab-close"
                onClick={() =>
                  void run(() => window.sailor.browser.closeTab({ projectId, tabId: tab.id }))
                }
                type="button"
              >
                <X size={12} />
              </button>
            </span>
          ))}
        </div>
        <Button
          aria-label="新建标签页"
          onClick={() => void run(() => window.sailor.browser.newTab({ projectId }))}
          size="icon-sm"
          type="button"
          variant="ghost"
        >
          <Plus />
        </Button>
      </div>

      {error !== null && <p className="panel-web-error">{error}</p>}

      {/* 原生视图只覆盖这个占位区；工具条与 tab 条始终由页面自己渲染。 */}
      <div className="panel-web-surface" data-hidden={!visible} ref={surfaceRef}>
        {state?.tabs.length === 0 && <div className="panel-web-empty">还没有标签页</div>}
      </div>
    </div>
  )
}
