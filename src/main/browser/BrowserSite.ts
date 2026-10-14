import { randomUUID } from 'node:crypto'
import { CdpSession, describeError, type CdpDebuggerHost } from './cdp.js'
import { createRefTable, type RefTable } from './snapshot.js'
import {
  BROWSER_MAX_TABS,
  browserTargetFromInput,
  isAllowedBrowserUrl,
  type BrowserTabBounds,
  type BrowserSiteState,
  type BrowserTabSummary,
} from '../../shared/browser.js'

export type { BrowserTabBounds }

export interface BrowserTabEventSource {
  on(event: string, listener: (...args: unknown[]) => void): void
}

/**
 * main 侧真正需要的那部分 webContents。
 * 抽出来是为了让 BrowserSite 能用假实现做单测，和终端面板的 PtyAdapter 同一思路。
 */
export interface BrowserTabContents {
  readonly debugger: CdpDebuggerHost
  getURL(): string
  getTitle(): string
  isLoading(): boolean
  canGoBack(): boolean
  canGoForward(): boolean
  isDestroyed(): boolean
  goBack(): void
  goForward(): void
  reload(): void
  stop(): void
  loadURL(url: string): Promise<void>
  close(): void
  on(event: string, listener: (...args: unknown[]) => void): void
}

export interface BrowserTab {
  readonly id: string
  readonly contents: BrowserTabContents
  /** null 表示该 tab 当前不该显示（被切走、面板隐藏、窗口失焦）。 */
  setBounds(bounds: BrowserTabBounds | null): void
  destroy(): void
}

export interface BrowserTabFactory {
  createTab(id: string): BrowserTab
}

export type BrowserActionResult =
  { ok: true; tab: BrowserTabSummary | null } | { ok: false; reason: string }

export interface BrowserSiteOptions {
  projectId: string
  factory: BrowserTabFactory
  maxTabs?: number
  /** 状态变化（标题/地址/加载/前进后退/授权）时触发，由调用方决定如何节流广播。 */
  onChange?: () => void
  /** 仅供测试注入稳定 id。 */
  createId?: () => string
}

interface TabEntry {
  tab: BrowserTab
  refs: RefTable
  cdp: CdpSession
}

/**
 * 一个项目一个浏览器站点：持有若干 tab、当前活动 tab、当前几何与 Agent 授权开关。
 *
 * 不变式：
 * - 只有一个 tab 处于"已挂载"状态，切 tab 不销毁 webContents。
 * - 任何交给 webContents 的地址都必须先过 browserTargetFromInput + isAllowedBrowserUrl。
 * - 面板不可见时活动 tab 的 bounds 为 null，绝不把 view 留在屏幕上。
 */
export class BrowserSite {
  readonly projectId: string
  readonly #factory: BrowserTabFactory
  readonly #maxTabs: number
  readonly #onChange: (() => void) | undefined
  readonly #createId: () => string
  readonly #entries = new Map<string, TabEntry>()
  readonly #order: string[] = []
  #activeTabId: string | null = null
  #bounds: BrowserTabBounds | null = null
  #destroyed = false

  constructor(options: BrowserSiteOptions) {
    this.projectId = options.projectId
    this.#factory = options.factory
    this.#maxTabs = options.maxTabs ?? BROWSER_MAX_TABS
    this.#onChange = options.onChange
    this.#createId = options.createId ?? (() => randomUUID())
  }

  get destroyed(): boolean {
    return this.#destroyed
  }

  get activeTabId(): string | null {
    return this.#activeTabId
  }

  get activeEntry(): { refs: RefTable; cdp: CdpSession; tab: BrowserTab } | null {
    const id = this.#activeTabId
    if (id === null) return null
    const entry = this.#entries.get(id)
    return entry === undefined ? null : { refs: entry.refs, cdp: entry.cdp, tab: entry.tab }
  }

  entryFor(tabId: string): { refs: RefTable; cdp: CdpSession; tab: BrowserTab } | null {
    const entry = this.#entries.get(tabId)
    return entry === undefined ? null : { refs: entry.refs, cdp: entry.cdp, tab: entry.tab }
  }

  hasTabs(): boolean {
    return this.#order.length > 0
  }

  state(): BrowserSiteState {
    return {
      projectId: this.projectId,
      activeTabId: this.#activeTabId,
      tabs: this.#summaries(),
    }
  }

  openTab(input?: string): BrowserActionResult {
    if (this.#destroyed) return { ok: false, reason: '浏览器站点已经销毁。' }
    if (this.#order.length >= this.#maxTabs) {
      return {
        ok: false,
        reason: `每个工作区最多同时打开 ${this.#maxTabs} 个标签页，请先关闭一个。`,
      }
    }
    const id = this.#createId()
    let tab: BrowserTab
    try {
      tab = this.#factory.createTab(id)
    } catch (cause) {
      return { ok: false, reason: `无法创建浏览器标签页：${describeError(cause)}` }
    }
    const cdp = new CdpSession(tab.contents.debugger)
    this.#entries.set(id, { tab, refs: createRefTable(), cdp })
    this.#order.push(id)
    this.#bindTabEvents(id, tab)
    this.#setActive(id)
    if (input !== undefined && input.trim() !== '') {
      const result = this.navigate(id, input)
      if (!result.ok) return result
    }
    this.#notify()
    return { ok: true, tab: this.summaryFor(id) }
  }

  closeTab(tabId: string): BrowserActionResult {
    const entry = this.#entries.get(tabId)
    if (entry === undefined) return { ok: false, reason: '这个标签页不存在或已经关闭。' }
    this.#entries.delete(tabId)
    const index = this.#order.indexOf(tabId)
    if (index >= 0) this.#order.splice(index, 1)
    try {
      entry.cdp.detach()
      entry.tab.destroy()
    } catch (cause) {
      console.error(`关闭浏览器标签页失败：${describeError(cause)}`)
    }
    if (this.#activeTabId === tabId) {
      const next = this.#order[Math.min(index, this.#order.length - 1)] ?? null
      this.#activeTabId = null
      if (next !== null) this.#setActive(next)
      else this.#bounds = null
    }
    this.#notify()
    return { ok: true, tab: this.#activeTabId === null ? null : this.summaryFor(this.#activeTabId) }
  }

  activateTab(tabId: string): BrowserActionResult {
    if (!this.#entries.has(tabId)) return { ok: false, reason: '这个标签页不存在或已经关闭。' }
    this.#setActive(tabId)
    this.#notify()
    return { ok: true, tab: this.summaryFor(tabId) }
  }

  navigate(tabId: string, input: string): BrowserActionResult {
    const entry = this.#entries.get(tabId)
    if (entry === undefined) return { ok: false, reason: '这个标签页不存在或已经关闭。' }
    const parsed = browserTargetFromInput(input)
    if (!parsed.ok) return { ok: false, reason: parsed.reason }

    if (parsed.target.kind === 'history') {
      const canGo =
        parsed.target.direction === 'back'
          ? entry.tab.contents.canGoBack()
          : entry.tab.contents.canGoForward()
      if (!canGo)
        return {
          ok: false,
          reason: `没有可${parsed.target.direction === 'back' ? '后退' : '前进'}的历史记录。`,
        }
      if (parsed.target.direction === 'back') entry.tab.contents.goBack()
      else entry.tab.contents.goForward()
      this.#notify()
      return { ok: true, tab: this.summaryFor(tabId) }
    }

    // 纵深防御：即使上层校验被绕过，也不把非白名单协议交给 webContents。
    if (!isAllowedBrowserUrl(parsed.target.url)) {
      return { ok: false, reason: `只允许 http、https 和 about 地址。` }
    }
    const { url } = parsed.target
    void entry.tab.contents.loadURL(url).catch((cause: unknown) => {
      console.error(`浏览器加载失败：${url}：${describeError(cause)}`)
    })
    this.#notify()
    return { ok: true, tab: this.summaryFor(tabId) }
  }

  reload(tabId: string): BrowserActionResult {
    const entry = this.#entries.get(tabId)
    if (entry === undefined) return { ok: false, reason: '这个标签页不存在或已经关闭。' }
    entry.tab.contents.reload()
    this.#notify()
    return { ok: true, tab: this.summaryFor(tabId) }
  }

  stop(tabId: string): BrowserActionResult {
    const entry = this.#entries.get(tabId)
    if (entry === undefined) return { ok: false, reason: '这个标签页不存在或已经关闭。' }
    entry.tab.contents.stop()
    this.#notify()
    return { ok: true, tab: this.summaryFor(tabId) }
  }

  /** 面板上报的内容区几何；null 表示这一帧不该显示浏览器。 */
  setActiveBounds(bounds: BrowserTabBounds | null): void {
    this.#bounds = bounds
    this.#applyBounds()
  }

  /** 供工具层在页面变化后刷新状态。 */
  notifyChanged(): void {
    this.#notify()
  }

  destroy(): void {
    if (this.#destroyed) return
    this.#destroyed = true
    for (const id of [...this.#order]) {
      const entry = this.#entries.get(id)
      if (entry === undefined) continue
      try {
        entry.cdp.detach()
        entry.tab.destroy()
      } catch (cause) {
        console.error(`销毁浏览器标签页失败：${describeError(cause)}`)
      }
    }
    this.#entries.clear()
    this.#order.length = 0
    this.#activeTabId = null
    this.#bounds = null
  }

  #bindTabEvents(tabId: string, tab: BrowserTab): void {
    const source = tab.contents as unknown as BrowserTabEventSource
    for (const event of [
      'page-title-updated',
      'did-start-loading',
      'did-stop-loading',
      'did-navigate',
      'did-navigate-in-page',
      'did-fail-load',
      'did-finish-load',
    ]) {
      source.on(event, () => {
        if (this.#destroyed) return
        this.#notify()
      })
    }
  }

  #setActive(tabId: string): void {
    const previous = this.#activeTabId
    if (previous === tabId) {
      this.#applyBounds()
      return
    }
    if (previous !== null) this.#entries.get(previous)?.tab.setBounds(null)
    this.#activeTabId = tabId
    this.#applyBounds()
  }

  #applyBounds(): void {
    for (const [id, entry] of this.#entries) {
      entry.tab.setBounds(id === this.#activeTabId ? this.#bounds : null)
    }
  }

  #summaries(): BrowserTabSummary[] {
    return this.#order
      .map((id) => this.summaryFor(id))
      .filter((tab): tab is BrowserTabSummary => tab !== null)
  }

  summaryFor(tabId: string): BrowserTabSummary | null {
    const entry = this.#entries.get(tabId)
    if (entry === undefined) return null
    const { contents } = entry.tab
    if (contents.isDestroyed()) return null
    const url = contents.getURL()
    const title = contents.getTitle()
    return {
      id: tabId,
      title: title.trim() === '' ? (url === '' ? '新标签页' : url) : title,
      url,
      loading: contents.isLoading(),
      canGoBack: contents.canGoBack(),
      canGoForward: contents.canGoForward(),
    }
  }

  #notify(): void {
    this.#onChange?.()
  }
}
