import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

test('composer 在附件拖放区域使用支持缩略图和预览的官方附件组件', async () => {
  const source = await readFile('src/renderer/src/components/chat/composer/SailorComposer.tsx', 'utf8')
  assert.match(source, /import\s*\{\s*ComposerAttachments\s*\}\s*from\s*["']@\/components\/assistant-ui\/elements\/attachment\.aui["']/,
    '输入框必须接入官方 runtime 附件组件，文件图标 chip 不提供图片预览')
  assert.match(source, /<ComposerPrimitive\.AttachmentDropzone\b[^>]*>[\s\S]*?<ComposerAttachments\s*\/>[\s\S]*?<\/ComposerPrimitive\.AttachmentDropzone>/,
    '官方附件列表必须实际挂载在 composer 拖放区域内')
})

test('composer 只接受 main 能处理的图片附件类型', async () => {
  const provider = await readFile('src/renderer/src/components/chat/runtime/SailorChatProvider.tsx', 'utf8')
  assert.match(provider, /adapters\s*:\s*\{\s*attachments\s*:\s*sailorAttachmentAdapter\s*\}/,
    '必须用收窄后的附件 adapter 替换默认的全类型 adapter')

  const adapter = await readFile('src/renderer/src/components/chat/runtime/sailorAttachmentAdapter.ts', 'utf8')
  assert.match(adapter, /SUPPORTED_ATTACHMENT_ACCEPT/,
    'adapter 的 accept 必须来自共享附件策略，避免与 main 的校验范围漂移')
  assert.match(adapter, /isSupportedImage\(file\.type\) \? 'image' : 'file'/,
    '文档附件不能被打成 image，否则会走缩略图与图片 part 转换路径')
})

test('composer 在附件类型被拒绝时显示可见提示', async () => {
  const source = await readFile('src/renderer/src/components/chat/composer/SailorComposer.tsx', 'utf8')
  assert.match(source, /composer\.attachmentAddError/,
    '必须订阅官方附件拒绝事件，否则拖入不支持的文件会被静默丢弃')
  assert.match(source, /role="alert">\s*\{[^}]*attachmentError[^}]*\}/,
    '附件拒绝原因必须渲染到可见提示')
})
