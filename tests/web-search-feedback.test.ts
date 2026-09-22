import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import test from 'node:test'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { createServer } from 'vite'

async function load(modulePath: string) {
  const vite = await createServer({
    logLevel: 'silent',
    resolve: { alias: { '@': resolve(process.cwd(), 'src/renderer/src'), '@shared': resolve(process.cwd(), 'src/shared') } },
    server: { middlewareMode: true },
  })
  try {
    return await vite.ssrLoadModule(modulePath)
  } finally {
    await vite.close()
  }
}

const source = {
  sourceId: 'src_0123456789abcdef',
  title: 'Sailor docs',
  url: 'https://example.com/docs',
  snippet: 'Search result summary only.',
  retrievedAt: '2026-09-20T10:00:00.000Z',
}

const success = {
  schemaVersion: 1,
  toolCallId: 'call-search',
  tool: 'web_search',
  ok: true,
  summary: '找到 1 个 Web 来源',
  durationMs: 25,
  effects: { kind: 'none' },
  truncated: false,
  data: { query: 'Sailor docs', sources: [source] },
}

test('projects web search lifecycle and validated real sources', async () => {
  const { projectWebSearchFeedback } = await load('/src/renderer/src/lib/webSearchFeedback.ts')
  const running = projectWebSearchFeedback({
    toolName: 'web_search', args: { query: 'Sailor docs' }, status: 'running', result: undefined,
  })
  const completed = projectWebSearchFeedback({
    toolName: 'web_search', args: { query: 'Sailor docs' }, status: 'complete', result: success,
  })

  assert.deepEqual(running, {
    phase: 'running', query: 'Sailor docs', summary: '正在搜索 Web', sources: [],
  })
  assert.equal(completed.phase, 'succeeded')
  assert.equal(completed.sources[0]?.sourceId, source.sourceId)
  assert.equal(completed.sources[0]?.domain, 'example.com')
  assert.equal(completed.sources[0]?.url, source.url)
})

test('projects empty/error results visibly and rejects fake links', async () => {
  const { projectWebSearchFeedback } = await load('/src/renderer/src/lib/webSearchFeedback.ts')
  const { data: _data, ...successWithoutData } = success
  const failed = projectWebSearchFeedback({
    toolName: 'web_search',
    args: { query: 'none' },
    status: 'complete',
    result: {
      ...successWithoutData,
      ok: false,
      summary: 'Web 搜索没有结果',
      error: {
        code: 'EMPTY_RESULTS', message: '没有找到相关 Web 来源。', retryable: false,
        recovery: [{ action: 'retry', reason: '调整关键词' }],
      },
    },
  })
  const tampered = projectWebSearchFeedback({
    toolName: 'web_search', args: { query: 'bad' }, status: 'complete',
    result: { ...success, data: { query: 'bad', sources: [{ ...source, sourceId: 'invented', url: 'javascript:alert(1)' }] } },
  })

  assert.equal(failed.phase, 'failed')
  assert.equal(failed.errorCode, 'EMPTY_RESULTS')
  assert.deepEqual(failed.sources, [])
  assert.equal(tampered, null)
})

test('renders official WebSearch, Sources and ToolFallback composition', async () => {
  const { StructuredToolFallback } = await load('/src/renderer/src/components/chat/tools/StructuredToolFallback.tsx')
  const markup = renderToStaticMarkup(React.createElement(StructuredToolFallback, {
    toolName: 'web_search',
    toolCallId: 'call-search',
    args: { query: 'Sailor docs' },
    argsText: '{"query":"Sailor docs"}',
    result: success,
    status: { type: 'complete' },
  }))
  const threadSource = await readFile('src/renderer/src/components/assistant-ui/elements/thread.aui.tsx', 'utf8')

  assert.match(markup, /data-slot="web-search"/)
  assert.match(markup, /Sailor docs/)
  assert.match(markup, /example\.com/)
  assert.match(markup, /href="https:\/\/example\.com\/docs"/)
  assert.doesNotMatch(markup, /Search result summary only/)
  assert.match(threadSource, /case "source":/)
  assert.match(threadSource, /<Sources/)
})
