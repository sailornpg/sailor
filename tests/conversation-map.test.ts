import assert from 'node:assert/strict'
import test from 'node:test'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { resolve } from 'node:path'
import { createServer } from 'vite'

test('会话导航在真实 Thread viewport 内按轮分组，并挂接实际消息锚点', async () => {
  const vite = await createServer({ logLevel: 'silent', server: { middlewareMode: true }, resolve: { alias: { '@': resolve('src/renderer/src'), '@shared': resolve('src/shared') } } })
  try {
    const { ConversationMapPreview } = await vite.ssrLoadModule('/tests/fixtures/ConversationMapPreview.tsx')
    const messages = [
      { id: 'u1', role: 'user', content: [{ type: 'text', text: '检查项目结构' }] },
      { id: 'a1', role: 'assistant', content: [{ type: 'text', text: '项目包含主进程和渲染进程。' }] },
      { id: 'a2', role: 'assistant', content: [{ type: 'text', text: '补充说明。' }] },
      { id: 'u2', role: 'user', content: [{ type: 'text', text: '添加回归测试' }] },
      { id: 'a3', role: 'assistant', content: [{ type: 'text', text: '已添加测试。' }] },
    ]
    const html = renderToStaticMarkup(React.createElement(ConversationMapPreview, { messages }))
    assert.equal((html.match(/data-slot="conversation-map-tick"/g) ?? []).length, 2)
    assert.match(html, /aria-label="检查项目结构"/)
    assert.match(html, /aria-label="添加回归测试"/)
    assert.match(html, /data-message-id="u1"/)
    assert.match(html, /data-message-id="u2"/)
    assert.match(html, /aria-label="会话摘要导航"/)
    assert.ok(html.indexOf('aui_thread-viewport') < html.indexOf('conversation-map-rail'))
    const empty = renderToStaticMarkup(React.createElement(ConversationMapPreview, { messages: [] }))
    assert.doesNotMatch(empty, /data-slot="conversation-map/)
    const attachment = renderToStaticMarkup(React.createElement(ConversationMapPreview, { messages: [{ id: 'file', role: 'user', content: [], attachments: [{ id: 'one', type: 'file', name: 'notes.txt', content: [], status: { type: 'complete' } }] }] }))
    assert.match(attachment, /aria-label="文件"/)
  } finally { await vite.close() }
})
