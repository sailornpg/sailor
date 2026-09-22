import { createHash, randomUUID } from 'node:crypto'
import { link, open, readFile, rename, rm } from 'node:fs/promises'
import { basename, join, resolve } from 'node:path'
import { z } from 'zod'
import {
  TOOL_BUDGETS,
  createInvalidArgumentFailure,
  createToolFailure,
  createToolSuccess,
  type ToolFailure,
  type ToolResult,
} from '../../../src/shared/toolFeedback.js'
import type { ConsumeWriteGrantInput, WorkspaceWriteApproval } from './WorkspaceWriteApproval.js'
import { WorkspaceToolScopeError, type WorkspaceToolContext } from '../../../src/main/workspaces/WorkspaceToolScope.js'

const hashSchema = z.string().regex(/^[a-f0-9]{64}$/)

export const writeFileInputSchema = z.strictObject({
  path: z.string().min(1).max(4096),
  content: z.string().refine(value => Buffer.byteLength(value) <= TOOL_BUDGETS.writeFileBytes, {
    message: `content must be at most ${TOOL_BUDGETS.writeFileBytes} UTF-8 bytes`,
  }),
  mode: z.enum(['create', 'overwrite']).default('create'),
  expectedHash: hashSchema.optional(),
}).superRefine((value, context) => {
  if (value.mode === 'overwrite' && !value.expectedHash) {
    context.addIssue({ code: 'custom', path: ['expectedHash'], message: 'overwrite mode requires expectedHash' })
  }
  if (value.mode === 'create' && value.expectedHash) {
    context.addIssue({ code: 'custom', path: ['expectedHash'], message: 'create mode does not accept expectedHash' })
  }
})

export type WriteFileInput = z.infer<typeof writeFileInputSchema>

export const applyPatchInputSchema = z.strictObject({
  path: z.string().min(1).max(4096),
  patch: z.string().min(1).max(TOOL_BUDGETS.writeFileBytes),
  expectedHash: hashSchema,
})

export type ApplyPatchInput = z.infer<typeof applyPatchInputSchema>

export interface WorkspaceWriteFileSystem {
  readTarget(path: string, signal: AbortSignal): Promise<Buffer>
  writeTemporaryFile(path: string, content: Buffer): Promise<void>
  publishCreate(temporaryPath: string, targetPath: string): Promise<void>
  publishOverwrite(temporaryPath: string, targetPath: string): Promise<void>
  removeTemporary(path: string): Promise<void>
}

export const nodeWorkspaceWriteFileSystem: WorkspaceWriteFileSystem = {
  readTarget: (path, signal) => readFile(path, { signal }),
  async writeTemporaryFile(path, content) {
    const handle = await open(path, 'wx', 0o600)
    try {
      await handle.writeFile(content)
      await handle.sync()
    } finally {
      await handle.close()
    }
  },
  publishCreate: (temporaryPath, targetPath) => link(temporaryPath, targetPath),
  publishOverwrite: (temporaryPath, targetPath) => rename(temporaryPath, targetPath),
  removeTemporary: path => rm(path, { force: true }),
}

export class WorkspaceWriteCoordinator {
  private readonly paths = new Map<string, Promise<void>>()

  async run<T>(path: string, operation: () => Promise<T>): Promise<T> {
    const previous = this.paths.get(path) ?? Promise.resolve()
    let release!: () => void
    const current = new Promise<void>(resolve => { release = resolve })
    this.paths.set(path, current)
    await previous.catch(() => undefined)
    try {
      return await operation()
    } finally {
      release()
      if (this.paths.get(path) === current) this.paths.delete(path)
    }
  }
}

const sharedCoordinator = new WorkspaceWriteCoordinator()

interface GrantConsumer {
  consumeGrant(input: ConsumeWriteGrantInput): ReturnType<WorkspaceWriteApproval['consumeGrant']>
}

interface WorkspaceWriteToolsOptions {
  coordinator?: WorkspaceWriteCoordinator
  fileSystem?: WorkspaceWriteFileSystem
}

function digest(content: Buffer): string {
  return createHash('sha256').update(content).digest('hex')
}

export function hashContent(content: string): string {
  return digest(Buffer.from(content, 'utf8'))
}

function elapsed(startedAt: number): number {
  return Math.max(0, Date.now() - startedAt)
}

function invalidFailure(toolCallId: string, error: z.ZodError): ToolFailure {
  return createInvalidArgumentFailure({
    toolCallId,
    tool: 'write_file',
    issues: error.issues.map(issue => ({ path: issue.path.join('.') || 'input', message: issue.message })),
  })
}

function patchFailure(input: {
  toolCallId: string
  path: string
  startedAt: number
  code: 'PATCH_PARSE_ERROR' | 'PATCH_AMBIGUOUS' | 'PATCH_CONTEXT_MISMATCH'
  message: string
}): ToolFailure {
  return createToolFailure({
    toolCallId: input.toolCallId,
    tool: 'apply_patch',
    summary: `未修改 ${input.path}：${input.message}`,
    durationMs: elapsed(input.startedAt),
    code: input.code,
    message: input.message,
    retryable: false,
    recovery: [{ action: 'read_file', path: input.path, reason: '读取当前文件后重新生成完整上下文补丁' }],
  })
}

interface ParsedHunk {
  lines: string[]
}

function parsePatch(path: string, patch: string): ParsedHunk[] {
  const source = patch.replace(/\r\n/g, '\n')
  let lines = source.split('\n')
  if (lines.at(-1) === '') lines = lines.slice(0, -1)
  if (lines[0] === '*** Begin Patch') {
    if (lines.at(-1) !== '*** End Patch') throw new Error('wrapper')
    lines = lines.slice(1, -1)
    const updateLines = lines.filter(line => line.startsWith('*** Update File: '))
    if (updateLines.length !== 1 || updateLines[0] !== `*** Update File: ${path}`) throw new Error('files')
    lines = lines.filter(line => !line.startsWith('*** Update File: '))
    if (lines.some(line => line.startsWith('*** '))) throw new Error('files')
  } else if (lines[0]?.startsWith('--- ') || lines[1]?.startsWith('+++ ')) {
    if (!lines[0]?.startsWith('--- ') || !lines[1]?.startsWith('+++ ')) throw new Error('files')
    lines = lines.slice(2)
  }
  const hunks: ParsedHunk[] = []
  let current: string[] | undefined
  for (const line of lines) {
    if (line.startsWith('@@')) {
      if (current) hunks.push({ lines: current })
      current = []
      continue
    }
    if (!current || !/^[ +\-]/.test(line) || line.length === 0) throw new Error('syntax')
    current.push(line)
  }
  if (current) hunks.push({ lines: current })
  if (hunks.length === 0 || hunks.some(hunk => !hunk.lines.some(line => line.startsWith('+') || line.startsWith('-')))) {
    throw new Error('empty')
  }
  return hunks
}

function splitContent(content: string): { lines: string[]; trailingNewline: boolean } {
  const normalized = content.replace(/\r\n/g, '\n')
  const trailingNewline = normalized.endsWith('\n')
  return { lines: (trailingNewline ? normalized.slice(0, -1) : normalized).split('\n').filter((line, index, all) => !(all.length === 1 && index === 0 && line === '')), trailingNewline }
}

function applyParsedPatch(content: string, hunks: ParsedHunk[]): { content: string; addedLines: number; removedLines: number } {
  const state = splitContent(content)
  const lines = state.lines
  let addedLines = 0
  let removedLines = 0
  for (const hunk of hunks) {
    const before = hunk.lines.filter(line => line.startsWith(' ') || line.startsWith('-')).map(line => line.slice(1))
    const replacement = hunk.lines.filter(line => line.startsWith(' ') || line.startsWith('+')).map(line => line.slice(1))
    const matches: number[] = []
    for (let index = 0; index <= lines.length - before.length; index += 1) {
      if (before.every((line, offset) => lines[index + offset] === line)) matches.push(index)
    }
    if (matches.length === 0) throw Object.assign(new Error('context'), { code: 'PATCH_CONTEXT_MISMATCH' })
    if (matches.length > 1) throw Object.assign(new Error('ambiguous'), { code: 'PATCH_AMBIGUOUS' })
    lines.splice(matches[0], before.length, ...replacement)
    addedLines += hunk.lines.filter(line => line.startsWith('+')).length
    removedLines += hunk.lines.filter(line => line.startsWith('-')).length
  }
  const next = lines.join('\n') + (state.trailingNewline ? '\n' : '')
  return { content: next, addedLines, removedLines }
}

function explicitFailure(input: {
  toolCallId: string
  path: string
  startedAt: number
  code: 'FILE_EXISTS' | 'NOT_FOUND' | 'VERSION_CONFLICT'
  message: string
  details?: Record<string, unknown>
}): ToolFailure {
  return createToolFailure({
    toolCallId: input.toolCallId,
    tool: 'write_file',
    summary: `未写入 ${input.path}：${input.message}`,
    durationMs: elapsed(input.startedAt),
    code: input.code,
    message: input.message,
    retryable: false,
    details: input.details,
    recovery: input.code === 'VERSION_CONFLICT'
      ? [{ action: 'read_file', path: input.path, reason: '读取最新内容和 hash 后重新生成修改' }]
      : [{ action: 'list_files', reason: '确认目标路径和写入模式', path: input.path }],
  })
}

function operationFailure(input: {
  toolCallId: string
  path: string
  startedAt: number
  error: unknown
  publishAttempted: boolean
}): ToolFailure {
  if (input.error instanceof WorkspaceToolScopeError) {
    return createToolFailure({
      toolCallId: input.toolCallId,
      tool: 'write_file',
      summary: `未写入 ${input.path}`,
      durationMs: elapsed(input.startedAt),
      code: input.error.code,
      message: input.error.message,
      retryable: input.error.code === 'CANCELLED',
      recovery: input.error.recovery,
    })
  }
  const code = (input.error as NodeJS.ErrnoException)?.code
  if (code === 'EEXIST') {
    return explicitFailure({ ...input, code: 'FILE_EXISTS', message: '目标文件已存在。' })
  }
  const mapped = code === 'EACCES' || code === 'EPERM'
    ? { code: 'PERMISSION_DENIED' as const, message: '没有权限写入目标路径。', retryable: false }
    : code === 'ENOSPC' || code === 'EDQUOT'
      ? { code: 'STORAGE_FULL' as const, message: '存储空间不足，文件未完成发布。', retryable: true }
      : input.error instanceof DOMException && input.error.name === 'AbortError'
        ? { code: 'CANCELLED' as const, message: '写入已取消。', retryable: true }
        : { code: 'INTERNAL_ERROR' as const, message: '文件写入失败，内部细节已隐藏。', retryable: true }
  return createToolFailure({
    toolCallId: input.toolCallId,
    tool: 'write_file',
    summary: `未确认写入 ${input.path}`,
    durationMs: elapsed(input.startedAt),
    code: mapped.code,
    message: mapped.message,
    retryable: mapped.retryable,
    effects: input.publishAttempted
      ? { kind: 'unknown', description: '发布阶段失败，目标文件可能已经改变。' }
      : { kind: 'none' },
    recovery: [{ action: 'read_file', path: input.path, reason: '读取目标文件以确认当前磁盘状态' }],
  })
}

function throwIfAborted(signal: AbortSignal): void {
  if (signal.aborted) throw new DOMException('The operation was aborted', 'AbortError')
}

export class WorkspaceWriteTools {
  private readonly coordinator: WorkspaceWriteCoordinator
  private readonly fileSystem: WorkspaceWriteFileSystem

  constructor(
    private readonly context: WorkspaceToolContext,
    private readonly grants: GrantConsumer,
    options: WorkspaceWriteToolsOptions = {},
  ) {
    this.coordinator = options.coordinator ?? sharedCoordinator
    this.fileSystem = options.fileSystem ?? nodeWorkspaceWriteFileSystem
  }

  async writeFile(toolCallId: string, input: unknown): Promise<ToolResult> {
    const startedAt = Date.now()
    const parsed = writeFileInputSchema.safeParse(input)
    if (!parsed.success) return invalidFailure(toolCallId, parsed.error)
    try {
      this.grants.consumeGrant({
        chatId: this.context.chatId,
        runId: this.context.runId,
        toolCallId,
        toolName: 'write_file',
        input: parsed.data,
      })
    } catch {
      return createToolFailure({
        toolCallId,
        tool: 'write_file',
        summary: `未写入 ${parsed.data.path}：授权无效`,
        durationMs: elapsed(startedAt),
        code: 'APPROVAL_REQUIRED',
        message: '写入授权不存在、已过期或已使用。',
        retryable: false,
        recovery: [{ action: 'request_approval', path: parsed.data.path, reason: '重新请求本次写入授权' }],
      })
    }
    const coordinationKey = resolve(this.context.rootPath, parsed.data.path)
    return this.coordinator.run(coordinationKey, async () => {
      try {
        return await this.writeLocked(toolCallId, parsed.data, startedAt)
      } catch (error) {
        return operationFailure({ toolCallId, path: parsed.data.path, startedAt, error, publishAttempted: false })
      }
    })
  }

  async applyPatch(toolCallId: string, input: unknown): Promise<ToolResult> {
    const startedAt = Date.now()
    const parsed = applyPatchInputSchema.safeParse(input)
    if (!parsed.success) {
      const failure = createInvalidArgumentFailure({
        toolCallId,
        tool: 'apply_patch',
        issues: parsed.error.issues.map(issue => ({ path: issue.path.join('.') || 'input', message: issue.message })),
      })
      return failure
    }
    try {
      this.grants.consumeGrant({
        chatId: this.context.chatId,
        runId: this.context.runId,
        toolCallId,
        toolName: 'apply_patch',
        input: parsed.data,
      })
    } catch {
      return createToolFailure({
        toolCallId,
        tool: 'apply_patch',
        summary: `未修改 ${parsed.data.path}：授权无效`,
        durationMs: elapsed(startedAt),
        code: 'APPROVAL_REQUIRED',
        message: '写入授权不存在、已过期或已使用。',
        retryable: false,
        recovery: [{ action: 'request_approval', path: parsed.data.path, reason: '重新请求本次补丁授权' }],
      })
    }
    const coordinationKey = resolve(this.context.rootPath, parsed.data.path)
    return this.coordinator.run(coordinationKey, async () => {
      let temporaryPath: string | undefined
      let publishAttempted = false
      try {
        const target = await this.context.scope.resolveWritePath(parsed.data.path)
        if (!target.exists) {
          return createToolFailure({
            toolCallId,
            tool: 'apply_patch',
            summary: `未修改 ${parsed.data.path}：文件不存在`,
            durationMs: elapsed(startedAt),
            code: 'NOT_FOUND',
            message: '补丁目标文件不存在。',
            retryable: false,
            recovery: [{ action: 'list_files', path: parsed.data.path, reason: '确认目标文件路径' }],
          })
        }
        const before = await this.fileSystem.readTarget(target.targetPath, this.context.signal)
        const beforeHash = digest(before)
        if (beforeHash !== parsed.data.expectedHash) {
          return createToolFailure({
            toolCallId,
            tool: 'apply_patch',
            summary: `未修改 ${parsed.data.path}：文件版本冲突`,
            durationMs: elapsed(startedAt),
            code: 'VERSION_CONFLICT',
            message: '当前版本与 expectedHash 不一致，已保留现有文件。',
            retryable: false,
            details: { path: parsed.data.path, expectedHash: parsed.data.expectedHash, actualHash: beforeHash },
            recovery: [{ action: 'read_file', path: parsed.data.path, reason: '读取最新内容后重新生成补丁' }],
          })
        }
        let applied: { content: string; addedLines: number; removedLines: number }
        try {
          applied = applyParsedPatch(before.toString('utf8'), parsePatch(parsed.data.path, parsed.data.patch))
        } catch (error) {
          const code = (error as { code?: string }).code
          if (code === 'PATCH_AMBIGUOUS') {
            return patchFailure({ toolCallId, path: parsed.data.path, startedAt, code, message: '完整上下文匹配到多个位置。' })
          }
          if (code === 'PATCH_CONTEXT_MISMATCH') {
            return patchFailure({ toolCallId, path: parsed.data.path, startedAt, code, message: '完整上下文未匹配当前文件。' })
          }
          return patchFailure({ toolCallId, path: parsed.data.path, startedAt, code: 'PATCH_PARSE_ERROR', message: '补丁格式无效或包含多个文件。' })
        }
        const after = Buffer.from(applied.content, 'utf8')
        const afterHash = digest(after)
        temporaryPath = join(target.parentPath, `.${basename(target.targetPath)}.sailor-${randomUUID()}.tmp`)
        await this.fileSystem.writeTemporaryFile(temporaryPath, after)
        throwIfAborted(this.context.signal)
        const latestHash = digest(await this.fileSystem.readTarget(target.targetPath, this.context.signal))
        if (latestHash !== beforeHash) {
          return createToolFailure({
            toolCallId,
            tool: 'apply_patch',
            summary: `未修改 ${parsed.data.path}：文件版本冲突`,
            durationMs: elapsed(startedAt),
            code: 'VERSION_CONFLICT',
            message: '文件在补丁准备期间发生变化，已保留最新文件。',
            retryable: false,
            details: { path: parsed.data.path, expectedHash: beforeHash, actualHash: latestHash },
            recovery: [{ action: 'read_file', path: parsed.data.path, reason: '读取最新内容后重新生成补丁' }],
          })
        }
        throwIfAborted(this.context.signal)
        publishAttempted = true
        await this.fileSystem.publishOverwrite(temporaryPath, target.targetPath)
        return createToolSuccess({
          toolCallId,
          tool: 'apply_patch',
          summary: `已应用补丁 ${parsed.data.path}`,
          durationMs: elapsed(startedAt),
          effects: { kind: 'applied', description: `已修改 ${parsed.data.path}` },
          data: {
            path: parsed.data.path,
            beforeHash,
            afterHash,
            changes: { addedLines: applied.addedLines, removedLines: applied.removedLines },
            diffRef: { id: `diff-${afterHash.slice(0, 16)}`, kind: 'unified-diff' },
          },
        })
      } catch (error) {
        if (error instanceof WorkspaceToolScopeError) {
          return createToolFailure({
            toolCallId,
            tool: 'apply_patch',
            summary: `未修改 ${parsed.data.path}`,
            durationMs: elapsed(startedAt),
            code: error.code,
            message: error.message,
            retryable: error.code === 'CANCELLED',
            recovery: error.recovery,
          })
        }
        const systemCode = (error as NodeJS.ErrnoException)?.code
        const mapped = systemCode === 'EACCES' || systemCode === 'EPERM'
          ? { code: 'PERMISSION_DENIED' as const, message: '没有权限写入目标路径。', retryable: false }
          : systemCode === 'ENOSPC' || systemCode === 'EDQUOT'
            ? { code: 'STORAGE_FULL' as const, message: '存储空间不足，文件未完成发布。', retryable: true }
            : error instanceof DOMException && error.name === 'AbortError'
              ? { code: 'CANCELLED' as const, message: '补丁应用已取消。', retryable: true }
              : { code: 'INTERNAL_ERROR' as const, message: '补丁应用失败，内部细节已隐藏。', retryable: true }
        return createToolFailure({
          toolCallId,
          tool: 'apply_patch',
          summary: `未确认修改 ${parsed.data.path}`,
          durationMs: elapsed(startedAt),
          code: mapped.code,
          message: mapped.message,
          retryable: mapped.retryable,
          effects: publishAttempted ? { kind: 'unknown', description: '发布阶段失败，目标文件可能已经改变。' } : { kind: 'none' },
          recovery: [{ action: 'read_file', path: parsed.data.path, reason: '读取目标文件以确认当前磁盘状态' }],
        })
      } finally {
        if (temporaryPath) await this.fileSystem.removeTemporary(temporaryPath).catch(() => undefined)
      }
    })
  }

  private async writeLocked(toolCallId: string, input: WriteFileInput, startedAt: number): Promise<ToolResult> {
    const target = await this.context.scope.resolveWritePath(input.path)
    if (input.mode === 'create' && target.exists) {
      return explicitFailure({ toolCallId, path: input.path, startedAt, code: 'FILE_EXISTS', message: '目标文件已存在。' })
    }
    if (input.mode === 'overwrite' && !target.exists) {
      return explicitFailure({ toolCallId, path: input.path, startedAt, code: 'NOT_FOUND', message: '覆盖目标不存在。' })
    }
    const content = Buffer.from(input.content, 'utf8')
    const afterHash = digest(content)
    let beforeHash: string | null = null
    let temporaryPath: string | undefined
    let publishAttempted = false
    try {
      if (input.mode === 'overwrite') {
        beforeHash = digest(await this.fileSystem.readTarget(target.targetPath, this.context.signal))
        if (beforeHash !== input.expectedHash) {
          return explicitFailure({
            toolCallId, path: input.path, startedAt, code: 'VERSION_CONFLICT',
            message: '文件在读取后发生变化，已保留现有文件。',
            details: { path: input.path, expectedHash: input.expectedHash, actualHash: beforeHash },
          })
        }
      }
      temporaryPath = join(target.parentPath, `.${basename(target.targetPath)}.sailor-${randomUUID()}.tmp`)
      await this.fileSystem.writeTemporaryFile(temporaryPath, content)
      throwIfAborted(this.context.signal)
      if (input.mode === 'overwrite') {
        const latestHash = digest(await this.fileSystem.readTarget(target.targetPath, this.context.signal))
        if (latestHash !== beforeHash) {
          return explicitFailure({
            toolCallId, path: input.path, startedAt, code: 'VERSION_CONFLICT',
            message: '文件在写入发布前发生变化，已保留最新文件。',
            details: { path: input.path, expectedHash: beforeHash, actualHash: latestHash },
          })
        }
        throwIfAborted(this.context.signal)
        publishAttempted = true
        await this.fileSystem.publishOverwrite(temporaryPath, target.targetPath)
      } else {
        publishAttempted = true
        await this.fileSystem.publishCreate(temporaryPath, target.targetPath)
      }
      return createToolSuccess({
        toolCallId,
        tool: 'write_file',
        summary: input.mode === 'create' ? `已创建 ${input.path}` : `已覆盖 ${input.path}`,
        durationMs: elapsed(startedAt),
        effects: { kind: 'applied', description: input.mode === 'create' ? `已创建 ${input.path}` : `已覆盖 ${input.path}` },
        data: {
          path: input.path,
          operation: input.mode,
          bytesWritten: content.byteLength,
          beforeHash,
          afterHash,
        },
      })
    } catch (error) {
      return operationFailure({ toolCallId, path: input.path, startedAt, error, publishAttempted })
    } finally {
      if (temporaryPath) await this.fileSystem.removeTemporary(temporaryPath).catch(() => undefined)
    }
  }
}
