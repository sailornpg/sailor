import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

import {
  hasBlockingOverlay,
  OVERLAY_SELECTOR,
  PICKER_GAP,
  pickerSideOffset,
  rectsOverlap,
  sameBrowserBounds,
  shouldRevealBrowserFor,
  shouldShowBrowserSurface,
  toBrowserBounds,
} from '../src/renderer/src/lib/panels/browserSurface.ts'
import { BROWSER_SURFACE_RADIUS_PX } from '../src/shared/browser.ts'

test('只有面板可见、有活动标签页且没被浮层盖住时才显示原生视图', () => {
  const base = {
    mounted: true,
    active: true,
    overlayed: false,
    documentHidden: false,
    hasActiveTab: true,
  }
  assert.equal(shouldShowBrowserSurface(base), true)
  assert.equal(shouldShowBrowserSurface({ ...base, mounted: false }), false)
  assert.equal(shouldShowBrowserSurface({ ...base, active: false }), false)
  assert.equal(shouldShowBrowserSurface({ ...base, overlayed: true }), false)
  assert.equal(shouldShowBrowserSurface({ ...base, documentHidden: true }), false)
  assert.equal(shouldShowBrowserSurface({ ...base, hasActiveTab: false }), false)
})

test('几何转换取整，布局未稳定时返回 null 而不是零矩形', () => {
  assert.deepEqual(toBrowserBounds({ x: 10.4, y: 20.6, width: 300.5, height: 400.4 }), {
    x: 10,
    y: 21,
    width: 301,
    height: 400,
  })
  assert.equal(toBrowserBounds({ x: 0, y: 0, width: 0, height: 0 }), null)
  assert.equal(toBrowserBounds({ x: 0, y: 0, width: 20, height: 400 }), null)
  assert.equal(toBrowserBounds({ x: Number.NaN, y: 0, width: 300, height: 400 }), null)
})

test('几何去重避免每帧都发 IPC', () => {
  const bounds = { x: 1, y: 2, width: 3, height: 4 }
  assert.equal(sameBrowserBounds(bounds, { ...bounds }), true)
  assert.equal(sameBrowserBounds(bounds, { ...bounds, width: 5 }), false)
  assert.equal(sameBrowserBounds(null, null), true)
  assert.equal(sameBrowserBounds(null, bounds), false)
})

type Rect = { x: number; y: number; width: number; height: number }

const panelRect: Rect = { x: 600, y: 100, width: 384, height: 600 }

function element(rect: Rect): Element {
  return { getBoundingClientRect: () => rect } as unknown as Element
}

function overlayRoot(layers: Element[]): ParentNode {
  return { querySelectorAll: () => layers } as unknown as ParentNode
}

test('压在面板上的浮层被识别为遮挡（原生视图永远在页面之上）', () => {
  // 面板选择下拉从 dock 的 tab 条往下展开，正好落在内容区上：这里量不到就会被浏览器页面盖住。
  const covering = overlayRoot([element({ x: 712, y: 54, width: 272, height: 218 })])
  assert.equal(hasBlockingOverlay(covering, element(panelRect)), true)
  // 对话框遮罩铺满窗口。
  const dialog = overlayRoot([element({ x: 0, y: 0, width: 1280, height: 820 })])
  assert.equal(hasBlockingOverlay(dialog, element(panelRect)), true)
  // 侧栏或 composer 里的菜单离面板很远，不该让浏览器页面跟着闪一下。
  const elsewhere = overlayRoot([element({ x: 40, y: 300, width: 200, height: 240 })])
  assert.equal(hasBlockingOverlay(elsewhere, element(panelRect)), false)
  assert.equal(hasBlockingOverlay(overlayRoot([]), element(panelRect)), false)
})

test('没有浮层时不读几何：流式输出会高频触发这个检查', () => {
  let reads = 0
  const panel = {
    getBoundingClientRect: () => {
      reads += 1
      return panelRect
    },
  } as unknown as Element
  assert.equal(hasBlockingOverlay(overlayRoot([]), panel), false)
  assert.equal(reads, 0)
})

test('零尺寸矩形不算相交，布局未稳定时不会误判', () => {
  const rect = { x: 10, y: 10, width: 100, height: 100 }
  assert.equal(rectsOverlap(rect, { ...rect }), true)
  assert.equal(rectsOverlap(rect, { ...rect, x: 110 }), false)
  assert.equal(rectsOverlap(rect, { ...rect, width: 0 }), false)
  assert.equal(rectsOverlap({ x: 0, y: 0, width: 0, height: 0 }, rect), false)
})

test('遮挡选择器覆盖真实的面板选择下拉', async () => {
  // 面板选择菜单就是注册表驱动的 DropdownMenuContent；它一旦改名或被换掉，这条会先失败。
  const picker = await readFile('src/renderer/src/components/layout/PanelPickerMenu.tsx', 'utf8')
  assert.match(picker, /<DropdownMenuContent/)
  const menu = await readFile('src/renderer/src/components/ui/dropdown-menu.tsx', 'utf8')
  assert.match(menu, /data-slot="dropdown-menu-content"/)
  assert.match(OVERLAY_SELECTOR, /\[role="menu"\]/)
  assert.match(OVERLAY_SELECTOR, /\[data-slot="dropdown-menu-content"\]/)
})

test('面板选择菜单飞到 dock 左侧，右边缘正好落在 dock 之外', () => {
  const dock = { x: 896, y: 0, width: 384, height: 800 }
  const trigger = { x: 1246, y: 11, width: 26, height: 26 }
  const offset = pickerSideOffset(trigger, dock)
  const menuRight = trigger.x - offset
  assert.equal(menuRight, dock.x - PICKER_GAP)
  // dock 拖宽后偏移跟着变，菜单仍然在 dock 左侧。
  const wide = { ...dock, x: 560, width: 720 }
  assert.equal(trigger.x - pickerSideOffset(trigger, wide), wide.x - PICKER_GAP)
})

test('浏览器内容区圆角由 renderer 与 main 共用一个常量', async () => {
  const tabs = await readFile('src/main/browser/ElectronBrowserTabs.ts', 'utf8')
  assert.match(tabs, /setBorderRadius\(BROWSER_SURFACE_RADIUS_PX\)/)
  const panel = await readFile('src/renderer/src/components/panels/BrowserPanel.tsx', 'utf8')
  assert.match(panel, /borderRadius: BROWSER_SURFACE_RADIUS_PX/)
  const css = await readFile('src/renderer/src/styles/globals.css', 'utf8')
  assert.match(css, /\.panel-web-surface \{[\s\S]*?margin: 8px;/)
  // 常量必须跟着 `--radius-lg`（= var(--radius) + 2px）走，否则 CSS 与原生视图会各切各的角。
  const base = Number(/--radius:\s*([\d.]+)rem/.exec(css)?.[1])
  assert.match(css, /--radius-lg: calc\(var\(--radius\) \+ 2px\)/)
  assert.equal(BROWSER_SURFACE_RADIUS_PX, base * 16 + 2)
})

test('只有当前工作区的浏览器被操作时才把侧栏切过去', () => {
  assert.equal(shouldRevealBrowserFor('project-1', 'project-1'), true)
  assert.equal(shouldRevealBrowserFor('project-1', 'project-2'), false)
  assert.equal(shouldRevealBrowserFor('project-1', null), false)
  assert.equal(shouldRevealBrowserFor('', 'project-1'), false)
})

test('AppShell 把 reveal 信号接到既有的面板打开通道', async () => {
  const shell = await readFile('src/renderer/src/components/layout/AppShell.tsx', 'utf8')
  assert.match(shell, /window\.sailor\.browser\.onReveal/)
  assert.match(shell, /shouldRevealBrowserFor/)
  assert.match(shell, /requestPanelOpen\(\{ panelId: 'browser' \}\)/)
})

test('面板把原生视图的可见性与几何接线到 main，抓取结果走真实导航', async () => {
  const source = await readFile('src/renderer/src/components/panels/BrowserPanel.tsx', 'utf8')
  // 几何：ResizeObserver + 窗口 resize + 首帧 rAF 之后上报。
  assert.match(source, /new ResizeObserver/)
  assert.match(source, /addEventListener\('resize'/)
  assert.match(source, /getBoundingClientRect\(\)/)
  assert.match(source, /browser\.setBounds/)
  // 浮层遮挡：原生视图永远在页面之上，必须主动摘掉。
  assert.match(source, /MutationObserver/)
  assert.match(source, /hasBlockingOverlay/)
  // 抓取类工具的结果改成真实打开页面，而不是渲染一段文本。
  assert.match(source, /data\.preview\?\.url/)
  assert.match(source, /browser\.navigate/)
  // 默认允许：面板上不再有授权开关。
  assert.doesNotMatch(source, /允许 Agent 操作/)
  assert.doesNotMatch(source, /setAgentAccess/)
})
