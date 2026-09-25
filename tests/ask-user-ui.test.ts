import assert from 'node:assert/strict'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import test from 'node:test'
import { resolve } from 'node:path'
import { createServer, type ViteDevServer } from 'vite'

let vite: ViteDevServer
let card: typeof import('../src/renderer/src/components/chat/tools/SailorAskUserCard.tsx')
let pending: typeof import('../src/renderer/src/components/chat/composer/pendingAskUser.ts')

test.before(async () => {
  vite = await createServer({
    logLevel: 'silent',
    server: { middlewareMode: true },
    resolve: {
      alias: {
        '@': resolve(process.cwd(), 'src/renderer/src'),
        '@shared': resolve(process.cwd(), 'src/shared'),
      },
    },
  })
  card = (await vite.ssrLoadModule(
    '/src/renderer/src/components/chat/tools/SailorAskUserCard.tsx',
  )) as typeof card
  pending = (await vite.ssrLoadModule(
    '/src/renderer/src/components/chat/composer/pendingAskUser.ts',
  )) as typeof pending
})

test.after(async () => {
  await vite?.close()
})

test('renders ask_user question, options, and freeform control without a default selection', () => {
  const markup = renderToStaticMarkup(
    React.createElement(card.SailorAskUserCard, {
      chatId: 'chat-1',
      toolCallId: 'call-1',
      args: {
        question: '选择部署目标',
        options: [
          { id: 'staging', label: '测试环境' },
          { id: 'production', label: '生产环境' },
        ],
        allowFreeform: true,
        allowSkip: true,
      },
      status: { type: 'running' },
    }),
  )
  assert.match(markup, /选择部署目标/)
  assert.match(markup, /测试环境/)
  assert.match(markup, /生产环境/)
  assert.match(markup, /textarea/)
  assert.match(markup, /跳过/)
  assert.doesNotMatch(markup, /aria-checked="true"/)
})

test('falls back to a readable terminal state for malformed or cancelled questions', () => {
  const markup = renderToStaticMarkup(
    React.createElement(card.SailorAskUserCard, {
      chatId: 'chat-1',
      toolCallId: 'call-1',
      args: { question: '' },
      status: { type: 'incomplete', reason: 'cancelled' },
    }),
  )
  assert.match(markup, /无法显示用户问题|已取消/)
})

test('projects the pending ask_user card into the composer popover surface', () => {
  const markup = renderToStaticMarkup(
    React.createElement(card.SailorAskUserPopover, {
      pending: {
        toolCallId: 'call-1',
        args: { question: '是否继续？', options: [{ id: 'yes', label: '继续' }] },
      },
    }),
  )
  assert.match(markup, /sailor-ask-user-popover/)
  assert.match(markup, /是否继续？/)
  assert.match(markup, /继续/)
})

test('projects a suspended ask_user tool while the assistant message is still streaming', () => {
  const result = pending.findPendingAskUser(
    [
      {
        role: 'assistant',
        content: [
          {
            type: 'tool-call',
            toolName: 'ask_user',
            toolCallId: 'call-pending',
            args: { question: '是否继续？', options: [{ id: 'yes', label: '继续' }] },
            status: { type: 'running' },
          },
        ],
      },
    ],
    'running',
  )
  assert.deepEqual(result, {
    toolCallId: 'call-pending',
    args: { question: '是否继续？', options: [{ id: 'yes', label: '继续' }] },
  })
  assert.equal(
    pending.findPendingAskUser(
      [
        {
          role: 'assistant',
          content: [
            {
              type: 'tool-call',
              toolName: 'ask_user',
              toolCallId: 'old',
              args: { question: '旧问题' },
            },
          ],
        },
      ],
      'completed',
    ),
    undefined,
  )
  assert.equal(
    pending.findPendingAskUser(
      [
        {
          role: 'assistant',
          content: [{ type: 'tool-call', toolName: 'ask_user', toolCallId: 'streaming' }],
        },
      ],
      'running',
    ),
    undefined,
  )
})

test('uses a stable value key for streamed ask_user props instead of object identity', () => {
  const first = { toolCallId: 'call-1', args: { question: '继续吗？' } }
  const second = { toolCallId: 'call-1', args: { question: '继续吗？' } }
  assert.equal(pending.pendingAskUserKey(first), pending.pendingAskUserKey(second))
  assert.equal(pending.pendingAskUserKey(undefined), '')
})
