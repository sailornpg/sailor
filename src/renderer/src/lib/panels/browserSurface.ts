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

/**
 * 会盖住面板区域的浮层；原生 WebContentsView 永远画在页面之上，这些层出现时必须把视图摘掉。
 * radix 的下拉菜单走 portal 挂到 body 上，不受 dock 的 overflow 约束，所以被盖住的是菜单自己。
 * 刻意不含 tooltip：悬停提示是瞬时反馈，浏览器面板自己的工具条按钮就带 tooltip，一悬停就摘视图会闪。
 */
export const OVERLAY_SELECTOR = [
  '[role="dialog"]',
  '[data-slot="dialog-overlay"]',
  '[role="menu"]',
  '[data-slot="dropdown-menu-content"]',
  '[data-slot="dropdown-menu-sub-content"]',
  '[data-slot="select-content"]',
].join(', ')

/** 零尺寸矩形永远不算相交：布局还没稳定时不能把它误判成"被盖住"。 */
export function rectsOverlap(left: RectLike, right: RectLike): boolean {
  if (left.width <= 0 || left.height <= 0 || right.width <= 0 || right.height <= 0) return false
  return (
    left.x < right.x + right.width &&
    right.x < left.x + left.width &&
    left.y < right.y + right.height &&
    right.y < left.y + left.height
  )
}

/**
 * 是否有浮层真的压在面板区域上。只认相交：侧栏和 composer 里的菜单离面板很远，
 * 不该让浏览器页面跟着闪一下。没有浮层时连几何都不读——流式输出会高频触发 DOM 变更，
 * 每次测量都会强制一次同步布局。
 */
export function hasBlockingOverlay(root: ParentNode, panel: Element): boolean {
  const layers = root.querySelectorAll(OVERLAY_SELECTOR)
  if (layers.length === 0) return false
  const area = panel.getBoundingClientRect()
  for (const layer of layers) {
    if (rectsOverlap(layer.getBoundingClientRect(), area)) return true
  }
  return false
}

/** 面板选择菜单与 dock 内边之间留的间距。 */
export const PICKER_GAP = 8

/**
 * 面板选择菜单的横向偏移：让它的右边缘落在 dock 左侧 `gap` 像素处。
 *
 * dock 的内容区被原生 WebContentsView 占着，菜单只要压上去，原生视图就必须让位，
 * 浏览器页面会整块消失。所以菜单默认飞到 dock 左侧的对话区上空——那里是普通 DOM，
 * 菜单完整可见的同时页面一直留在屏幕上。偏移按当前几何算，dock 拖宽后仍然成立。
 */
export function pickerSideOffset(trigger: RectLike, dock: RectLike, gap = PICKER_GAP): number {
  return Math.max(gap, Math.round(trigger.x - dock.x + gap))
}
