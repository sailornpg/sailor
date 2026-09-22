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
    icon: (props: { size?: number }) => React.createElement('svg', { 'data-icon': id, width: props.size }),
    shortcut: { key: id.slice(0, 1), meta: true },
    scope: 'global' as const,
    multiplicity: 'single' as const,
    availability: () => ({ available: true as const }),
    load: async () => ({ default: () => React.createElement('p', null, `${title}内容`) }),
  }
}

test('dock 渲染 tablist、激活态与 tabpanel 接线', async () => {
  const vite = await createServer({ logLevel: 'silent', server: { middlewareMode: true }, resolve: { alias } })
  try {
    const { PanelDock } = await vite.ssrLoadModule('/src/renderer/src/components/layout/PanelDock.tsx')
    const { createPanelRegistry } = await vite.ssrLoadModule('/src/renderer/src/lib/panels/registry.ts')
    const registry = createPanelRegistry([fakeDescriptor('review', '审查'), fakeDescriptor('browser', '浏览器')])
    const layout = {
      version: 1,
      visible: true,
      width: 384,
      open: [{ instanceId: 'review', panelId: 'review', scopeId: '' }, { instanceId: 'browser', panelId: 'browser', scopeId: '' }],
      activeInstanceId: 'browser',
      lastActive: null,
    }
    const html = renderToStaticMarkup(React.createElement(PanelDock, {
      layout,
      registry,
      context: { chatId: null, projectId: null },
      data: {},
      onActivate() {},
      onClose() {},
      picker: React.createElement('button', { type: 'button' }, 'add'),
    }))

    assert.match(html, /<aside class="panel-dock" data-dock="open">/)
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
    assert.match(html, />add</, 'dock 的 + 菜单由布局层注入')
  } finally {
    await vite.close()
  }
})

test('隐藏状态与空布局不渲染 dock 外壳', async () => {
  const vite = await createServer({ logLevel: 'silent', server: { middlewareMode: true }, resolve: { alias } })
  try {
    const { PanelDock } = await vite.ssrLoadModule('/src/renderer/src/components/layout/PanelDock.tsx')
    const { createPanelRegistry } = await vite.ssrLoadModule('/src/renderer/src/lib/panels/registry.ts')
    const registry = createPanelRegistry([fakeDescriptor('review', '审查')])
    const base = { version: 1, visible: true, width: 384, open: [{ instanceId: 'review', panelId: 'review', scopeId: '' }], activeInstanceId: 'review', lastActive: null }

    assert.equal(renderToStaticMarkup(React.createElement(PanelDock, { layout: { ...base, visible: false }, registry, context: { chatId: null, projectId: null }, data: {}, onActivate() {}, onClose() {} })), '')
    assert.equal(renderToStaticMarkup(React.createElement(PanelDock, { layout: { ...base, open: [] }, registry, context: { chatId: null, projectId: null }, data: {}, onActivate() {}, onClose() {} })), '')
    assert.equal(renderToStaticMarkup(React.createElement(PanelDock, {
      layout: { ...base, open: [{ instanceId: 'retired', panelId: 'retired', scopeId: '' }], activeInstanceId: 'retired' },
      registry,
      context: { chatId: null, projectId: null },
      data: {},
      onActivate() {},
      onClose() {},
    })), '', '已下线的面板不应留下空外壳')
  } finally {
    await vite.close()
  }
})

test('浏览器面板渲染真实预览，缺数据时给出真实空态', async () => {
  const vite = await createServer({ logLevel: 'silent', server: { middlewareMode: true }, resolve: { alias } })
  try {
    const { default: BrowserPreviewPanel } = await vite.ssrLoadModule('/src/renderer/src/components/panels/BrowserPreviewPanel.tsx')
    const props = { instanceId: 'browser', panelId: 'browser', scopeId: '', context: { chatId: null, projectId: null } }

    const withPreview = renderToStaticMarkup(React.createElement(BrowserPreviewPanel, {
      ...props,
      data: { preview: { url: 'https://example.com/docs', content: '抓取到的正文', title: '示例页面' } },
    }))
    assert.match(withPreview, /data-slot="web-preview"/)
    assert.match(withPreview, /example\.com/)
    assert.match(withPreview, /示例页面/)
    assert.match(withPreview, /抓取到的正文/)

    const withoutPreview = renderToStaticMarkup(React.createElement(BrowserPreviewPanel, { ...props, data: {} }))
    assert.match(withoutPreview, /还没有可渲染的预览内容/)
    assert.doesNotMatch(withoutPreview, /web-preview/)
  } finally {
    await vite.close()
  }
})

test('占位面板显示真实不可用原因，而不是伪造内容', async () => {
  const vite = await createServer({ logLevel: 'silent', server: { middlewareMode: true }, resolve: { alias } })
  try {
    const { default: ReviewPanel } = await vite.ssrLoadModule('/src/renderer/src/components/panels/ReviewPanel.tsx')
    const { default: TerminalPanel } = await vite.ssrLoadModule('/src/renderer/src/components/panels/TerminalPanel.tsx')
    const props = { instanceId: 'review', panelId: 'review', scopeId: '', context: { chatId: 'chat-1', projectId: null }, data: {} }

    const review = renderToStaticMarkup(React.createElement(ReviewPanel, props))
    assert.match(review, /Git diff/)
    assert.doesNotMatch(review, /\+\d+ -\d+/, '未接入的审查面板不能显示推测的增删行数')

    const terminal = renderToStaticMarkup(React.createElement(TerminalPanel, { ...props, panelId: 'terminal' }))
    assert.match(terminal, /PTY/)
    assert.match(terminal, /任意命令通道/)
  } finally {
    await vite.close()
  }
})

test('失效的激活项回退到第一个 tab，而不是渲染空白 dock', async () => {
  const vite = await createServer({ logLevel: 'silent', server: { middlewareMode: true }, resolve: { alias } })
  try {
    const { PanelDock } = await vite.ssrLoadModule('/src/renderer/src/components/layout/PanelDock.tsx')
    const { createPanelRegistry } = await vite.ssrLoadModule('/src/renderer/src/lib/panels/registry.ts')
    const registry = createPanelRegistry([fakeDescriptor('review', '审查'), fakeDescriptor('browser', '浏览器')])
    const html = renderToStaticMarkup(React.createElement(PanelDock, {
      layout: {
        version: 1,
        visible: true,
        width: 384,
        open: [{ instanceId: 'review', panelId: 'review', scopeId: '' }, { instanceId: 'browser', panelId: 'browser', scopeId: '' }],
        activeInstanceId: 'gone',
        lastActive: null,
      },
      registry,
      context: { chatId: null, projectId: null },
      data: {},
      onActivate() {},
      onClose() {},
    }))

    assert.match(html, /data-active="true"[^>]*id="panel-view-review"/)
    assert.equal((html.match(/data-active="true"/g) ?? []).length, 2, '回退后只应有一个激活 tab 与一个激活面板')
  } finally {
    await vite.close()
  }
})

test('dock 由布局数据驱动 grid 列与应用外壳接线', async () => {
  const shell = await readFile('src/renderer/src/components/layout/AppShell.tsx', 'utf8')
  const css = await readFile('src/renderer/src/styles/globals.css', 'utf8')
  const chatWorkspace = await readFile('src/renderer/src/components/chat/ChatWorkspace.tsx', 'utf8')

  assert.match(shell, /data-dock=\{dockVisible \? 'open' : 'closed'\}/)
  assert.match(shell, /'--panel-width': `\$\{panels\.layout\.width\}px`/)
  assert.match(shell, /usePanelShortcuts\(panelRegistry, panelContext, panels\.open\)/)
  assert.match(shell, /<PanelDock /)
  assert.doesNotMatch(shell, /rightVisible/)

  assert.match(css, /\.app-shell\[data-dock="open"\]/)
  assert.doesNotMatch(css, /\.inspector/)
  assert.match(css, /\.panel-host-view:not\(\[data-active="true"\]\) \{ display: none; \}/)

  assert.match(chatWorkspace, /\{panelToolbar\}/)
  assert.doesNotMatch(chatWorkspace, /onToggleInspector/)
})
