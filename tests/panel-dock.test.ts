import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import test from 'node:test'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { createServer } from 'vite'

const alias = { '@': resolve('src/renderer/src'), '@shared': resolve('src/shared') }

function fakeDescriptor(id: string, title: string) {
  return {
    id,
    title,
    icon: (props: { size?: number }) =>
      React.createElement('svg', { 'data-icon': id, width: props.size }),
    shortcut: { key: id.slice(0, 1), meta: true },
    scope: 'global' as const,
    multiplicity: 'single' as const,
    availability: () => ({ available: true as const }),
    load: async () => ({ default: () => React.createElement('p', null, `${title}内容`) }),
  }
}

test('dock 打开面板后渲染 tablist、激活态与 tabpanel 接线，不再重复功能列表', async () => {
  const vite = await createServer({
    logLevel: 'silent',
    server: { middlewareMode: true },
    resolve: { alias },
  })
  try {
    const { PanelDock } = await vite.ssrLoadModule(
      '/src/renderer/src/components/layout/PanelDock.tsx',
    )
    const { createPanelRegistry } = await vite.ssrLoadModule(
      '/src/renderer/src/lib/panels/registry.ts',
    )
    const registry = createPanelRegistry([
      fakeDescriptor('review', '审查'),
      fakeDescriptor('browser', '浏览器'),
    ])
    const layout = {
      version: 1,
      visible: true,
      width: 384,
      open: [
        { instanceId: 'review', panelId: 'review', scopeId: '' },
        { instanceId: 'browser', panelId: 'browser', scopeId: '' },
      ],
      activeInstanceId: 'browser',
      lastActive: null,
    }
    const html = renderToStaticMarkup(
      React.createElement(PanelDock, {
        layout,
        registry,
        context: { chatId: null, projectId: null },
        data: {},
        platform: 'mac',
        onActivate() {},
        onClose() {},
        onPick() {},
        onResize() {},
      }),
    )

    assert.match(
      html,
      /<aside aria-label="面板" class="panel-dock" data-dock="open" data-tabs="open">/,
    )
    assert.doesNotMatch(html, /dock-drag/, '不再有独立的空白拖拽行')
    assert.match(html, /class="panel-tabstrip window-drag"/, 'tab 条本身就是窗口拖拽区')
    assert.match(html, /class="panel-tabstrip-tabs no-drag"/, 'tab 与按钮必须可点击')
    assert.match(html, /class="panel-tab-trigger no-drag"/)
    assert.doesNotMatch(
      html,
      /class="panel-menu/,
      '有 tab 时不再渲染常驻功能列表，避免与 + 菜单重复',
    )
    assert.doesNotMatch(html, /aria-label="审查"/)
    assert.match(html, /role="tablist"/)
    assert.equal((html.match(/role="tab"/g) ?? []).length, 2)
    assert.equal((html.match(/aria-selected="true"/g) ?? []).length, 1)
    assert.equal((html.match(/aria-selected="false"/g) ?? []).length, 1)
    assert.match(html, /id="panel-tab-review"/)
    assert.match(html, /aria-controls="panel-view-review"/)
    assert.match(html, /id="panel-tab-browser"/)
    assert.match(html, /aria-controls="panel-view-browser"/)
    assert.match(html, /aria-labelledby="panel-tab-browser"/)
    assert.match(html, /data-active="true"[^>]*id="panel-view-browser"/)
    assert.match(html, /data-active="false"[^>]*id="panel-view-review"/)
    assert.match(html, /panel-loading/, '懒加载面板在就绪前显示骨架而不是空白')
    assert.equal((html.match(/role="tabpanel"/g) ?? []).length, 2)
    assert.match(html, /aria-label="关闭审查面板"/)
    assert.match(html, /aria-label="关闭浏览器面板"/)
    assert.match(html, /<span class="panel-tab-title">审查<\/span>/)
    assert.match(html, /class="panel-tab-add"/, 'tab 条上有 + 下拉入口')
    assert.match(html, /aria-label="添加面板"/)
    assert.match(html, /role="separator"/, '右栏自带拖拽分隔条')
    assert.match(html, /aria-label="调整面板宽度"/)
  } finally {
    await vite.close()
  }
})

test('可见但没有打开面板时给出功能列表与空态，而不是空白 dock', async () => {
  const vite = await createServer({
    logLevel: 'silent',
    server: { middlewareMode: true },
    resolve: { alias },
  })
  try {
    const { PanelDock } = await vite.ssrLoadModule(
      '/src/renderer/src/components/layout/PanelDock.tsx',
    )
    const { createPanelRegistry } = await vite.ssrLoadModule(
      '/src/renderer/src/lib/panels/registry.ts',
    )
    const registry = createPanelRegistry([
      fakeDescriptor('review', '审查'),
      fakeDescriptor('browser', '浏览器'),
    ])
    const html = renderToStaticMarkup(
      React.createElement(PanelDock, {
        layout: {
          version: 1,
          visible: true,
          width: 384,
          open: [],
          activeInstanceId: null,
          lastActive: null,
        },
        registry,
        context: { chatId: null, projectId: null },
        data: {},
        platform: 'mac',
        onActivate() {},
        onClose() {},
        onPick() {},
        onResize() {},
      }),
    )

    assert.match(html, /data-tabs="closed"/)
    assert.match(html, /class="panel-menu-band"/, '没有 tab 时功能列表作为唯一内容')
    assert.doesNotMatch(
      html,
      /panel-menu-band window-drag/,
      '空态整块拖拽区会盖住右栏分隔条，macOS 会先吃掉那次按下',
    )
    assert.match(html, /aria-label="功能列表"/)
    assert.equal(
      (html.match(/class="panel-menu-item[ "]/g) ?? []).length,
      2,
      '没有打开面板时功能列表可用',
    )
    assert.doesNotMatch(html, /panel-menu-hint/, '空态不再有说明文案块')
    assert.doesNotMatch(html, /<kbd>/, '空态列表不再带快捷键列')
    assert.doesNotMatch(html, /role="tablist"/)
    assert.doesNotMatch(html, /role="tabpanel"/)
    assert.doesNotMatch(html, /class="panel-tab-add"/, '空态没有 tab 条，由列表本身承担入口')
  } finally {
    await vite.close()
  }
})

test('不可用面板在功能列表里保留行并展示真实原因', async () => {
  const vite = await createServer({
    logLevel: 'silent',
    server: { middlewareMode: true },
    resolve: { alias },
  })
  try {
    const { PanelDock } = await vite.ssrLoadModule(
      '/src/renderer/src/components/layout/PanelDock.tsx',
    )
    const { createPanelRegistry } = await vite.ssrLoadModule(
      '/src/renderer/src/lib/panels/registry.ts',
    )
    const unavailable = {
      ...fakeDescriptor('files', '文件'),
      availability: () => ({ available: false as const, reason: '先关联一个工作区，再浏览文件。' }),
    }
    const registry = createPanelRegistry([unavailable])
    const html = renderToStaticMarkup(
      React.createElement(PanelDock, {
        layout: {
          version: 1,
          visible: true,
          width: 384,
          open: [],
          activeInstanceId: null,
          lastActive: null,
        },
        registry,
        context: { chatId: null, projectId: null },
        data: {},
        platform: 'mac',
        onActivate() {},
        onClose() {},
        onPick() {},
        onResize() {},
      }),
    )

    assert.match(html, /disabled=""/)
    assert.match(html, /先关联一个工作区，再浏览文件。/)
  } finally {
    await vite.close()
  }
})

test('隐藏状态与空布局不渲染 dock 外壳', async () => {
  const vite = await createServer({
    logLevel: 'silent',
    server: { middlewareMode: true },
    resolve: { alias },
  })
  try {
    const { PanelDock } = await vite.ssrLoadModule(
      '/src/renderer/src/components/layout/PanelDock.tsx',
    )
    const { createPanelRegistry } = await vite.ssrLoadModule(
      '/src/renderer/src/lib/panels/registry.ts',
    )
    const registry = createPanelRegistry([fakeDescriptor('review', '审查')])
    const base = {
      version: 1,
      visible: true,
      width: 384,
      open: [{ instanceId: 'review', panelId: 'review', scopeId: '' }],
      activeInstanceId: 'review',
      lastActive: null,
    }
    const props = {
      registry,
      context: { chatId: null, projectId: null },
      data: {},
      platform: 'mac' as const,
      onActivate() {},
      onClose() {},
      onPick() {},
      onResize() {},
    }

    assert.equal(
      renderToStaticMarkup(
        React.createElement(PanelDock, { ...props, layout: { ...base, visible: false } }),
      ),
      '',
    )
    assert.match(
      renderToStaticMarkup(
        React.createElement(PanelDock, { ...props, layout: { ...base, open: [] } }),
      ),
      /class="panel-menu-band"/,
      '可见但无 tab 时保留功能列表',
    )

    const retired = renderToStaticMarkup(
      React.createElement(PanelDock, {
        ...props,
        layout: {
          ...base,
          open: [{ instanceId: 'retired', panelId: 'retired', scopeId: '' }],
          activeInstanceId: 'retired',
        },
      }),
    )
    assert.match(retired, /data-tabs="closed"/, '已下线的面板不应留下 tab 条')
    assert.match(retired, /class="panel-menu-band"/, '下线面板后回退到功能列表，而不是空白外壳')
    assert.doesNotMatch(retired, /role="tabpanel"/)
  } finally {
    await vite.close()
  }
})

test('浏览器面板渲染真实预览，缺数据时给出真实空态', async () => {
  const vite = await createServer({
    logLevel: 'silent',
    server: { middlewareMode: true },
    resolve: { alias },
  })
  try {
    const { default: BrowserPreviewPanel } = await vite.ssrLoadModule(
      '/src/renderer/src/components/panels/BrowserPreviewPanel.tsx',
    )
    const props = {
      instanceId: 'browser',
      panelId: 'browser',
      scopeId: '',
      context: { chatId: null, projectId: null },
    }

    const withPreview = renderToStaticMarkup(
      React.createElement(BrowserPreviewPanel, {
        ...props,
        data: {
          preview: { url: 'https://example.com/docs', content: '抓取到的正文', title: '示例页面' },
        },
      }),
    )
    assert.match(withPreview, /data-slot="web-preview"/)
    assert.match(withPreview, /example\.com/)
    assert.match(withPreview, /示例页面/)
    assert.match(withPreview, /抓取到的正文/)

    const withoutPreview = renderToStaticMarkup(
      React.createElement(BrowserPreviewPanel, { ...props, data: {} }),
    )
    assert.match(withoutPreview, /还没有可渲染的预览内容/)
    assert.doesNotMatch(withoutPreview, /web-preview/)
  } finally {
    await vite.close()
  }
})

test('占位面板显示真实不可用原因，而不是伪造内容', async () => {
  const vite = await createServer({
    logLevel: 'silent',
    server: { middlewareMode: true },
    resolve: { alias },
  })
  try {
    const { default: ReviewPanel } = await vite.ssrLoadModule(
      '/src/renderer/src/components/panels/ReviewPanel.tsx',
    )
    const props = {
      instanceId: 'review',
      panelId: 'review',
      scopeId: '',
      context: { chatId: 'chat-1', projectId: null },
      data: {},
    }

    const review = renderToStaticMarkup(React.createElement(ReviewPanel, props))
    assert.match(review, /Git diff/)
    assert.doesNotMatch(review, /\+\d+ -\d+/, '未接入的审查面板不能显示推测的增删行数')
  } finally {
    await vite.close()
  }
})

test('失效的激活项回退到第一个 tab，而不是渲染空白 dock', async () => {
  const vite = await createServer({
    logLevel: 'silent',
    server: { middlewareMode: true },
    resolve: { alias },
  })
  try {
    const { PanelDock } = await vite.ssrLoadModule(
      '/src/renderer/src/components/layout/PanelDock.tsx',
    )
    const { createPanelRegistry } = await vite.ssrLoadModule(
      '/src/renderer/src/lib/panels/registry.ts',
    )
    const registry = createPanelRegistry([
      fakeDescriptor('review', '审查'),
      fakeDescriptor('browser', '浏览器'),
    ])
    const html = renderToStaticMarkup(
      React.createElement(PanelDock, {
        layout: {
          version: 1,
          visible: true,
          width: 384,
          open: [
            { instanceId: 'review', panelId: 'review', scopeId: '' },
            { instanceId: 'browser', panelId: 'browser', scopeId: '' },
          ],
          activeInstanceId: 'gone',
          lastActive: null,
        },
        registry,
        context: { chatId: null, projectId: null },
        data: {},
        platform: 'mac',
        onActivate() {},
        onClose() {},
        onPick() {},
        onResize() {},
      }),
    )

    assert.match(html, /data-active="true"[^>]*id="panel-view-review"/)
    assert.doesNotMatch(
      html,
      /data-active="true"[^>]*id="panel-view-browser"/,
      '回退后不能留下第二个激活面板',
    )
  } finally {
    await vite.close()
  }
})

test('外壳把三栏几何、拖拽分隔条与单一面板开关接线到布局状态', async () => {
  const shell = await readFile('src/renderer/src/components/layout/AppShell.tsx', 'utf8')
  const css = await readFile('src/renderer/src/styles/globals.css', 'utf8')
  const chatWorkspace = await readFile('src/renderer/src/components/chat/ChatWorkspace.tsx', 'utf8')
  const toolbar = await readFile('src/renderer/src/components/layout/PanelToolbar.tsx', 'utf8')
  // Read as code, not as text: quote style and formatting must not decide these assertions.
  const code = (source: string) => source.replace(/["';]/g, '').replace(/\s+/g, '')

  assert.match(shell, /data-dock=\{dockVisible \? ["']open["'] : ["']closed["']\}/)
  assert.match(
    code(shell),
    /constdockVisible=panels\.layout\.visible/,
    '右栏可见性不能依赖是否已打开面板，否则首次点击开关没反应',
  )
  assert.match(shell, /data-left=\{ui\.layout\.leftCollapsed \? ["']collapsed["'] : ["']open["']\}/)
  assert.match(code(shell), /--sidebar-width:`\$\{ui\.layout\.leftWidth\}px`/)
  assert.match(code(shell), /--panel-width:`\$\{panels\.layout\.width\}px`/)
  assert.match(code(shell), /useUiLayout\(\)/)
  assert.match(code(shell), /usePanelShortcuts\(panelRegistry,panelContext,panels\.open\)/)
  assert.doesNotMatch(shell, /DEFAULT_PANEL_ID/, '打开右栏不能默认选中某个面板')
  assert.match(code(shell), /<PaneResizerlabel=调整侧边栏宽度/)
  assert.match(code(shell), /onCollapse=\{\(\)=>ui\.setLeftCollapsed\(true\)\}/)
  assert.match(code(shell), /<PanelDock/)
  assert.match(code(shell), /onResize=\{panels\.setWidth\}/)
  assert.doesNotMatch(shell, /rightVisible/)
  assert.doesNotMatch(shell, /PanelAddButton/, 'dock 与工具栏只保留一个面板入口')

  assert.match(css, /\.app-shell\[data-dock=['"]open['"]\]/)
  assert.match(
    css,
    /\.app-shell\[data-left=['"]collapsed['"]\]\[data-dock=['"]open['"]\]\s*\{\s*grid-template-columns:\s*52px/,
  )
  assert.match(css, /var\(--sidebar-width, 248px\) minmax\(0, 1fr\) 0/)
  assert.match(css, /\.pane-resizer/)
  assert.match(css, /\.pane-resizer-grip/, '分隔条需要有可见的抓取提示')
  assert.match(
    css,
    /\.panel-dock \{\s*display: grid;\s*grid-template-rows: auto minmax\(0, 1fr\);/,
    'dock 顶行由内容决定高度，不留空行',
  )
  assert.match(
    css,
    /\.panel-dock\[data-tabs=['"]closed['"]\]\s*\{\s*grid-template-rows:\s*minmax\(0, 1fr\);/,
    '空态只有一行，列表在其中垂直居中',
  )
  assert.match(
    css,
    /\.panel-menu-band \{[^}]*place-content: center/,
    '居中由专用容器负责，不依赖百分比高度',
  )
  assert.match(css, /\.panel-tabstrip \{[^}]*height: 48px/, 'tab 条与 topbar 同高')
  assert.doesNotMatch(css, /\.dock-drag/, '独立的空白拖拽行已移除')
  assert.match(css, /\.panel-menu-item/)
  assert.doesNotMatch(css, /\.inspector/)
  assert.match(css, /\.panel-host-view:not\(\[data-active=['"]true['"]\]\)\s*\{\s*display:\s*none;/)

  assert.match(code(chatWorkspace), /\{panelToolbar\}/)
  assert.doesNotMatch(chatWorkspace, /onToggleInspector/)

  assert.equal((toolbar.match(/<Button/g) ?? []).length, 1, '右上角只应保留一个面板按钮')
  assert.match(code(toolbar), /aria-pressed=\{visible\}/)
})
