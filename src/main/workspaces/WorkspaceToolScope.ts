import { lstat, realpath, stat } from 'node:fs/promises'
import { dirname, isAbsolute, relative, resolve, sep } from 'node:path'
import type { ToolErrorCode, ToolRecoveryAction } from '../../shared/toolFeedback.js'

export type WorkspacePathKind = 'any' | 'file' | 'directory'

export class WorkspaceToolScopeError extends Error {
  readonly code: ToolErrorCode
  readonly recovery: ToolRecoveryAction[]

  constructor(code: ToolErrorCode, message: string, recovery: ToolRecoveryAction[]) {
    super(message)
    this.name = 'WorkspaceToolScopeError'
    this.code = code
    this.recovery = recovery
  }
}

function scopeError(code: ToolErrorCode, message: string, reason: string): WorkspaceToolScopeError {
  return new WorkspaceToolScopeError(code, message, [{ action: 'ask_user', reason }])
}

function throwIfAborted(signal: AbortSignal): void {
  if (signal.aborted) {
    throw scopeError('CANCELLED', '工具调用已取消。', '如仍需读取，请重新发起请求')
  }
}

function isOutside(rootPath: string, candidate: string): boolean {
  const fromRoot = relative(rootPath, candidate)
  return fromRoot === '..' || fromRoot.startsWith(`..${process.platform === 'win32' ? '\\' : '/'}`) || isAbsolute(fromRoot)
}

export function isSensitivePath(path: string): boolean {
  const segments = path.split(/[\\/]+/).filter(Boolean)
  const name = segments.at(-1)?.toLowerCase() ?? ''
  return segments.some(segment => ['.git', '.ssh'].includes(segment.toLowerCase()))
    || name === '.env'
    || name.startsWith('.env.')
    || ['id_rsa', 'id_ed25519', '.npmrc', '.pypirc'].includes(name)
    || name.endsWith('.pem')
    || name.endsWith('.key')
}

function mapPathError(error: unknown, path: string): WorkspaceToolScopeError {
  const code = (error as NodeJS.ErrnoException)?.code
  if (code === 'ENOENT' || code === 'ENOTDIR') {
    return new WorkspaceToolScopeError('NOT_FOUND', `路径不存在：${path}`, [
      { action: 'list_files', reason: '列出父目录以确认路径' },
    ])
  }
  if (code === 'EACCES' || code === 'EPERM') {
    return scopeError('PERMISSION_DENIED', `没有权限读取路径：${path}`, '请检查文件权限或选择其他路径')
  }
  return scopeError('INTERNAL_ERROR', '路径解析失败，内部细节已隐藏。', '请检查工作区状态后重试')
}

export class WorkspaceToolScope {
  private constructor(readonly rootPath: string, private readonly signal: AbortSignal) {}

  static async create(rootPath: string, signal: AbortSignal): Promise<WorkspaceToolScope> {
    throwIfAborted(signal)
    try {
      const canonicalRoot = await realpath(rootPath)
      throwIfAborted(signal)
      if (!(await stat(canonicalRoot)).isDirectory()) throw new Error('not-directory')
      return new WorkspaceToolScope(canonicalRoot, signal)
    } catch (error) {
      if (error instanceof WorkspaceToolScopeError) throw error
      throw scopeError('WORKSPACE_UNAVAILABLE', '工作区目录不存在或无法访问。', '请重新选择有效的工作区目录')
    }
  }

  async resolvePath(input: string, kind: WorkspacePathKind = 'any'): Promise<string> {
    throwIfAborted(this.signal)
    const lexicalPath = this.resolveLexicalPath(input)
    let canonicalPath: string
    try {
      canonicalPath = await realpath(lexicalPath)
    } catch (error) {
      throw mapPathError(error, input)
    }
    throwIfAborted(this.signal)
    if (isOutside(this.rootPath, canonicalPath)) {
      throw scopeError('OUTSIDE_WORKSPACE', '符号链接目标位于工作区之外，已拒绝读取。', '请选择工作区内的真实路径')
    }
    let metadata
    try {
      metadata = await stat(canonicalPath)
    } catch (error) {
      throw mapPathError(error, input)
    }
    if (kind === 'file' && !metadata.isFile()) {
      throw scopeError('NOT_A_FILE', `路径不是文件：${input}`, '请选择一个文件路径')
    }
    if (kind === 'directory' && !metadata.isDirectory()) {
      throw scopeError('NOT_A_DIRECTORY', `路径不是目录：${input}`, '请选择一个目录路径')
    }
    return canonicalPath
  }

  async resolveWritePath(input: string): Promise<{
    targetPath: string
    parentPath: string
    relativePath: string
    exists: boolean
  }> {
    throwIfAborted(this.signal)
    const targetPath = this.resolveLexicalPath(input)
    let parentPath: string
    try {
      parentPath = await realpath(dirname(targetPath))
    } catch (error) {
      const code = (error as NodeJS.ErrnoException)?.code
      if (code === 'ENOENT' || code === 'ENOTDIR') {
        throw new WorkspaceToolScopeError('PARENT_NOT_FOUND', `父目录不存在：${input}`, [
          { action: 'list_files', reason: '确认目标文件的父目录已经存在' },
        ])
      }
      throw mapPathError(error, input)
    }
    throwIfAborted(this.signal)
    if (isOutside(this.rootPath, parentPath)) {
      throw scopeError('OUTSIDE_WORKSPACE', '目标父目录位于工作区之外，已拒绝写入。', '请选择工作区内的路径')
    }
    if (!(await stat(parentPath)).isDirectory()) {
      throw scopeError('NOT_A_DIRECTORY', `父路径不是目录：${input}`, '请选择有效的父目录')
    }
    let exists = false
    try {
      const metadata = await lstat(targetPath)
      exists = true
      if (metadata.isSymbolicLink()) {
        throw scopeError('OUTSIDE_WORKSPACE', '写入目标不能是符号链接。', '请选择工作区内的普通文件')
      }
      if (!metadata.isFile()) {
        throw scopeError('NOT_A_FILE', `路径不是文件：${input}`, '请选择一个文件路径')
      }
      if (isOutside(this.rootPath, await realpath(targetPath))) {
        throw scopeError('OUTSIDE_WORKSPACE', '目标文件位于工作区之外，已拒绝写入。', '请选择工作区内的普通文件')
      }
    } catch (error) {
      if ((error as NodeJS.ErrnoException)?.code !== 'ENOENT') throw error
    }
    throwIfAborted(this.signal)
    return {
      targetPath,
      parentPath,
      relativePath: relative(this.rootPath, targetPath).split(sep).join('/'),
      exists,
    }
  }

  private resolveLexicalPath(input: string): string {
    if (!input || input.includes('\0') || isAbsolute(input) || /^[A-Za-z]:[\\/]/.test(input)) {
      throw scopeError('INVALID_ARGUMENT', '路径必须是工作区内的非空相对路径。', '请提供工作区相对路径')
    }
    const segments = input.split(/[\\/]+/)
    if (segments.includes('..')) {
      throw scopeError('OUTSIDE_WORKSPACE', '路径不能离开工作区。', '请提供工作区内的路径')
    }
    if (isSensitivePath(input)) {
      throw scopeError('SENSITIVE_PATH', '该路径可能包含敏感凭据，已拒绝读取。', '请选择不含凭据或密钥的文件')
    }

    const lexicalPath = resolve(this.rootPath, input)
    if (isOutside(this.rootPath, lexicalPath)) {
      throw scopeError('OUTSIDE_WORKSPACE', '路径不能离开工作区。', '请提供工作区内的路径')
    }
    return lexicalPath
  }
}

export interface WorkspaceToolContext {
  chatId: string
  runId: string
  rootPath: string
  scope: WorkspaceToolScope
  signal: AbortSignal
}
