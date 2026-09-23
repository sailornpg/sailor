import assert from 'node:assert/strict'
import test from 'node:test'
import { createServer } from 'vite'
import { resolve } from 'node:path'

test('resizable divider maps pointer deltas and keyboard steps by orientation', async () => {
  const vite = await createServer({ logLevel: 'silent', server: { middlewareMode: true }, resolve: { alias: { '@': resolve('src/renderer/src'), '@shared': resolve('src/shared') } } })
  try {
  const { resizeFromPointer, resizeFromKeyboard } = await vite.ssrLoadModule('/src/renderer/src/components/layout/ResizableDivider.tsx')
  assert.equal(resizeFromPointer({ orientation: 'vertical', startValue: 240, startPointer: 300, pointer: 340, min: 100, max: 500 }), 280)
  assert.equal(resizeFromPointer({ orientation: 'horizontal', startValue: 240, startPointer: 300, pointer: 340, min: 100, max: 500 }), 280)
  assert.equal(resizeFromPointer({ orientation: 'horizontal', startValue: 240, startPointer: 300, pointer: 260, min: 100, max: 500 }), 200)
  assert.equal(resizeFromKeyboard({ orientation: 'horizontal', value: 240, key: 'ArrowRight', min: 100, max: 500 }), 240)
  assert.equal(resizeFromKeyboard({ orientation: 'horizontal', value: 240, key: 'ArrowDown', min: 100, max: 500 }), 256)
  } finally { await vite.close() }
})
