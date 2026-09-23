import assert from 'node:assert/strict'
import test from 'node:test'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { createServer } from 'vite'
import { resolve } from 'node:path'
test('文件树展示嵌套目录、选中态和离线 SVG 图标', async (t) => {
  const vite = await createServer({
    logLevel: 'silent',
    server: { middlewareMode: true },
    resolve: {
      alias: {
        '@': resolve('src/renderer/src'),
        '@shared': resolve('src/shared'),
      },
    },
  })
  t.after(() => vite.close())
  const { FileTreeRows } = await vite.ssrLoadModule(
    '/src/renderer/src/components/panels/FilesPanel.tsx',
  )
  const html = renderToStaticMarkup(
    React.createElement(FileTreeRows, {
      page: {
        entries: [{ name: 'src', relativePath: 'src', kind: 'directory' }],
      },
      pages: {
        src: {
          entries: [{ name: 'a.ts', relativePath: 'src/a.ts', kind: 'file' }],
        },
      },
      expanded: new Set(['src']),
      selected: 'src/a.ts',
      toggle() {},
      open() {},
      more() {},
    }),
  )
  assert.match(html, /a.ts/)
  assert.match(html, /aria-expanded="true"/)
  assert.match(html, /is-selected/)
  assert.match(html, /<svg/)
  assert.doesNotMatch(html, /https:\/\/api.iconify/)
})
