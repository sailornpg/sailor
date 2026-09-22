import assert from 'node:assert/strict'
import test from 'node:test'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { createServer } from 'vite'
import { resolve } from 'node:path'

test('官方列表展示本工作区会话、活动项和状态，归档列表默认收起', async () => {
  const vite = await createServer({ logLevel: 'silent', server: { middlewareMode: true }, resolve: { alias: { '@': resolve('src/renderer/src'), '@shared': resolve('src/shared') } } })
  try {
    const { WorkspaceThreadList } = await vite.ssrLoadModule('/src/renderer/src/components/chat/sidebar/WorkspaceThreadList.tsx')
    const base = { projectId: 'project', updatedAt: 1, runId: null, error: null, unread: false }
    const html = renderToStaticMarkup(React.createElement(WorkspaceThreadList, {
      activeId: 'one', onSelect() {}, onManage: async () => {}, chats: [
        { ...base, id: 'one', title: '运行任务', status: 'running' },
        { ...base, id: 'two', title: '未读任务', status: 'completed', unread: true },
        { ...base, id: 'old', title: '归档任务', status: 'completed', archived: true },
      ],
    }))
    assert.equal((html.match(/data-slot="aui_thread-list-item"/g) ?? []).length, 2)
    assert.match(html, /运行任务/)
    assert.match(html, /运行中/)
    assert.match(html, /未读结果/)
    assert.match(html, /已归档/)
    assert.doesNotMatch(html, /归档任务/)
    assert.match(html, /更多操作/)
  } finally { await vite.close() }
})
