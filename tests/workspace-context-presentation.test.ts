import assert from 'node:assert/strict'
import test from 'node:test'
import { resolve } from 'node:path'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { createServer } from 'vite'

const data = { id: 'ref-1', projectId: 'project-1', relativePath: 'example.ts', kind: 'selection', text: 'const x = 1', sha256: 'a'.repeat(64), startOffset: 0, endOffset: 11, startLine: 1, endLine: 1 }

test('已发送引用与图片位于气泡外附件区，正文只渲染提问', async () => {
  const vite = await createServer({ logLevel: 'silent', server: { middlewareMode: true }, resolve: { alias: { '@': resolve('src/renderer/src'), '@shared': resolve('src/shared') } } })
  try {
    const { ConversationMapPreview } = await vite.ssrLoadModule('/tests/fixtures/ConversationMapPreview.tsx')
    const html = renderToStaticMarkup(React.createElement(ConversationMapPreview, { messages: [{ id: 'm1', role: 'user', content: [{ type: 'text', text: '这俩是啥' }, { type: 'data', name: 'workspace-context', data }], attachments: [{ id: 'img1', type: 'image', name: 'image.png', content: [{ type: 'image', image: 'data:image/png;base64,AAAA' }], status: { type: 'complete' } }] }] }))
    const row = html.indexOf('aui-user-message-attachment-row')
    const image = html.indexOf('aui-attachment-root', row)
    const reference = html.indexOf('workspace-context-message', row)
    const bubble = html.indexOf('aui-user-message-content', row)
    assert.ok(row >= 0 && image > row && reference > image && bubble > reference, '图片与引用应在正文气泡之前的附件区')
    assert.ok(html.includes('example.ts'))
    assert.ok(!html.slice(bubble).includes('workspace-context-message'), '正文内不能重复引用')
  } finally { await vite.close() }
})

test('提交时立即清空引用，不等待生成结束且不清空新草稿', async () => {
  const vite = await createServer({ logLevel: 'silent', server: { middlewareMode: true }, resolve: { alias: { '@': resolve('src/renderer/src'), '@shared': resolve('src/shared') } } })
  try {
    const { workspaceContextDrafts: drafts } = await vite.ssrLoadModule('/src/renderer/src/lib/workspaceContextDrafts.ts')
    const { sendWithWorkspaceContexts } = await vite.ssrLoadModule('/src/renderer/src/components/chat/runtime/sendWithWorkspaceContexts.ts')
    drafts.add('chat', { type: 'data-workspace-context', data })
    let finish!: () => void
    let submitted: any
    const pending = new Promise<void>(resolve => { finish = resolve })
    const send = sendWithWorkspaceContexts('chat', (message: any) => { submitted = message; return pending })
    const result = send({ parts: [{ type: 'text', text: 'test' }] })
    assert.equal(submitted.parts[1].data.id, data.id)
    assert.equal(drafts.get('chat').length, 0, '生成未结束时引用就应清空')
    drafts.add('chat', { type: 'data-workspace-context', data: { ...data, id: 'next' } })
    finish(); await result
    assert.equal(drafts.get('chat')[0].data.id, 'next')
  } finally { await vite.close() }
})
