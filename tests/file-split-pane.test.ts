import assert from 'node:assert/strict'
import test from 'node:test'
import { createServer } from 'vite'
import { resolve } from 'node:path'

test('文件树比例限制在 20% 到 50%', async () => {
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
  const { clampFileTreeRatio } = await vite.ssrLoadModule(
    '/src/renderer/src/components/panels/FileSplitPane.tsx',
  )
  assert.equal(clampFileTreeRatio(-1), 0.2)
  assert.equal(clampFileTreeRatio(0.3), 0.3)
  assert.equal(clampFileTreeRatio(1), 0.5)
  await vite.close()
})
