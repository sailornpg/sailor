import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

import {
  hasBlockingOverlay,
  sameBrowserBounds,
  shouldRevealBrowserFor,
  shouldShowBrowserSurface,
  toBrowserBounds,
} from '../src/renderer/src/lib/panels/browserSurface.ts'

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

test('应用级浮层被识别为遮挡（原生视图永远在页面之上）', () => {
  const overlay = { querySelector: (selector: string) => (selector.includes('dialog') ? {} : null) }
  const plain = { querySelector: () => null }
  assert.equal(hasBlockingOverlay(overlay as unknown as ParentNode), true)
  assert.equal(hasBlockingOverlay(plain as unknown as ParentNode), false)
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
