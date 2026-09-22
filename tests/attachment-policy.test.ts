import assert from 'node:assert/strict'
import { resolve } from 'node:path'
import test from 'node:test'
import { createServer, type ViteDevServer } from 'vite'

let vite: ViteDevServer
let policy: typeof import('../src/shared/attachments.ts')

test.before(async () => {
  vite = await createServer({
    logLevel: 'silent',
    resolve: { alias: { '@shared': resolve(process.cwd(), 'src/shared') } },
    server: { middlewareMode: true },
  })
  policy = await vite.ssrLoadModule('/src/shared/attachments.ts') as typeof policy
})

test.after(async () => {
  await vite?.close()
})

test('附件策略只接受 main 能校验的四种图片类型', () => {
  assert.deepEqual(
    [...policy.SUPPORTED_IMAGE_MEDIA_TYPES],
    ['image/png', 'image/jpeg', 'image/webp', 'image/gif'],
  )
  assert.equal(policy.SUPPORTED_IMAGE_ACCEPT, 'image/png,image/jpeg,image/webp,image/gif')
  for (const mediaType of policy.SUPPORTED_IMAGE_MEDIA_TYPES) {
    assert.equal(policy.isSupportedImageMediaType(mediaType), true, mediaType)
  }
  for (const mediaType of [
    'text/plain',
    'application/pdf',
    'application/octet-stream',
    'image/svg+xml',
    'image/heic',
    'image/avif',
    'image/bmp',
    'image/tiff',
    '',
  ]) {
    assert.equal(policy.isSupportedImageMediaType(mediaType), false, mediaType)
  }
})

test('附件策略归一化 image/jpg 并区分图片与非图片类型', () => {
  assert.equal(policy.normalizeImageMediaType('image/jpg'), 'image/jpeg')
  assert.equal(policy.normalizeImageMediaType('IMAGE/PNG'), 'image/png')
  assert.equal(policy.normalizeImageMediaType(' image/webp '), 'image/webp')
  assert.equal(policy.isImageMediaType('image/svg+xml'), true)
  assert.equal(policy.isImageMediaType('text/plain'), false)
  assert.equal(policy.isSupportedImageMediaType('image/jpg'), true)
})

test('附件拒绝提示说明当前支持的类型', () => {
  assert.match(policy.UNSUPPORTED_ATTACHMENT_MESSAGE, /PNG、JPEG、WebP、GIF/)
})
