import assert from 'node:assert/strict'
import { resolve } from 'node:path'
import test from 'node:test'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { createServer } from 'vite'

const alias = { '@': resolve('src/renderer/src'), '@shared': resolve('src/shared') }

test('分隔条暴露可访问的 separator 契约与当前宽度', async () => {
  const vite = await createServer({ logLevel: 'silent', server: { middlewareMode: true }, resolve: { alias } })
  try {
    const { PaneResizer } = await vite.ssrLoadModule('/src/renderer/src/components/layout/PaneResizer.tsx')
    const html = renderToStaticMarkup(React.createElement(PaneResizer, {
      label: '调整侧边栏宽度',
      max: 420,
      min: 200,
      onResize() {},
      side: 'left',
      width: 300.4,
    }))

    assert.match(html, /role="separator"/)
    assert.match(html, /aria-orientation="vertical"/)
    assert.match(html, /aria-label="调整侧边栏宽度"/)
    assert.match(html, /aria-valuemin="200"/)
    assert.match(html, /aria-valuemax="420"/)
    assert.match(html, /aria-valuenow="300"/, '当前宽度四舍五入后暴露给辅助技术')
    assert.match(html, /tabindex="0"/, '分隔条必须可聚焦，否则键盘无法调整')
    assert.match(html, /data-side="left"/)
    assert.match(html, /data-dragging="false"/)
    assert.match(html, /class="pane-resizer-grip"/, '分隔条要有可见的抓取提示，否则用户不知道能拖')
    assert.doesNotMatch(html, /onPointerMove|onPointerUp/, '拖拽不能依赖分隔条自身的 pointermove/pointerup')
  } finally {
    await vite.close()
  }
})

test('左右两栏的分隔条方向由 side 决定，样式钩子稳定', async () => {
  const vite = await createServer({ logLevel: 'silent', server: { middlewareMode: true }, resolve: { alias } })
  try {
    const { PaneResizer } = await vite.ssrLoadModule('/src/renderer/src/components/layout/PaneResizer.tsx')
    const right = renderToStaticMarkup(React.createElement(PaneResizer, {
      label: '调整面板宽度',
      max: 720,
      min: 280,
      onResize() {},
      side: 'right',
      width: 384,
    }))

    assert.match(right, /class="pane-resizer"/)
    assert.match(right, /data-side="right"/)
    assert.equal((right.match(/role="separator"/g) ?? []).length, 1)
  } finally {
    await vite.close()
  }
})
