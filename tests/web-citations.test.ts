import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import test from 'node:test'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { createServer } from 'vite'

type Citation = {
  number: number
  sourceId: string
  title: string
  url: string
  domain: string
  snippet: string
}

type CitationModule = {
  citationUrlKey: (url: string) => string | null
  citationForUrl: (citations: readonly Citation[], href: string) => Citation | undefined
  isBareUrlText: (text: string, href: string) => boolean
  collectWebCitations: (parts: readonly unknown[]) => Citation[]
}

const createVite = () =>
  createServer({
    logLevel: 'silent',
    resolve: {
      alias: {
        '@': resolve(process.cwd(), 'src/renderer/src'),
        '@shared': resolve(process.cwd(), 'src/shared'),
      },
    },
    server: { middlewareMode: true },
  })

async function load<T>(modulePath: string): Promise<T> {
  const vite = await createVite()
  try {
    return (await vite.ssrLoadModule(modulePath)) as T
  } finally {
    await vite.close()
  }
}

// `sourceId` is contract-validated as `src_` + 16 hex chars, so fixtures must
// satisfy the real schema rather than a convenient placeholder.
const source = (id: string, url: string, title = `标题 ${id}`) => ({
  sourceId: `src_${id.repeat(16).slice(0, 16)}`,
  title,
  url,
  snippet: `${title} 摘要`,
  retrievedAt: '2026-09-22T10:00:00.000Z',
})

function searchPart(
  toolCallId: string,
  sources: ReturnType<typeof source>[],
  status: 'complete' | 'running' = 'complete',
) {
  return {
    type: 'tool-call',
    toolCallId,
    toolName: 'web_search',
    args: { query: 'x' },
    argsText: '{"query":"x"}',
    status: { type: status },
    result:
      status === 'complete'
        ? {
            schemaVersion: 1,
            toolCallId,
            tool: 'web_search',
            ok: true,
            summary: `找到 ${sources.length} 个 Web 来源`,
            durationMs: 12,
            effects: { kind: 'none' },
            truncated: false,
            data: { query: 'x', sources },
          }
        : undefined,
  }
}

test('按页面去重并按首次出现编号收集本轮 Web 来源', async () => {
  const { collectWebCitations } = await load<CitationModule>(
    '/src/renderer/src/lib/webCitationSources.ts',
  )
  const citations = collectWebCitations([
    { type: 'text', text: '正文' },
    searchPart('call-1', [
      source('a', 'https://www.bbc.com/zhongwen/simp'),
      source('b', 'https://example.com/docs'),
    ]),
    searchPart('call-2', [
      source('c', 'https://www.bbc.com/zhongwen/simp/'),
      source('d', 'https://www.bbc.com/zhongwen/simp?utm_source=share'),
      source('e', 'https://www.dw.com/zh/online/s-9058'),
    ]),
  ])

  assert.deepEqual(
    citations.map((citation) => [citation.number, citation.url]),
    [
      [1, 'https://www.bbc.com/zhongwen/simp'],
      [2, 'https://example.com/docs'],
      [3, 'https://www.dw.com/zh/online/s-9058'],
    ],
    '同一页面只保留首次出现的 URL，编号连续',
  )
})

test('忽略非搜索工具、进行中与失败的搜索', async () => {
  const { collectWebCitations } = await load<CitationModule>(
    '/src/renderer/src/lib/webCitationSources.ts',
  )
  const citations = collectWebCitations([
    {
      type: 'tool-call',
      toolName: 'read_document',
      args: { path: '/home/sailor/attachments/x.xlsx' },
      result: { ok: true, data: { results: [] } },
      status: { type: 'complete' },
    },
    searchPart('call-running', [], 'running'),
    {
      type: 'tool-call',
      toolName: 'web_search',
      args: { query: 'x' },
      status: { type: 'incomplete', reason: 'error' },
      result: {
        schemaVersion: 1,
        toolCallId: 'call-failed',
        tool: 'web_search',
        ok: false,
        summary: 'Web 搜索没有结果',
        durationMs: 5,
        effects: { kind: 'none' },
        truncated: false,
        error: { code: 'EMPTY_RESULTS', message: '没有找到相关 Web 来源。', retryable: false },
      },
    },
    { type: 'text', text: '没有来源的正文' },
  ])

  assert.deepEqual(citations, [])
})

test('URL 归一化容忍 www、协议、末尾斜杠与追踪参数，并拒绝非页面地址', async () => {
  const { citationUrlKey, citationForUrl, isBareUrlText } = await load<CitationModule>(
    '/src/renderer/src/lib/webCitationSources.ts',
  )
  const key = citationUrlKey('https://www.bbc.com/zhongwen/simp')

  assert.equal(key, 'bbc.com/zhongwen/simp')
  assert.equal(citationUrlKey('http://bbc.com/zhongwen/simp/'), key)
  assert.equal(citationUrlKey('https://bbc.com/zhongwen/simp?utm_source=x#top'), key)
  assert.equal(citationUrlKey('/relative/path'), null, '相对路径不是可引用来源')
  assert.equal(citationUrlKey('javascript:alert(1)'), null, '非 http(s) 协议必须拒绝')

  const citations: Citation[] = [
    {
      number: 1,
      sourceId: 'src_aaaaaaaaaaaaaaaa',
      title: 'BBC 中文',
      url: 'https://www.bbc.com/zhongwen/simp',
      domain: 'bbc.com',
      snippet: '摘要',
    },
  ]
  assert.equal(citationForUrl(citations, 'https://bbc.com/zhongwen/simp?from=share')?.number, 1)
  assert.equal(citationForUrl(citations, 'https://example.com/other'), undefined)

  assert.equal(isBareUrlText('https://www.bbc.com/zhongwen/simp', 'https://bbc.com/zhongwen/simp'), true)
  assert.equal(isBareUrlText('bbc.com/zhongwen/simp', 'https://www.bbc.com/zhongwen/simp'), true)
  assert.equal(isBareUrlText('BBC 中文报道', 'https://www.bbc.com/zhongwen/simp'), false)
  assert.equal(isBareUrlText('https://example.com/other', 'https://www.bbc.com/zhongwen/simp'), false)
  assert.equal(isBareUrlText('', 'https://www.bbc.com/zhongwen/simp'), false)
})

test('正文里命中来源的链接渲染为引用号，裸 URL 被引用号替换', async () => {
  const vite = await createVite()
  try {
    const { TextMessagePartProvider } = await vite.ssrLoadModule('@assistant-ui/react')
    const { MarkdownText } = await vite.ssrLoadModule(
      '/src/renderer/src/components/assistant-ui/elements/markdown-text.tsx',
    )
    const citations: Citation[] = [
      {
        number: 1,
        sourceId: 'src_aaaaaaaaaaaaaaaa',
        title: 'BBC 中文',
        url: 'https://www.bbc.com/zhongwen/simp',
        domain: 'bbc.com',
        snippet: '英国广播公司中文网',
      },
    ]
    const markup = renderToStaticMarkup(
      React.createElement(
        TextMessagePartProvider,
        {
          text: [
            '[BBC 报道](https://www.bbc.com/zhongwen/simp)',
            '',
            'https://www.bbc.com/zhongwen/simp',
            '',
            '[别的站](https://example.com/x)',
          ].join('\n'),
          isRunning: false,
        },
        React.createElement(MarkdownText, { citations }),
      ),
    )

    assert.match(markup, /aria-label="来源 1：BBC 中文"/, '命中来源必须渲染引用号')
    assert.equal(
      markup.match(/aria-label="来源/g)?.length,
      2,
      '文字链接与裸 URL 各得到一个引用号，未命中的链接没有',
    )
    assert.equal(
      markup.match(/href="https:\/\/www\.bbc\.com\/zhongwen\/simp"/g)?.length,
      1,
      '裸 URL 必须被引用号替换，只保留文字链接那一个锚点',
    )
    assert.match(markup, />BBC 报道</, '有文案的链接保留原文案')
    assert.match(markup, /href="https:\/\/example\.com\/x"/, '未命中来源的链接照常渲染')
    assert.doesNotMatch(markup, /Optimistic updates/, 'registry 的演示文案不得进入正文')
  } finally {
    await vite.close()
  }
})

test('只有答案正文收集引用，推理文本不受影响', async () => {
  const thread = await readFile(
    'src/renderer/src/components/assistant-ui/elements/thread.aui.tsx',
    'utf8',
  )
  const reasoning = await readFile(
    'src/renderer/src/components/assistant-ui/elements/reasoning.aui.tsx',
    'utf8',
  )
  const markdown = await readFile(
    'src/renderer/src/components/assistant-ui/elements/markdown-text.tsx',
    'utf8',
  )

  assert.match(thread, /case "text":\s*return <AssistantAnswerText \/>;/, '答案正文必须走引用收集')
  assert.match(thread, /collectWebCitations\(content\)/)
  assert.match(thread, /<MarkdownText citations=\{citations\} \/>/)
  assert.match(reasoning, /<MarkdownText \/>/, '推理文本不传 citations')
  assert.match(markdown, /createCitationLink\(citations\)/, 'markdown 必须覆盖 a 组件')
  assert.match(markdown, /<CitationMarker/)
})
