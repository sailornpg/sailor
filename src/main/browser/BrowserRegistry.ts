import type { BrowserSiteState } from '../../shared/browser.js'
import { BrowserSite, type BrowserTabFactory } from './BrowserSite.js'
import type { BrowserCapture } from './BrowserCaptures.js'

/**
 * 同时保持存活的浏览器站点上限。面板切走只是把视图摘下来（页面还在），
 * 因此这里用 LRU 兜住"打开过很多工作区"的情况，避免无限增长。
 */
export const BROWSER_MAX_SITES = 4

/** Agent 侧真正依赖的那部分浏览器能力；让工具层不直接持有 Electron 对象。 */
export interface BrowserAgentAccess {
  /** 拿到该工作区的浏览器；没有就现建，不能让 Agent 卡在"要用户先点一下"。 */
  acquire(projectId: string): Promise<BrowserAgentTarget>
  saveCapture(input: {
    chatId: string
    png: Uint8Array
    width: number
    height: number
  }): Promise<BrowserCapture>
}

export type BrowserAgentTarget =
  | { ok: true; site: BrowserSite }
  | { ok: false; code: 'NOT_CONFIGURED' | 'LIMIT_EXCEEDED'; reason: string; recovery: string }

export interface BrowserRegistryOptions {
  createFactory(): BrowserTabFactory
  /** 校验 projectId 是否真实存在；不存在时抛错。 */
  resolveProjectRoot(projectId: string): Promise<string>
  /** 站点状态变化时的广播入口。 */
  onChange(projectId: string): void
  /**
   * Agent 真的要用浏览器时回调一次。renderer 用它把右侧栏打开并切到浏览器面板，
   * 保证用户看得到正在被操作的页面；用户自己操作浏览器不会触发。
   */
  onAgentActivity?(projectId: string): void
}

export interface BrowserCaptureStore {
  save(input: {
    chatId: string
    png: Uint8Array
    width: number
    height: number
  }): Promise<BrowserCapture>
  read(chatId: string, captureId: string): Promise<Uint8Array>
}

/**
 * 工作区 → 浏览器站点的注册表。
 *
 * 浏览器默认对 Agent 可用：没有站点就现建一个，没有标签页就补一个空白页。
 * 页面本身只在面板打开时才可见（几何由 renderer 上报），因此不存在"后台偷看"——
 * 用户随时能在面板里看到同一个页面、并随时接管。
 */
export class BrowserRegistry implements BrowserAgentAccess {
  readonly #options: BrowserRegistryOptions
  readonly #sites = new Map<string, BrowserSite>()
  readonly #captures: BrowserCaptureStore

  constructor(options: BrowserRegistryOptions, captures: BrowserCaptureStore) {
    this.#options = options
    this.#captures = captures
  }

  site(projectId: string): BrowserSite | undefined {
    return this.#sites.get(projectId)
  }

  async ensureSite(projectId: string): Promise<BrowserSite> {
    const existing = this.#sites.get(projectId)
    if (existing !== undefined) return existing
    await this.#options.resolveProjectRoot(projectId)
    while (this.#sites.size >= BROWSER_MAX_SITES) {
      const oldest = this.#sites.keys().next()
      if (oldest.done === true) break
      this.closeSite(oldest.value)
    }
    const site = new BrowserSite({
      projectId,
      factory: this.#options.createFactory(),
      onChange: () => this.#options.onChange(projectId),
    })
    this.#sites.set(projectId, site)
    return site
  }

  closeSite(projectId: string): void {
    const site = this.#sites.get(projectId)
    if (site === undefined) return
    this.#sites.delete(projectId)
    site.destroy()
  }

  snapshot(projectId: string): BrowserSiteState {
    const site = this.#sites.get(projectId)
    if (site === undefined) return { projectId, activeTabId: null, tabs: [] }
    return site.state()
  }

  /**
   * Agent 拿浏览器不需要任何前置动作：站点现建、标签页现补。
   * 只有"这个会话没有可用工作区"或站点建不出来才会失败，且失败也给出可执行的下一步。
   */
  async acquire(projectId: string): Promise<BrowserAgentTarget> {
    let site: BrowserSite
    try {
      site = await this.ensureSite(projectId)
    } catch (cause) {
      return {
        ok: false,
        code: 'NOT_CONFIGURED',
        reason: `这个工作区开不了浏览器：${cause instanceof Error ? cause.message : String(cause)}`,
        recovery: '请确认该会话仍然关联着有效的工作区，然后重试。',
      }
    }
    if (site.destroyed) {
      return {
        ok: false,
        code: 'NOT_CONFIGURED',
        reason: '浏览器站点已经被回收。',
        recovery: '重试一次即可重新创建浏览器站点。',
      }
    }
    if (!site.hasTabs()) {
      const opened = site.openTab()
      if (!opened.ok) {
        return {
          ok: false,
          code: 'LIMIT_EXCEEDED',
          reason: opened.reason,
          recovery: '请先用 browser_tabs 关掉不需要的标签页。',
        }
      }
    }
    // 每次 Agent 动手都请求一次展示：幂等，用户在跑任务中途关掉侧栏也会被重新打开。
    this.#options.onAgentActivity?.(projectId)
    return { ok: true, site }
  }

  saveCapture(input: {
    chatId: string
    png: Uint8Array
    width: number
    height: number
  }): Promise<BrowserCapture> {
    return this.#captures.save(input)
  }

  readCapture(chatId: string, captureId: string): Promise<Uint8Array> {
    return this.#captures.read(chatId, captureId)
  }

  disposeAll(): void {
    for (const projectId of [...this.#sites.keys()]) this.closeSite(projectId)
  }
}
