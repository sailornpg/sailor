import { extname } from 'node:path'
import readExcelFile from 'read-excel-file/node'
import mammoth from 'mammoth'
import { extractText, getDocumentProxy } from 'unpdf'
import { limitToolText } from '../../../shared/toolFeedback.js'
import {
  DOCUMENT_EXTENSION_FORMATS,
  type SupportedDocumentFormat,
} from '../../../shared/attachments.js'

/**
 * `read_document` 的解析层：按类型分发到不同解析器，返回同一种结果形状。
 * 所有上限都显式声明，截断必须被标注出来，模型不能把截断当成完整内容。
 */

export type DocumentFormat = SupportedDocumentFormat

export const DOCUMENT_BUDGETS = {
  /** 单个文档的原始字节上限，超过直接拒绝而不是尝试解析。 */
  sourceBytes: 16 * 1024 * 1024,
  /** 返回给模型的默认字符数；需在 ToolModelOutput 预算内，避免退化成 JSON preview。 */
  characters: 16 * 1024,
  /** 调用方可以要求的字符数上限。 */
  maxCharacters: 32 * 1024,
  sheets: 20,
  rows: 500,
  columns: 60,
} as const

export type DocumentErrorCode =
  | 'UNSUPPORTED_TYPE'
  | 'TOO_LARGE'
  | 'PARSE_FAILED'
  | 'BINARY_CONTENT'

export class DocumentExtractionError extends Error {
  constructor(
    readonly code: DocumentErrorCode,
    message: string,
  ) {
    super(message)
    this.name = 'DocumentExtractionError'
  }
}

export interface ExtractedDocument {
  format: DocumentFormat
  summary: string
  data: Record<string, unknown>
  truncated: boolean
}

const ZIP_SIGNATURE = Buffer.from([0x50, 0x4b, 0x03, 0x04])
const SNIFF_BYTES = 4096

function startsWith(bytes: Uint8Array, signature: Buffer): boolean {
  if (bytes.length < signature.length) return false
  for (let index = 0; index < signature.length; index += 1) {
    if (bytes[index] !== signature[index]) return false
  }
  return true
}

function extensionFormat(filename: string): DocumentFormat | undefined {
  return DOCUMENT_EXTENSION_FORMATS[extname(filename).toLowerCase()]
}

/**
 * 扩展名给主判断，magic bytes 做兜底：改名或没有后缀的文件也应该被正确路由，
 * 而不是靠后缀猜一个解析器再去失败。
 */
export function detectDocumentFormat(input: {
  filename: string
  bytes: Uint8Array
}): DocumentFormat | undefined {
  const { filename, bytes } = input
  const byExtension = extensionFormat(filename)

  if (startsWith(bytes, Buffer.from('%PDF-'))) return 'pdf'

  if (startsWith(bytes, ZIP_SIGNATURE)) {
    // OOXML 都是 ZIP，靠包内目录区分；只能读到多少算多少，不为了探测解压整个包。
    if (byExtension === 'xlsx' || byExtension === 'docx') return byExtension
    const head = Buffer.from(bytes.subarray(0, SNIFF_BYTES)).toString('latin1')
    if (head.includes('xl/')) return 'xlsx'
    if (head.includes('word/')) return 'docx'
    return undefined
  }

  return byExtension === 'csv' || byExtension === 'text' ? byExtension : undefined
}

const NUL = 0x00

function assertText(bytes: Uint8Array, label: string): string {
  const probe = bytes.subarray(0, SNIFF_BYTES)
  if (probe.includes(NUL)) {
    throw new DocumentExtractionError(
      'BINARY_CONTENT',
      `「${label}」包含二进制内容，无法按文本读取。`,
    )
  }
  return new TextDecoder('utf-8').decode(bytes)
}

function formatCell(value: unknown): string {
  if (value === null || value === undefined) return ''
  if (value instanceof Date) {
    const iso = value.toISOString()
    return iso.endsWith('T00:00:00.000Z') ? iso.slice(0, 10) : iso
  }
  if (typeof value === 'number') return Number.isFinite(value) ? String(value) : ''
  if (typeof value === 'boolean') return value ? 'true' : 'false'
  if (typeof value === 'string') return value
  return String(value)
}

interface SheetResult {
  name: string
  rows: string[][]
  truncated: boolean
}

function renderSheets(sheets: SheetResult[]): string {
  return sheets
    .map((sheet) => [`[Sheet: ${sheet.name}]`, ...sheet.rows.map((row) => row.join('\t'))].join('\n'))
    .join('\n\n')
}

async function parseSpreadsheet(
  bytes: Uint8Array,
  options: { maxRows?: number },
): Promise<{ sheets: SheetResult[]; truncated: boolean }> {
  const parsed = (await readExcelFile(Buffer.from(bytes))) as Array<{
    sheet: string
    data: unknown[][]
  }>
  let truncated = parsed.length > DOCUMENT_BUDGETS.sheets
  const rowLimit = options.maxRows ?? DOCUMENT_BUDGETS.rows

  const sheets = parsed.slice(0, DOCUMENT_BUDGETS.sheets).map(({ sheet, data }) => {
    const sheetTruncated = data.length > rowLimit
    truncated = truncated || sheetTruncated
    const rows = data.slice(0, rowLimit).map((row) => {
      if (row.length > DOCUMENT_BUDGETS.columns) truncated = true
      return row.slice(0, DOCUMENT_BUDGETS.columns).map(formatCell)
    })
    return { name: sheet, rows, truncated: sheetTruncated }
  })

  return { sheets, truncated }
}

async function parseDocx(bytes: Uint8Array): Promise<string> {
  const result = await mammoth.extractRawText({ buffer: Buffer.from(bytes) })
  return result.value.trim()
}

async function parsePdf(bytes: Uint8Array): Promise<{ text: string; pages: number }> {
  const pdf = await getDocumentProxy(new Uint8Array(bytes))
  const { text, totalPages } = await extractText(pdf, { mergePages: true })
  return {
    text: (Array.isArray(text) ? text.join('\n\n') : text).trim(),
    pages: totalPages,
  }
}

export interface ExtractDocumentInput {
  filename: string
  bytes: Uint8Array
  maxRows?: number
  maxCharacters?: number
}

export async function extractDocument(input: ExtractDocumentInput): Promise<ExtractedDocument> {
  const { filename, bytes } = input
  if (bytes.length === 0) {
    throw new DocumentExtractionError('PARSE_FAILED', `「${filename}」为空文件，无法读取。`)
  }
  if (bytes.length > DOCUMENT_BUDGETS.sourceBytes) {
    throw new DocumentExtractionError(
      'TOO_LARGE',
      `「${filename}」超过单文件 ${Math.floor(DOCUMENT_BUDGETS.sourceBytes / (1024 * 1024))} MiB 上限。`,
    )
  }

  const format = detectDocumentFormat({ filename, bytes })
  if (!format) {
    throw new DocumentExtractionError(
      'UNSUPPORTED_TYPE',
      `暂不支持「${filename}」的类型；read_document 目前支持 xlsx/xlsm、docx、pdf、csv/tsv 与常见文本类型。`,
    )
  }

  const characterLimit = Math.min(
    input.maxCharacters ?? DOCUMENT_BUDGETS.characters,
    DOCUMENT_BUDGETS.maxCharacters,
  )

  try {
    if (format === 'xlsx') {
      const { sheets, truncated } = await parseSpreadsheet(bytes, { maxRows: input.maxRows })
      const limited = limitToolText(renderSheets(sheets), characterLimit)
      const totalRows = sheets.reduce((sum, sheet) => sum + sheet.rows.length, 0)
      return {
        format,
        summary: `${filename}：${sheets.length} 个 sheet，共 ${totalRows} 行${
          truncated || limited.truncated ? '（已截断）' : ''
        }`,
        data: { format, text: limited.text, sheets },
        truncated: truncated || limited.truncated,
      }
    }

    if (format === 'docx') {
      const text = await parseDocx(bytes)
      const limited = limitToolText(text, characterLimit)
      return {
        format,
        summary: `${filename}：${limited.originalLength} 字符${limited.truncated ? '（已截断）' : ''}`,
        data: { format, text: limited.text },
        truncated: limited.truncated,
      }
    }

    if (format === 'pdf') {
      const { text, pages } = await parsePdf(bytes)
      const limited = limitToolText(text, characterLimit)
      return {
        format,
        summary: `${filename}：${pages} 页，${limited.originalLength} 字符${
          limited.truncated ? '（已截断）' : ''
        }`,
        data: { format, text: limited.text, pages },
        truncated: limited.truncated,
      }
    }

    const text = assertText(bytes, filename)
    const limited = limitToolText(text, characterLimit)
    return {
      format,
      summary: `${filename}：${limited.originalLength} 字符${limited.truncated ? '（已截断）' : ''}`,
      data: { format, text: limited.text },
      truncated: limited.truncated,
    }
  } catch (error) {
    if (error instanceof DocumentExtractionError) throw error
    // 解析器的原始错误可能带宿主路径或堆栈，一律换成可读且不含内部细节的信息。
    throw new DocumentExtractionError(
      'PARSE_FAILED',
      `无法解析「${filename}」，文件可能已损坏、被加密或格式不受支持。`,
    )
  }
}
