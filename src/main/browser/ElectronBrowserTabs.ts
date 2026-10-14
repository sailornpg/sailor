import { session, WebContentsView, type BrowserWindow } from 'electron'
import { BROWSER_SURFACE_RADIUS_PX, isAllowedBrowserUrl } from '../../shared/browser.js'
import type {
  BrowserTab,
  BrowserTabBounds,
  BrowserTabContents,
  BrowserTabFactory,
} from './BrowserSite.js'

/** 浏览器页面用独立分区，和应用自身的 cookie / storage 完全隔离。 */
export const BROWSER_SESSION_PARTITION = 'persist:sailor-browser'

const DEFAULT_URL = 'about:blank'

let permissionsConfigured = false

/**
 * 页面里的网站可以申请摄像头、麦克风、定位、通知等权限。Sailor 的侧边栏浏览器
 * 只用于浏览与自动化验证，一律拒绝，避免 Agent 操作期间静默授予敏感能力。
 */
function configureBrowserSession(): void {
  if (permissionsConfigured) return
  permissionsConfigured = true
  const partition = session.fromPartition(BROWSER_SESSION_PARTITION)
  partition.setPermissionRequestHandler((_contents, _permission, callback) => callback(false))
  partition.setPermissionCheckHandler(() => false)
}

class ElectronBrowserTab implements BrowserTab {
  readonly id: string
  readonly #window: BrowserWindow
  readonly #view: WebContentsView
  #mounted = false
  #destroyed = false

  constructor(window: BrowserWindow, id: string) {
    this.#window = window
    this.id = id
    configureBrowserSession()
    this.#view = new WebContentsView({
      webPreferences: {
        // 浏览器页面是纯粹的不可信外部内容：没有 preload、没有 Node、没有应用桥。
        sandbox: true,
        contextIsolation: true,
        nodeIntegration: false,
        partition: BROWSER_SESSION_PARTITION,
      },
    })
    // 面板把内容区画成圆角容器，原生视图得切同样的角，否则方形页面会盖住容器圆角。
    this.#view.setBorderRadius(BROWSER_SURFACE_RADIUS_PX)
    const { webContents } = this.#view
    webContents.setWindowOpenHandler(({ url }) => {
      // 子窗口在侧边栏里没有意义：同标签页继续导航，非法地址直接丢弃。
      if (isAllowedBrowserUrl(url)) void webContents.loadURL(url).catch(() => {})
      return { action: 'deny' }
    })
  }

  get contents(): BrowserTabContents {
    return this.#view.webContents as unknown as BrowserTabContents
  }

  setBounds(bounds: BrowserTabBounds | null): void {
    if (this.#destroyed) return
    if (bounds === null) {
      if (!this.#mounted) return
      this.#window.contentView.removeChildView(this.#view)
      this.#mounted = false
      return
    }
    if (!this.#mounted) {
      this.#window.contentView.addChildView(this.#view)
      this.#mounted = true
    }
    this.#view.setBounds({
      x: Math.round(bounds.x),
      y: Math.round(bounds.y),
      width: Math.max(1, Math.round(bounds.width)),
      height: Math.max(1, Math.round(bounds.height)),
    })
  }

  destroy(): void {
    if (this.#destroyed) return
    this.#destroyed = true
    if (this.#mounted) {
      this.#window.contentView.removeChildView(this.#view)
      this.#mounted = false
    }
    if (!this.#view.webContents.isDestroyed()) this.#view.webContents.close()
  }
}

/**
 * 生产环境的标签页工厂。视图挂在主窗口的 contentView 上，由 main 持有，
 * renderer 只能通过 IPC 上报几何，拿不到任何 webContents 句柄。
 */
export function createElectronBrowserTabFactory(window: BrowserWindow): BrowserTabFactory {
  return {
    createTab: (id) => new ElectronBrowserTab(window, id),
  }
}

export const BROWSER_START_URL = DEFAULT_URL
