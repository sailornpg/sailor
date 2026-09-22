import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import test from 'node:test'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { createServer } from 'vite'

test('official tool UI renders structured results and errors without a custom plan view', async () => {
  const vite = await createServer({
    logLevel: 'silent', server: { middlewareMode: true },
    resolve: { alias: { '@': resolve('src/renderer/src') } },
  })
  try {
    const { ToolFallback } = await vite.ssrLoadModule('/src/renderer/src/components/assistant-ui/elements/tool-fallback.aui.tsx')
    const result = renderToStaticMarkup(React.createElement(ToolFallback.Result, {
      result: { title: '历史记录', steps: [{ text: '保留内容' }] },
    }))
    assert.match(result, /历史记录/)
    assert.match(result, /保留内容/)
    const error = renderToStaticMarkup(React.createElement(ToolFallback.Error, {
      status: { type: 'incomplete', reason: 'error', error: '读取失败' },
    }))
    assert.match(error, /读取失败/)
  } finally { await vite.close() }
})

test('生成中指示器改用官方 GenerationLoader 矩阵并由本地时钟驱动', async () => {
  const source = await readFile('src/renderer/src/components/assistant-ui/elements/thread.aui.tsx', 'utf8')
  assert.match(source, /import\s*\{\s*GenerationLoader\s*\}\s*from\s*['"]@\/components\/assistant-ui\/elements\/loading-state['"]/,
    '生成中样式必须来自官方 loading-state element')
  assert.match(source, /case\s*['"]indicator['"]:\s*return\s*<GeneratingIndicator\s*\/>/,
    'assistant 消息的 indicator part 必须渲染矩阵加载器')
  assert.doesNotMatch(source, /\bThinkingIndicator\b/,
    '旧单点指示器不应再留在 thread 渲染路径里')
  assert.match(source, /setInterval\(\(\)\s*=>\s*setTick\(\(value\)\s*=>\s*value\s*\+\s*1\),\s*120\)/,
    'GenerationLoader 不会自己推进 tick，缺少本地时钟矩阵就不会动')
})

test('GenerationLoader 按 tick 点亮三个单元格并随 tick 移动', async () => {
  const vite = await createServer({
    logLevel: 'silent', server: { middlewareMode: true },
    resolve: { alias: { '@': resolve('src/renderer/src') } },
  })
  try {
    const { GenerationLoader } = await vite.ssrLoadModule('/src/renderer/src/components/assistant-ui/elements/loading-state.tsx')
    const renderLoader = (tick: number): string =>
      renderToStaticMarkup(React.createElement(GenerationLoader, { label: '正在思考', tick }))
    const litCells = (markup: string): number[] =>
      markup
        .split(/<span\b/)
        .slice(1)
        .flatMap((cell, index) => (cell.includes('opacity-90') ? [index] : []))

    const first = renderLoader(3)
    assert.match(first, /data-slot="generation-loader"/)
    assert.match(first, /正在思考/, 'shimmer 标签必须显示生成中文案')
    assert.match(first, /flex-row/, '图标与文案必须左右布局，不是上下堆叠')
    assert.match(first, /size-1(?!\d)/, '像素矩阵必须缩到一半（size-2 → size-1）')
    assert.equal(litCells(first).length, 3, '矩阵应只有三个亮起的单元格')
    assert.notDeepStrictEqual(litCells(renderLoader(12)), litCells(first),
      'tick 推进后亮起的单元格必须移动')
  } finally { await vite.close() }
})
