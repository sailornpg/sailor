import { createHash, randomUUID } from 'node:crypto'
import { lstat, mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises'
import { join, resolve, sep } from 'node:path'
import { diffLines } from 'diff'
import type {
  ChatFileChangeSummary,
  DiffLine,
  FileChange,
  FileChangeState,
} from '../../../shared/fileReview.js'

const VERSION = 1
const MAX_SNAPSHOT_BYTES = 512 * 1024
const MAX_RECORDS = 500
const MAX_JOURNAL_BYTES = 8 * 1024 * 1024
const MAX_RETURN_LINES = 2_000

type Snapshot = {
  hash: string
  text?: string
  lineable: boolean
  existed: boolean
}

export interface FileChangeRecord {
  id: string
  chatId: string
  turnId?: string
  runId: string
  path: string
  before: Snapshot
  after: Snapshot
  at: number
  discontinuous?: boolean
}

interface PersistedJournal {
  version: 1
  chatId: string
  records: FileChangeRecord[]
  hasUntrackedHostExec?: boolean
}

function hash(content: Uint8Array): string {
  return createHash('sha256').update(content).digest('hex')
}

function safeChatKey(chatId: string): string {
  return createHash('sha256').update(chatId).digest('hex')
}

function normalizedPath(path: string): string {
  const value = path.replaceAll('\\', '/').replace(/^\/+/, '')
  if (!value || value === '.' || value.split('/').some((part) => part === '..' || part === ''))
    throw new Error('文件变更路径无效。')
  return value
}

async function snapshot(root: string, path: string): Promise<Snapshot> {
  const relativePath = normalizedPath(path)
  const absolute = resolve(root, relativePath)
  const canonicalRoot = resolve(root) + sep
  if (!absolute.startsWith(canonicalRoot)) throw new Error('文件变更路径越界。')
  try {
    let current = resolve(root)
    for (const segment of relativePath.split('/')) {
      current = join(current, segment)
      if ((await lstat(current)).isSymbolicLink()) throw new Error('符号链接文件不进入变更日志。')
    }
    const content = await readFile(absolute)
    const digest = hash(content)
    if (content.byteLength > MAX_SNAPSHOT_BYTES || content.includes(0))
      return { hash: digest, lineable: false, existed: true }
    try {
      return {
        hash: digest,
        text: new TextDecoder('utf-8', { fatal: true }).decode(content),
        lineable: true,
        existed: true,
      }
    } catch (error) {
      if (error instanceof TypeError) return { hash: digest, lineable: false, existed: true }
      throw error
    }
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT')
      return { hash: hash(new Uint8Array()), lineable: true, text: '', existed: false }
    throw error
  }
}

function diff(
  before: Snapshot,
  after: Snapshot,
): { lines: DiffLine[]; added: number; removed: number; truncated: boolean } {
  if (!before.lineable || !after.lineable || before.text === undefined || after.text === undefined)
    return { lines: [], added: 0, removed: 0, truncated: true }
  const chunks = diffLines(before.text, after.text, { maxEditLength: 2_000, timeout: 50 })
  if (!chunks) return { lines: [], added: 0, removed: 0, truncated: true }
  const result: DiffLine[] = []
  let added = 0
  let removed = 0
  for (const chunk of chunks) {
    const kind = chunk.added ? 'added' : chunk.removed ? 'removed' : 'context'
    const rows = chunk.value.replace(/\r\n/g, '\n').split('\n')
    if (rows.at(-1) === '') rows.pop()
    for (const text of rows) {
      if (kind === 'added') added++
      if (kind === 'removed') removed++
      if (result.length < MAX_RETURN_LINES) result.push({ kind, text })
    }
  }
  const clipped = chunks.reduce((sum, chunk) => sum + chunk.count, 0) > MAX_RETURN_LINES
  return {
    lines: result,
    added,
    removed,
    truncated: clipped,
  }
}

export class ChatFileChangeJournal {
  private readonly pending = new Map<string, Promise<void>>()
  private readonly failedChats = new Set<string>()

  constructor(
    private readonly directory: string,
    readonly workspaceRoot?: string,
    private readonly changed: (chatId: string) => void = () => {},
  ) {}

  async record(
    chatId: string,
    turnId: string,
    runId: string,
    path: string,
    before: Snapshot,
    after: Snapshot,
  ): Promise<void> {
    if (before.hash === after.hash && before.existed === after.existed) return
    const safePath = normalizedPath(path)
    try {
      await this.enqueue(chatId, async () => {
        const current = await this.load(chatId)
        const previous = [...current.records].reverse().find((record) => record.path === safePath)
        const discontinuous =
          previous !== undefined &&
          (previous.after.hash !== before.hash || previous.after.existed !== before.existed)
        current.records.push({
          id: randomUUID(),
          chatId,
          turnId,
          runId,
          path: safePath,
          before,
          after,
          at: Date.now(),
          ...(discontinuous ? { discontinuous: true } : {}),
        })
        if (current.records.length > MAX_RECORDS)
          current.records.splice(0, current.records.length - MAX_RECORDS)
        await this.save(current)
        this.changed(chatId)
      })
    } catch {
      this.failedChats.add(chatId)
      this.changed(chatId)
    }
  }

  async markHostExec(chatId: string): Promise<void> {
    try {
      await this.enqueue(chatId, async () => {
        const current = await this.load(chatId)
        current.hasUntrackedHostExec = true
        await this.save(current)
        this.changed(chatId)
      })
    } catch {
      this.failedChats.add(chatId)
      this.changed(chatId)
    }
  }

  async getRecords(chatId: string): Promise<readonly FileChangeRecord[]> {
    return (await this.load(chatId)).records
  }

  async getChanges(chatId: string): Promise<ChatFileChangeSummary> {
    let journal: PersistedJournal
    try {
      journal = await this.load(chatId)
    } catch (error) {
      if (!this.failedChats.has(chatId)) throw error
      journal = { version: VERSION, chatId, records: [] }
    }
    return this.summarize(chatId, journal.records, journal)
  }

  async getTurnChanges(chatId: string, turnId: string): Promise<ChatFileChangeSummary> {
    let journal: PersistedJournal
    try {
      journal = await this.load(chatId)
    } catch (error) {
      if (!this.failedChats.has(chatId)) throw error
      journal = { version: VERSION, chatId, records: [] }
    }
    return this.summarize(
      chatId,
      journal.records.filter((record) => (record.turnId ?? record.runId) === turnId),
      journal,
      turnId,
    )
  }

  private async summarize(
    chatId: string,
    records: readonly FileChangeRecord[],
    journal: PersistedJournal,
    turnId?: string,
  ): Promise<ChatFileChangeSummary> {
    const first = new Map<string, FileChangeRecord>()
    const latest = new Map<string, FileChangeRecord>()
    const discontinuousPaths = new Set<string>()
    for (const record of records) {
      if (record.discontinuous) {
        first.set(record.path, record)
        discontinuousPaths.add(record.path)
      } else first.set(record.path, first.get(record.path) ?? record)
      latest.set(record.path, record)
    }
    const changes: FileChange[] = []
    for (const [path, record] of first) {
      const tail = latest.get(path)!
      if (record.before.hash === tail.after.hash && record.before.existed === tail.after.existed)
        continue
      const calculated = diff(record.before, tail.after)
      const state = await this.currentState(
        path,
        tail.after.hash,
        tail.after.existed,
        discontinuousPaths.has(path),
      )
      changes.push({
        id: tail.id,
        chatId,
        turnId: record.turnId ?? record.runId,
        runId: tail.runId,
        path,
        kind: !record.before.existed ? 'added' : !tail.after.existed ? 'deleted' : 'modified',
        beforeHash: record.before.existed ? record.before.hash : null,
        afterHash: tail.after.existed ? tail.after.hash : null,
        state,
        addedLines:
          calculated.truncated || !record.before.lineable || !tail.after.lineable
            ? null
            : calculated.added,
        removedLines:
          calculated.truncated || !record.before.lineable || !tail.after.lineable
            ? null
            : calculated.removed,
        lines: calculated.lines,
        truncated: calculated.truncated || !record.before.lineable || !tail.after.lineable,
      })
    }
    const known = changes.filter(
      (change) => change.addedLines !== null && change.removedLines !== null,
    )
    const complete = known.length === changes.length && discontinuousPaths.size === 0
    return {
      chatId,
      ...(turnId ? { turnId } : {}),
      fileCount: changes.length,
      addedLines: complete ? known.reduce((sum, change) => sum + change.addedLines!, 0) : null,
      removedLines: complete ? known.reduce((sum, change) => sum + change.removedLines!, 0) : null,
      hasUntrackedHostExec: currentHasHostExec(journal),
      hasTrackingError: this.failedChats.has(chatId),
      hasIncompleteDiff:
        this.failedChats.has(chatId) ||
        discontinuousPaths.size > 0 ||
        changes.some((change) => change.truncated || change.state === 'unavailable'),
      changes,
    }
  }

  async delete(chatId: string): Promise<void> {
    await rm(this.path(chatId), { force: true })
  }

  private async currentState(
    path: string,
    expectedHash: string,
    expectedExisted: boolean,
    discontinuous: boolean,
  ): Promise<FileChangeState> {
    if (!this.workspaceRoot) return discontinuous ? 'stale' : 'current'
    try {
      const current = await snapshot(this.workspaceRoot, path)
      return current.hash === expectedHash && current.existed === expectedExisted
        ? discontinuous
          ? 'stale'
          : 'current'
        : 'stale'
    } catch {
      return 'unavailable'
    }
  }

  private path(chatId: string): string {
    return join(this.directory, `${safeChatKey(chatId)}.json`)
  }

  private async enqueue(chatId: string, work: () => Promise<void>): Promise<void> {
    const previous = this.pending.get(chatId) ?? Promise.resolve()
    const next = previous.catch(() => {}).then(work)
    this.pending.set(chatId, next)
    try {
      await next
    } finally {
      if (this.pending.get(chatId) === next) this.pending.delete(chatId)
    }
  }

  private async load(chatId: string): Promise<PersistedJournal> {
    try {
      const content = await readFile(this.path(chatId), 'utf8')
      const parsed = JSON.parse(content) as PersistedJournal
      if (parsed.version !== VERSION || parsed.chatId !== chatId || !Array.isArray(parsed.records))
        throw new Error('变更日志格式无效。')
      return parsed
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT')
        return { version: VERSION, chatId, records: [] }
      throw error
    }
  }

  private async save(value: PersistedJournal): Promise<void> {
    await mkdir(this.directory, { recursive: true, mode: 0o700 })
    const target = this.path(value.chatId)
    const temporary = `${target}.${randomUUID()}.tmp`
    let content = JSON.stringify(value)
    while (Buffer.byteLength(content) > MAX_JOURNAL_BYTES && value.records.length > 1) {
      value.records.shift()
      content = JSON.stringify(value)
    }
    try {
      await writeFile(temporary, content, { mode: 0o600 })
      await rename(temporary, target)
    } finally {
      await rm(temporary, { force: true }).catch(() => {})
    }
  }
}

function currentHasHostExec(journal: PersistedJournal): boolean {
  return journal.hasUntrackedHostExec === true
}

export interface FileChangeTracker {
  before(paths: readonly string[]): Promise<Map<string, Snapshot>>
  after(paths: readonly string[], before: Map<string, Snapshot>): Promise<void>
}

export function createFileChangeTracker(
  journal: ChatFileChangeJournal,
  chatId: string,
  turnIdOrRunId: string,
  runId = turnIdOrRunId,
): FileChangeTracker {
  const workspaceRoot = journal.workspaceRoot
  if (!workspaceRoot) throw new Error('文件变更 tracker 缺少工作区根目录。')
  return {
    async before(paths) {
      const snapshots = new Map<string, Snapshot>()
      for (const path of paths)
        snapshots.set(normalizedPath(path), await snapshot(workspaceRoot!, path))
      return snapshots
    },
    async after(paths, before) {
      for (const path of paths) {
        const safePath = normalizedPath(path)
        const previous = before.get(safePath) ?? (await snapshot(workspaceRoot!, safePath))
        const next = await snapshot(workspaceRoot!, safePath)
        await journal.record(chatId, turnIdOrRunId, runId, safePath, previous, next)
      }
    },
  }
}
