import { posix } from 'node:path'

/**
 * 上传的非图片附件放在会话 VFS 的内存层，而不是用户的项目目录：
 * agent 的 read/grep/ls/bash 都能看到它，但不会出现在用户的仓库里。
 */

export const ATTACHMENT_ROOT = '/home/sailor/attachments'

/** 附件名可能来自用户，去掉目录成分，只保留一个安全的文件名。 */
export function safeAttachmentName(filename: string): string {
  const base = posix.basename(filename.replaceAll('\\', '/'))
  const cleaned = base.replaceAll(/[\u0000-\u001f\u007f/]/g, '_').trim()
  return cleaned.length > 0 ? cleaned.slice(0, 120) : 'attachment'
}

export function attachmentVirtualPath(chatId: string, filename: string): string {
  const chat = chatId.replaceAll(/[^A-Za-z0-9_-]/g, '_').slice(0, 64)
  return posix.join(ATTACHMENT_ROOT, chat, safeAttachmentName(filename))
}

/** 只接受规范化后仍在附件根目录内的路径，避免用 `..` 逃出这一层。 */
export function isAttachmentPath(path: string): boolean {
  if (!path.startsWith('/')) return false
  const normalized = posix.normalize(path)
  return normalized === ATTACHMENT_ROOT || normalized.startsWith(`${ATTACHMENT_ROOT}/`)
}
