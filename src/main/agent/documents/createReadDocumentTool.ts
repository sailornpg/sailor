import { posix } from 'node:path'
import { tool, type ToolSet } from 'ai'
import { z } from 'zod'
import {
  createToolFailure,
  createToolSuccess,
  createUnexpectedToolFailure,
  toToolModelOutput,
  type ToolErrorCode,
} from '../../../shared/toolFeedback.js'
import {
  DocumentExtractionError,
  DOCUMENT_BUDGETS,
  extractDocument,
  type DocumentErrorCode,
} from './extractDocument.js'
import { isAttachmentPath } from './attachmentPaths.js'

export const READ_DOCUMENT_TOOL = 'read_document'

export interface ReadDocumentSources {
  /** 会话 VFS 中的绝对路径，用于本轮上传的非图片附件。 */
  readVirtualFile(path: string): Promise<Uint8Array>
  /** 工作区相对路径，越界与敏感路径由调用方的 scope 拒绝。 */
  readWorkspaceFile(path: string): Promise<Uint8Array>
}

const ERROR_CODE_MAP: Record<DocumentErrorCode, ToolErrorCode> = {
  UNSUPPORTED_TYPE: 'UNSUPPORTED_TYPE',
  TOO_LARGE: 'LIMIT_EXCEEDED',
  PARSE_FAILED: 'PARSE_FAILED',
  BINARY_CONTENT: 'BINARY_FILE',
}

const ERROR_RECOVERY: Record<DocumentErrorCode, string> = {
  UNSUPPORTED_TYPE: '请改用受支持的格式，或让用户在本地转换后再上传',
  TOO_LARGE: '请让用户拆分或压缩该文件后重试',
  PARSE_FAILED: '请确认文件未损坏、未被加密；必要时让用户重新导出',
  BINARY_CONTENT: '请确认这是文本文件，而不是二进制文件被改了后缀',
}

function isNotFound(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    (error as NodeJS.ErrnoException).code === 'ENOENT'
  )
}

export function createReadDocumentTool(sources: ReadDocumentSources): ToolSet {
  const readDocument = tool({
    description:
      'Read a document and return its text content. Supports .xlsx/.xlsm spreadsheets (one section per sheet), ' +
      '.docx, .pdf, .csv/.tsv and common text/code files. Use it for binary office formats that the native read ' +
      'tool cannot decode. Uploaded attachments are listed in the user message with their absolute paths.',
    inputSchema: z.object({
      path: z
        .string()
        .min(1)
        .describe(
          'Workspace-relative path (e.g. "reports/sales.xlsx"), or the absolute /home/sailor/attachments/... path of an uploaded attachment.',
        ),
      maxRows: z
        .number()
        .int()
        .positive()
        .max(DOCUMENT_BUDGETS.rows)
        .optional()
        .describe('Maximum rows per sheet for spreadsheets.'),
      maxCharacters: z
        .number()
        .int()
        .positive()
        .max(DOCUMENT_BUDGETS.maxCharacters)
        .optional()
        .describe('Maximum characters of extracted text to return.'),
    }),
    execute: async ({ path, maxRows, maxCharacters }, { toolCallId }) => {
      const started = Date.now()
      const filename = posix.basename(path)

      try {
        const bytes = isAttachmentPath(path)
          ? await sources.readVirtualFile(path)
          : await sources.readWorkspaceFile(path)

        const extracted = await extractDocument({ filename, bytes, maxRows, maxCharacters })
        return toToolModelOutput(
          createToolSuccess({
            toolCallId,
            tool: READ_DOCUMENT_TOOL,
            summary: extracted.summary,
            durationMs: Date.now() - started,
            data: extracted.data,
            truncated: extracted.truncated,
          }),
        )
      } catch (error) {
        if (error instanceof DocumentExtractionError) {
          const code = ERROR_CODE_MAP[error.code]
          return toToolModelOutput(
            createToolFailure({
              toolCallId,
              tool: READ_DOCUMENT_TOOL,
              summary: `${filename} 无法读取`,
              durationMs: Date.now() - started,
              code,
              message: error.message,
              retryable: error.code !== 'UNSUPPORTED_TYPE',
              recovery: [{ action: 'ask_user', reason: ERROR_RECOVERY[error.code] }],
            }),
          )
        }

        if (isNotFound(error)) {
          return toToolModelOutput(
            createToolFailure({
              toolCallId,
              tool: READ_DOCUMENT_TOOL,
              summary: `未找到 ${path}`,
              durationMs: Date.now() - started,
              code: 'NOT_FOUND',
              message: `工作区中不存在「${path}」。`,
              retryable: false,
              recovery: [{ action: 'list_files', path: posix.dirname(path), reason: '确认文件的实际路径' }],
            }),
          )
        }

        // 任意其他异常（含路径策略拒绝）都不把内部细节暴露给模型。
        return toToolModelOutput(
          createUnexpectedToolFailure({
            toolCallId,
            tool: READ_DOCUMENT_TOOL,
            error,
            durationMs: Date.now() - started,
          }),
        )
      }
    },
  })

  return { [READ_DOCUMENT_TOOL]: readDocument } as ToolSet
}
