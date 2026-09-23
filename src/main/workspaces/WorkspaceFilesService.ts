import { createHash } from 'node:crypto'
import { open, opendir, lstat, stat } from 'node:fs/promises'
import { basename, join, relative, sep } from 'node:path'
import { WorkspaceToolScope, isSensitivePath } from './WorkspaceToolScope.js'
import type {
  WorkspaceFilePreview,
  WorkspaceFileTreeEntry,
  WorkspaceFileTreePage,
} from '../../shared/contracts.js'

const PAGE_SIZE = 200
const MAX_DIRECTORY_SCAN = 5000
const PREVIEW_BYTES = 512 * 1024
const PREVIEW_LINES = 20_000
const MAX_SOURCE_BYTES = 16 * 1024 * 1024

const previewExtensions = new Set([
  'c',
  'cc',
  'cpp',
  'css',
  'csv',
  'go',
  'h',
  'hpp',
  'html',
  'java',
  'js',
  'json',
  'jsx',
  'md',
  'mdx',
  'mjs',
  'py',
  'rs',
  'scss',
  'sh',
  'sql',
  'svg',
  'ts',
  'tsx',
  'txt',
  'xml',
  'yaml',
  'yml',
])

function isPreviewable(name: string): boolean {
  const extension = name.toLowerCase().split('.').pop() ?? ''
  return previewExtensions.has(extension) || !name.includes('.')
}

function toRelative(root: string, path: string): string {
  return relative(root, path).split(sep).join('/')
}

function decodeUtf8(buffer: Buffer): string {
  if (buffer.includes(0))
    throw new Error('该文件是二进制文件，暂不支持文本预览。')
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(buffer)
  } catch {
    throw new Error('该文件不是有效的 UTF-8 文本，暂不支持预览。')
  }
}

function cursorOffset(cursor: string | undefined): number {
  if (!cursor) return 0
  if (!/^\d+$/.test(cursor)) throw new Error('文件列表游标无效。')
  const offset = Number(cursor)
  if (!Number.isSafeInteger(offset) || offset < 0)
    throw new Error('文件列表游标无效。')
  return offset
}

export class WorkspaceFilesService {
  constructor(
    private readonly resolveProjectRoot: (projectId: string) => Promise<string>,
  ) {}

  private async scopeFor(projectId: string): Promise<WorkspaceToolScope> {
    const root = await this.resolveProjectRoot(projectId)
    return WorkspaceToolScope.create(root, new AbortController().signal)
  }

  private async safePath(
    scope: WorkspaceToolScope,
    path: string,
    kind: 'file' | 'directory',
  ) {
    const resolved = await scope.resolvePath(path, kind)
    let current = scope.rootPath
    for (const segment of path.split(/[\\/]+/).filter(Boolean)) {
      current = join(current, segment)
      if ((await lstat(current)).isSymbolicLink())
        throw new Error('符号链接暂不支持读取。')
    }
    return resolved
  }

  async list(
    projectId: string,
    path = '',
    cursor?: string,
  ): Promise<WorkspaceFileTreePage> {
    try {
      return await this.listDirectory(projectId, path, cursor)
    } catch (error) {
      throw this.publicError(error)
    }
  }
  async read(projectId: string, path: string): Promise<WorkspaceFilePreview> {
    try {
      return await this.readFile(projectId, path)
    } catch (error) {
      throw this.publicError(error)
    }
  }
  private publicError(error: unknown): Error {
    if (error && typeof error === 'object' && 'syscall' in error)
      return new Error('文件系统操作失败，请刷新并检查文件是否存在及读取权限。')
    return error instanceof Error ? error : new Error('文件系统操作失败。')
  }

  private async listDirectory(
    projectId: string,
    path = '',
    cursor?: string,
  ): Promise<WorkspaceFileTreePage> {
    const scope = await this.scopeFor(projectId)
    const directory = path
      ? await this.safePath(scope, path, 'directory')
      : scope.rootPath
    const entries = []
    const dir = await opendir(directory)
    for await (const entry of dir) {
      if (entries.length >= MAX_DIRECTORY_SCAN)
        throw new Error('目录超过 5000 项扫描上限，请选择更小的目录。')
      entries.push(entry)
    }
    const visible = entries
      .filter(
        (entry) => !isSensitivePath(entry.name) && !entry.name.includes('\0'),
      )
      .sort((a, b) => a.name.localeCompare(b.name, 'en'))
      .slice(0, MAX_DIRECTORY_SCAN)
    const offset = cursorOffset(cursor)
    const page = visible.slice(offset, offset + PAGE_SIZE)
    const result: WorkspaceFileTreeEntry[] = []
    for (const entry of page) {
      const relativePath = toRelative(
        scope.rootPath,
        join(directory, entry.name),
      )
      try {
        const resolved = await this.safePath(
          scope,
          relativePath,
          entry.isDirectory() ? 'directory' : 'file',
        )
        const metadata = await stat(resolved)
        result.push({
          name: entry.name,
          relativePath,
          kind: entry.isDirectory() ? 'directory' : 'file',
          ...(entry.isFile()
            ? {
                size: metadata.size,
                modifiedAt: metadata.mtimeMs,
                previewable: isPreviewable(entry.name),
              }
            : {}),
        })
      } catch {
        // Invalid symlinks and protected entries are omitted from the browser.
      }
    }
    return {
      entries: result,
      ...(offset + PAGE_SIZE < visible.length
        ? { nextCursor: String(offset + PAGE_SIZE) }
        : {}),
    }
  }

  private async readFile(
    projectId: string,
    path: string,
  ): Promise<WorkspaceFilePreview> {
    const scope = await this.scopeFor(projectId)
    const filePath = await this.safePath(scope, path, 'file')
    const relativePath = toRelative(scope.rootPath, filePath)
    const metadata = await stat(filePath)
    if (metadata.size > MAX_SOURCE_BYTES) {
      throw new Error('文件超过 16 MiB 读取上限，无法预览。')
    }
    const handle = await open(filePath, 'r')
    let source: Buffer
    try {
      const buffer = Buffer.alloc(MAX_SOURCE_BYTES + 1)
      let size = 0
      while (size < buffer.length) {
        const { bytesRead } = await handle.read(
          buffer,
          size,
          buffer.length - size,
          size,
        )
        if (!bytesRead) break
        size += bytesRead
      }
      if (size > MAX_SOURCE_BYTES) throw new Error('文件超过 16 MiB 读取上限。')
      source = buffer.subarray(0, size)
    } finally {
      await handle.close()
    }
    const sha256 = createHash('sha256').update(source).digest('hex')
    if (!isPreviewable(basename(filePath))) {
      return {
        relativePath,
        language: null,
        content: '',
        lineCount: 0,
        byteLength: source.byteLength,
        sha256,
        truncated: false,
        previewable: false,
        reason: '该文件类型暂不支持文本预览。',
      }
    }
    let decoded: string
    try {
      decoded = decodeUtf8(source).replace(/\r\n?/g, '\n')
    } catch (error) {
      return {
        relativePath,
        language: null,
        content: '',
        lineCount: 0,
        byteLength: source.byteLength,
        sha256,
        truncated: false,
        previewable: false,
        reason: error instanceof Error ? error.message : '该文件暂不支持预览。',
      }
    }
    const lines = decoded.split('\n')
    const byLines = lines.length > PREVIEW_LINES
    const limitedLines = lines.slice(0, PREVIEW_LINES)
    let content = limitedLines.join('\n')
    const byBytes = Buffer.byteLength(content, 'utf8') > PREVIEW_BYTES
    if (byBytes)
      content = new TextDecoder('utf-8', { fatal: true }).decode(
        Buffer.from(content, 'utf8').subarray(0, PREVIEW_BYTES),
        { stream: true },
      )
    return {
      relativePath,
      language: basename(filePath).split('.').pop()?.toLowerCase() ?? null,
      content,
      lineCount: lines.length,
      byteLength: source.byteLength,
      sha256,
      truncated: byLines || byBytes,
      previewable: true,
    }
  }
}
