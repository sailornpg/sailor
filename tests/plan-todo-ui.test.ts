import assert from 'node:assert/strict'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import test from 'node:test'
import { resolve } from 'node:path'
import { createServer, type ViteDevServer } from 'vite'
import { readFile } from 'node:fs/promises'

let vite: ViteDevServer
let view: typeof import('../src/renderer/src/components/chat/PlanTodoListView.tsx')

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
  view = (await vite.ssrLoadModule(
    '/src/renderer/src/components/chat/PlanTodoListView.tsx',
  )) as typeof view
})

test.after(async () => {
  await vite?.close()
})

test('maps persisted plan statuses into the official TodoList element and revision', () => {
  const markup = renderToStaticMarkup(
    React.createElement(view.PlanTodoListView, {
      plan: {
        revision: 3,
        steps: [
          { id: 'read', title: '阅读代码', status: 'completed' },
          { id: 'write', title: '实现功能', status: 'in-progress' },
          { id: 'verify', title: '验证结果', status: 'blocked' },
          { id: 'skip', title: '可选清理', status: 'skipped' },
        ],
      },
    }),
  )
  assert.match(markup, /阅读代码/)
  assert.match(markup, /实现功能/)
  assert.match(markup, /验证结果/)
  assert.match(markup, /rev 3/)
  assert.match(markup, /data-slot="todo-list"/)
  assert.match(markup, /任务/)
  assert.match(markup, /aria-expanded="true"/)
  assert.match(markup, /sailor-plan-todo-popover/)
  assert.doesNotMatch(markup, /sailor-chat-stage/)
})

test('renders a non-card empty state when a plan has no steps', () => {
  const markup = renderToStaticMarkup(
    React.createElement(view.PlanTodoListView, {
      plan: { revision: 1, steps: [] },
      runStatus: 'running',
    }),
  )
  assert.match(markup, /计划暂无步骤/)
})

test('does not flash a completed plan when entering a finished session', () => {
  const markup = renderToStaticMarkup(
    React.createElement(view.PlanTodoListView, {
      plan: {
        revision: 2,
        steps: [{ id: 'done', title: '已完成任务', status: 'completed' }],
      },
      runStatus: 'completed',
      runId: 'run-finished',
    }),
  )
  assert.doesNotMatch(markup, /已完成任务/)
  assert.doesNotMatch(markup, /sailor-plan-todo-popover/)
})

test('keeps the expanded plan surface in layout so it cannot cover messages', async () => {
  const css = await readFile('src/renderer/src/styles/globals.css', 'utf8')
  const rule = css.match(/\.sailor-composer-popover\s*\{([\s\S]*?)\n\}/)?.[1] ?? ''
  assert.match(rule, /position:\s*relative/)
  assert.doesNotMatch(rule, /position:\s*absolute/)
})
