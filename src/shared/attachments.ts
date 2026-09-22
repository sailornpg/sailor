/**
 * 附件类型策略：main 侧校验与 renderer 侧可选类型共用同一份定义。
 * 两边各写一份会让「能选但不能发」的附件重新出现，而用户只会看到发送期错误。
 */

export const SUPPORTED_IMAGE_MEDIA_TYPES = [
  'image/png',
  'image/jpeg',
  'image/webp',
  'image/gif',
] as const

export const SUPPORTED_IMAGE_ACCEPT = SUPPORTED_IMAGE_MEDIA_TYPES.join(',')

export const UNSUPPORTED_ATTACHMENT_MESSAGE =
  '暂不支持该附件类型，目前仅支持 PNG、JPEG、WebP、GIF 图片与 xlsx/docx/pdf/csv 文档。'

/** `read_document` 能解析的文档类型。 */
export type SupportedDocumentFormat = 'xlsx' | 'docx' | 'pdf' | 'csv' | 'text'

/**
 * 扩展名是文档附件的唯一权威判断：xlsx/docx 的 MIME 在系统间不一致，
 * read_document 的格式探测也读这张表，避免 renderer 可选集合与 main 可解析集合漂移。
 */
export const DOCUMENT_EXTENSION_FORMATS: Record<string, SupportedDocumentFormat> = {
  '.xlsx': 'xlsx',
  '.xlsm': 'xlsx',
  '.docx': 'docx',
  '.pdf': 'pdf',
  '.csv': 'csv',
  '.tsv': 'csv',
  '.txt': 'text',
  '.md': 'text',
  '.markdown': 'text',
  '.json': 'text',
  '.jsonl': 'text',
  '.ndjson': 'text',
  '.log': 'text',
  '.yaml': 'text',
  '.yml': 'text',
  '.xml': 'text',
  '.toml': 'text',
  '.ini': 'text',
  '.conf': 'text',
  '.sql': 'text',
  '.ts': 'text',
  '.tsx': 'text',
  '.js': 'text',
  '.jsx': 'text',
  '.mjs': 'text',
  '.cjs': 'text',
  '.py': 'text',
  '.rb': 'text',
  '.go': 'text',
  '.rs': 'text',
  '.java': 'text',
  '.kt': 'text',
  '.c': 'text',
  '.h': 'text',
  '.cpp': 'text',
  '.hpp': 'text',
  '.cs': 'text',
  '.php': 'text',
  '.sh': 'text',
  '.bash': 'text',
  '.zsh': 'text',
  '.css': 'text',
  '.scss': 'text',
  '.html': 'text',
  '.vue': 'text',
  '.svelte': 'text',
  '.swift': 'text',
  '.lua': 'text',
}

export const SUPPORTED_DOCUMENT_EXTENSIONS = Object.keys(DOCUMENT_EXTENSION_FORMATS)

/** composer 的可选类型：图片用 MIME，文档用扩展名（MIME 在系统间不可靠）。 */
export const SUPPORTED_ATTACHMENT_ACCEPT = [
  ...SUPPORTED_IMAGE_MEDIA_TYPES,
  ...SUPPORTED_DOCUMENT_EXTENSIONS,
].join(',')

/**
 * `image/jpg` 不是注册的 MIME 类型，但部分系统和 provider 仍会这么报，
 * 归一化后再比较，避免把合法 JPEG 判成格式无效。
 */
export function normalizeImageMediaType(mediaType: string): string {
  const normalized = mediaType.trim().toLowerCase()
  return normalized === 'image/jpg' ? 'image/jpeg' : normalized
}

export function isImageMediaType(mediaType: string): boolean {
  return normalizeImageMediaType(mediaType).startsWith('image/')
}

export function isSupportedImageMediaType(mediaType: string): boolean {
  return (SUPPORTED_IMAGE_MEDIA_TYPES as readonly string[]).includes(
    normalizeImageMediaType(mediaType),
  )
}
