import { generateId, type AttachmentAdapter } from '@assistant-ui/react'
import {
  normalizeImageMediaType,
  SUPPORTED_ATTACHMENT_ACCEPT,
  SUPPORTED_IMAGE_MEDIA_TYPES,
} from '@shared/attachments'

/**
 * composer 的附件适配器：可选类型收窄到 main 真正能处理的范围（图片走视觉，
 * 文档走 read_document），并按类型给出正确的 attachment.type，否则文档会被
 * 当成图片走缩略图与图片 part 转换路径。
 */
const readAsDataUrl = (file: File): Promise<string> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result as string)
    reader.onerror = () => reject(reader.error ?? new Error('附件读取失败。'))
    reader.readAsDataURL(file)
  })

const isSupportedImage = (mediaType: string): boolean =>
  (SUPPORTED_IMAGE_MEDIA_TYPES as readonly string[]).includes(normalizeImageMediaType(mediaType))

export const sailorAttachmentAdapter: AttachmentAdapter = {
  accept: SUPPORTED_ATTACHMENT_ACCEPT,

  async add({ file }) {
    return {
      id: generateId(),
      type: isSupportedImage(file.type) ? 'image' : 'file',
      name: file.name,
      contentType: file.type,
      file,
      content: [],
      status: { type: 'requires-action', reason: 'composer-send' },
    }
  },

  async send(attachment) {
    return {
      ...attachment,
      status: { type: 'complete' },
      content: [
        {
          type: 'file',
          mimeType: attachment.contentType ?? '',
          filename: attachment.name,
          data: await readAsDataUrl(attachment.file),
        },
      ],
    }
  },

  async remove() {},
}
