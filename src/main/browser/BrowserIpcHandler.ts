import { z } from 'zod'
import type { BrowserSiteState } from '../../shared/browser.js'
import type { BrowserRegistry } from './BrowserRegistry.js'

export interface BrowserSender {
  readonly id: number
  isDestroyed(): boolean
  send(payload: BrowserSiteState): void
}

export interface BrowserIpcOptions {
  registry: BrowserRegistry
  isTrustedSender(sender: BrowserSender): boolean
}

export class BrowserIpcError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'BrowserIpcError'
  }
}

const projectId = z.string().min(1).max(200)
const tabId = z.string().min(1).max(64)

const boundsSchema = z
  .object({
    x: z.number().finite().min(-100_000).max(100_000),
    y: z.number().finite().min(-100_000).max(100_000),
    width: z.number().finite().min(1).max(100_000),
    height: z.number().finite().min(1).max(100_000),
  })
  .nullable()

const schemas = {
  attach: z.strictObject({ projectId }),
  project: z.strictObject({ projectId }),
  setBounds: z.strictObject({ projectId, bounds: boundsSchema }),
  tab: z.strictObject({ projectId, tabId }),
  newTab: z.strictObject({ projectId, url: z.string().max(2000).optional() }),
  navigate: z.strictObject({ projectId, input: z.string().min(1).max(2000) }),
  history: z.strictObject({ projectId, direction: z.enum(['back', 'forward']) }),
  capture: z.strictObject({
    chatId: z.string().min(1).max(200),
    captureId: z.string().min(1).max(64),
  }),
}

/**
 * renderer 与浏览器站点之间唯一的桥。
 * 每个请求都校验：可信发送方、严格字段、projectId 真实存在。
 * renderer 不能提交路径、URL 之外的执行参数，也不能直接拿到 webContents。
 */
export class BrowserIpcHandler {
  readonly #registry: BrowserRegistry
  readonly #isTrustedSender: (sender: BrowserSender) => boolean

  constructor(options: BrowserIpcOptions) {
    this.#registry = options.registry
    this.#isTrustedSender = options.isTrustedSender
  }

  async attach(sender: BrowserSender, input: unknown): Promise<BrowserSiteState> {
    this.#assertTrusted(sender)
    const value = schemas.attach.parse(input)
    const site = await this.#registry.ensureSite(value.projectId)
    // 打开面板即"我要一个浏览器"：没有标签页时补一个空白页，和终端面板同一心智。
    if (!site.hasTabs()) site.openTab()
    return this.#registry.snapshot(value.projectId)
  }

  /**
   * 面板卸载只把视图摘下来（页面与登录态保留），不销毁站点。
   * 站点的销毁交给 LRU 上限和应用退出，因此切换面板 tab 不会丢掉页面。
   */
  async detach(sender: BrowserSender, input: unknown): Promise<void> {
    this.#assertTrusted(sender)
    const value = schemas.project.parse(input)
    this.#registry.site(value.projectId)?.setActiveBounds(null)
  }

  async setBounds(sender: BrowserSender, input: unknown): Promise<void> {
    this.#assertTrusted(sender)
    const value = schemas.setBounds.parse(input)
    this.#registry.site(value.projectId)?.setActiveBounds(value.bounds)
  }

  async navigate(sender: BrowserSender, input: unknown): Promise<BrowserSiteState> {
    this.#assertTrusted(sender)
    const value = schemas.navigate.parse(input)
    const site = this.#requireSite(value.projectId)
    const tabId = this.#requireTabId(site.activeTabId)
    const result = site.navigate(tabId, value.input)
    if (!result.ok) throw new BrowserIpcError(result.reason)
    return this.#registry.snapshot(value.projectId)
  }

  async history(sender: BrowserSender, input: unknown): Promise<BrowserSiteState> {
    this.#assertTrusted(sender)
    const value = schemas.history.parse(input)
    const site = this.#requireSite(value.projectId)
    const tabId = this.#requireTabId(site.activeTabId)
    const result = site.navigate(tabId, value.direction)
    if (!result.ok) throw new BrowserIpcError(result.reason)
    return this.#registry.snapshot(value.projectId)
  }

  async reload(sender: BrowserSender, input: unknown): Promise<BrowserSiteState> {
    this.#assertTrusted(sender)
    const value = schemas.project.parse(input)
    const site = this.#requireSite(value.projectId)
    site.reload(this.#requireTabId(site.activeTabId))
    return this.#registry.snapshot(value.projectId)
  }

  async stop(sender: BrowserSender, input: unknown): Promise<BrowserSiteState> {
    this.#assertTrusted(sender)
    const value = schemas.project.parse(input)
    const site = this.#requireSite(value.projectId)
    site.stop(this.#requireTabId(site.activeTabId))
    return this.#registry.snapshot(value.projectId)
  }

  async newTab(sender: BrowserSender, input: unknown): Promise<BrowserSiteState> {
    this.#assertTrusted(sender)
    const value = schemas.newTab.parse(input)
    const site = await this.#registry.ensureSite(value.projectId)
    const result = site.openTab(value.url)
    if (!result.ok) throw new BrowserIpcError(result.reason)
    return this.#registry.snapshot(value.projectId)
  }

  async closeTab(sender: BrowserSender, input: unknown): Promise<BrowserSiteState> {
    this.#assertTrusted(sender)
    const value = schemas.tab.parse(input)
    const site = this.#requireSite(value.projectId)
    const result = site.closeTab(value.tabId)
    if (!result.ok) throw new BrowserIpcError(result.reason)
    return this.#registry.snapshot(value.projectId)
  }

  async activateTab(sender: BrowserSender, input: unknown): Promise<BrowserSiteState> {
    this.#assertTrusted(sender)
    const value = schemas.tab.parse(input)
    const site = this.#requireSite(value.projectId)
    const result = site.activateTab(value.tabId)
    if (!result.ok) throw new BrowserIpcError(result.reason)
    return this.#registry.snapshot(value.projectId)
  }

  async readCapture(sender: BrowserSender, input: unknown): Promise<string> {
    this.#assertTrusted(sender)
    const value = schemas.capture.parse(input)
    const png = await this.#registry.readCapture(value.chatId, value.captureId)
    return `data:image/png;base64,${Buffer.from(png).toString('base64')}`
  }

  #requireSite(projectIdValue: string) {
    const site = this.#registry.site(projectIdValue)
    if (site === undefined) throw new BrowserIpcError('这个工作区的浏览器还没有打开。')
    return site
  }

  #requireTabId(tabIdValue: string | null): string {
    if (tabIdValue === null) throw new BrowserIpcError('浏览器面板里没有活动的标签页。')
    return tabIdValue
  }

  #assertTrusted(sender: BrowserSender): void {
    if (!this.#isTrustedSender(sender)) throw new BrowserIpcError('不接受来自该窗口的浏览器请求。')
  }
}
