import type { BrowserTabBounds } from '@shared/browser'

/** 浏览器视图是否应该出现在屏幕上。任一条件为假都必须上报 null 几何。 */
export interface BrowserSurfaceVisibility {
  /** 面板已挂载且 dock 可见。 */
  mounted: boolean
  /** 浏览器面板当前是活动 tab。 */
  active: boolean
  /** 应用级对话框或菜单正在遮住面板区域。 */
  overlayed: boolean
  /** 窗口被最小化或切到后台。 */
  documentHidden: boolean
  /** 有活动标签页。 */
  hasActiveTab: boolean
}

export function shouldShowBrowserSurface(input: BrowserSurfaceVisibility): boolean {
  return (
    input.mounted && input.active && !input.overlayed && !input.documentHidden && input.hasActiveTab
  )
}

/** 视口小于这个尺寸时认为布局还没稳定，不上报几何，避免一帧的闪烁。 */
const MIN_SIDE = 28

export interface RectLike {
  x: number
  y: number
  width: number
  height: number
}

/**
 * 把 DOMRect 转成 main 侧 setBounds 需要的整数矩形。
 * 返回 null 表示"这一帧不该显示浏览器"，而不是"宽高为零"。
 */
export function toBrowserBounds(rect: RectLike): BrowserTabBounds | null {
  if (!Number.isFinite(rect.x) || !Number.isFinite(rect.y)) return null
  if (!Number.isFinite(rect.width) || !Number.isFinite(rect.height)) return null
  if (rect.width < MIN_SIDE || rect.height < MIN_SIDE) return null
  return {
    x: Math.round(rect.x),
    y: Math.round(rect.y),
    width: Math.round(rect.width),
    height: Math.round(rect.height),
  }
}

export function sameBrowserBounds(
  left: BrowserTabBounds | null,
  right: BrowserTabBounds | null,
): boolean {
  if (left === null || right === null) return left === right
  return (
    left.x === right.x &&
    left.y === right.y &&
    left.width === right.width &&
    left.height === right.height
  )
}

/**
 * Agent 请求展示浏览器时该不该响应：只有当它操作的就是当前会话所属工作区时，
 * 右侧栏打开才有意义（dock 一次只展示一个工作区的浏览器）。
 */
export function shouldRevealBrowserFor(
  revealedProjectId: string,
  activeProjectId: string | null,
): boolean {
  if (revealedProjectId === '') return false
  return revealedProjectId === activeProjectId
}

/** 对话框、菜单这类浮层会盖住面板区域；原生 WebContentsView 永远在页面之上。 */
export const OVERLAY_SELECTOR = '[data-slot="dialog-overlay"], [role="dialog"]'

export function hasBlockingOverlay(root: ParentNode): boolean {
  return root.querySelector(OVERLAY_SELECTOR) !== null
}
