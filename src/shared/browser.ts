/**
 * 侧边栏浏览器在 main 与 renderer 之间共享的纯类型与纯函数。
 * 这里不引入 Electron / Node 依赖，renderer 与 main 都能引用。
 */

export const BROWSER_HISTORY_TARGETS = ['back', 'forward'] as const
export type BrowserHistoryDirection = (typeof BROWSER_HISTORY_TARGETS)[number]

/** 地址栏与 `browser_navigate` 接受的两种意图。 */
export type BrowserTarget =
  { kind: 'url'; url: string } | { kind: 'history'; direction: BrowserHistoryDirection }

export type BrowserTargetResult =
  { ok: true; target: BrowserTarget } | { ok: false; reason: string }

/** 只有这三类协议能进入面板浏览器；其余（file/javascript/data/devtools/blob…）一律拒绝。 */
const ALLOWED_PROTOCOLS = new Set(['http:', 'https:', 'about:'])

const HOST_LIKE = /^[a-z0-9-]+(\.[a-z0-9-]+)+(:\d{1,5})?([/?#].*)?$/i
/** 缺省补协议时按 http 处理的宿主：本地开发服务器基本都跑在 http 上。 */
const LOOPBACK_LIKE = /^(localhost|127\.0\.0\.1|\[::1\])(:\d{1,5})?([/?#].*)?$/i

export function isBrowserHistoryTarget(value: string): value is BrowserHistoryDirection {
  return (BROWSER_HISTORY_TARGETS as readonly string[]).includes(value)
}

/** 供 main 侧做最后一道关：任何要交给 webContents 的地址都必须先过这里。 */
export function isAllowedBrowserUrl(value: string): boolean {
  let parsed: URL
  try {
    parsed = new URL(value)
  } catch {
    return false
  }
  if (!ALLOWED_PROTOCOLS.has(parsed.protocol)) return false
  // 带凭据的地址会被 webContents 原样持有并在 URL 栏回显，这里直接拒绝。
  if (parsed.username !== '' || parsed.password !== '') return false
  return true
}

function invalid(reason: string): BrowserTargetResult {
  return { ok: false, reason }
}

/**
 * 把用户在地址栏里敲的、或模型给的字符串解析成可执行的浏览器意图。
 * 不做"猜网址"以外的任何事：不接受相对路径、不拼接当前页面来源。
 */
export function browserTargetFromInput(input: string): BrowserTargetResult {
  const trimmed = input.trim()
  if (trimmed === '') return invalid('地址为空。')

  const lowered = trimmed.toLowerCase()
  if (isBrowserHistoryTarget(lowered))
    return { ok: true, target: { kind: 'history', direction: lowered } }

  if (HOST_LIKE.test(trimmed) || LOOPBACK_LIKE.test(trimmed)) {
    const scheme = LOOPBACK_LIKE.test(trimmed) ? 'http' : 'https'
    const candidate = `${scheme}://${trimmed}`
    if (!isAllowedBrowserUrl(candidate)) return invalid(`无法把 "${trimmed}" 解析成可访问的地址。`)
    return { ok: true, target: { kind: 'url', url: new URL(candidate).href } }
  }

  let parsed: URL
  try {
    parsed = new URL(trimmed)
  } catch {
    return invalid(`"${trimmed}" 不是合法的 URL，也不是 back/forward。`)
  }
  if (!ALLOWED_PROTOCOLS.has(parsed.protocol)) {
    return invalid(`只允许 http、https 和 about 地址，收到 ${parsed.protocol}。`)
  }
  if (parsed.username !== '' || parsed.password !== '') {
    return invalid('地址里不能带用户名或密码。')
  }
  return { ok: true, target: { kind: 'url', url: parsed.href } }
}

export interface BrowserTabSummary {
  id: string
  title: string
  url: string
  loading: boolean
  canGoBack: boolean
  canGoForward: boolean
}

/** 面板内容区在窗口坐标系里的矩形（CSS 像素）。 */
export interface BrowserTabBounds {
  x: number
  y: number
  width: number
  height: number
}

export interface BrowserSiteState {
  projectId: string
  activeTabId: string | null
  tabs: BrowserTabSummary[]
}

export const BROWSER_MAX_TABS = 4
