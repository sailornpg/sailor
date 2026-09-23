import assert from 'node:assert/strict'
import { resolve } from 'node:path'
import test from 'node:test'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { createServer } from 'vite'

const alias = { '@': resolve('src/renderer/src'), '@shared': resolve('src/shared') }

const snapshot = { projects: [], chats: [], activeChatId: null, collapsedProjectIds: [] }

async function loadSidebar() {
  const vite = await createServer({ logLevel: 'silent', server: { middlewareMode: true }, resolve: { alias } })
  const sidebar = await vite.ssrLoadModule('/src/renderer/src/components/layout/ProjectSidebar.tsx')
  const tooltip = await vite.ssrLoadModule('/src/renderer/src/components/ui/tooltip.tsx')
  return { vite, render: (overrides: Record<string, unknown> = {}) => renderToStaticMarkup(
    React.createElement(tooltip.TooltipProvider, null, React.createElement(sidebar.ProjectSidebar, props(overrides))),
  ) }
}

function props(overrides: Record<string, unknown> = {}) {
  return {
    snapshot,
    activeId: null,
    loading: false,
    error: null,
    collapsed: false,
    platform: 'mac' as const,
    onOpenSettings() {},
    onAddProject() {},
    onNewChat() {},
    onSelect() {},
    onCollapse() {},
    onRetry() {},
    onManage: async () => {},
    onToggleCollapsed() {},
    ...overrides,
  }
}

test('展开态渲染完整导航并提供收起入口', async () => {
  const { vite, render } = await loadSidebar()
  try {
    const html = render()

    assert.match(html, /class="sidebar" data-collapsed="false"/)
    assert.match(html, /aria-label="收起侧边栏"/)
    assert.match(html, /aria-expanded="true"/)
    assert.match(html, /aria-label="工作区与会话"/)
    assert.match(html, /新建会话/)
    assert.doesNotMatch(html, /sidebar-rail/)
  } finally {
    await vite.close()
  }
})

test('收起态只渲染图标条，工作区列表让位给导航图标', async () => {
  const { vite, render } = await loadSidebar()
  try {
    const html = render({ collapsed: true })

    assert.match(html, /class="sidebar sidebar-rail" data-collapsed="true"/)
    assert.match(html, /aria-label="展开侧边栏"/)
    assert.match(html, /aria-label="Sailor 导航"/)
    assert.match(html, /aria-label="新建会话"/)
    assert.match(html, /aria-label="添加工作区"/)
    assert.match(html, /aria-label="设置"/)
    assert.doesNotMatch(html, /aria-label="工作区与会话"/, '收起后不再渲染会话列表')
    assert.doesNotMatch(html, /workspace-project-row/)
  } finally {
    await vite.close()
  }
})
