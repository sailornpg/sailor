import { createWorkspaceFileSystem } from './WorkspaceFileSystem.js'
import { ChatFileChangeJournal, createFileChangeTracker } from './ChatFileChangeJournal.js'
import { createHash, randomUUID } from 'node:crypto'
import { mkdir, open, readFile, readdir, rename, rm, stat } from 'node:fs/promises'
import { join, posix } from 'node:path'
import { defineCommand, InMemoryFs, MountableFs, Sandbox } from 'just-bash'
import { createJustBashSandbox } from '@ai-sdk/sandbox-just-bash'
import type { HarnessAgentResumeSessionState, HarnessAgentSkill } from '@ai-sdk/harness/agent'
import type { HarnessV1NetworkSandboxSession } from '@ai-sdk/harness'
import { parseDocument } from 'yaml'
import { z } from 'zod'
import type { WorkspaceToolScope } from '../../workspaces/WorkspaceToolScope.js'

const MAX_STATE_BYTES = 32 * 1024 * 1024
const stateSchema = z.object({
  version: z.literal(1),
  resume: z
    .object({
      type: z.literal('resume-session'),
      harnessId: z.literal('pi'),
      specificationVersion: z.literal('harness-v1'),
      data: z.unknown(),
    })
    .passthrough(),
  files: z.record(z.string(), z.string()),
})
export interface PiLocalState {
  fs: InMemoryFs
  sandbox: HarnessV1NetworkSandboxSession
  resume?: HarnessAgentResumeSessionState
}

export class PiStorage {
  private readonly fileChangeJournals = new Map<string, ChatFileChangeJournal>()

  constructor(
    private readonly directory: string,
    private readonly onFileChange: (chatId: string) => void = () => {},
  ) {}
  async fork(parentChatId: string, sideChatId: string): Promise<boolean> {
    let saved: z.infer<typeof stateSchema>
    try {
      const source = this.path(parentChatId)
      if ((await stat(source)).size > MAX_STATE_BYTES)
        throw new Error('Pi 会话状态超过 32 MiB 上限。')
      saved = stateSchema.parse(JSON.parse(await readFile(source, 'utf8')))
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return false
      throw new Error('主会话 Pi 状态无法复制，未创建侧聊。', { cause: error })
    }
    const sessionFileName =
      saved.resume.data &&
      typeof saved.resume.data === 'object' &&
      'sessionFileName' in saved.resume.data
        ? saved.resume.data.sessionFileName
        : undefined
    if (
      typeof sessionFileName !== 'string' ||
      !/^[A-Za-z0-9][A-Za-z0-9._-]*\.jsonl?$/.test(sessionFileName)
    )
      throw new Error('主会话 Pi 状态缺少有效的原生会话文件，未创建侧聊。')
    const sourcePrefix = this.sessionDirectory(parentChatId)
    const targetPrefix = this.sessionDirectory(sideChatId)
    const files: Record<string, string> = {}
    for (const [path, content] of Object.entries(saved.files)) {
      if (!path.startsWith(`${sourcePrefix}/`))
        throw new Error('主会话 Pi 状态路径无效，未创建侧聊。')
      files[`${targetPrefix}/${path.slice(sourcePrefix.length + 1)}`] = content
    }
    if (!files[`${targetPrefix}/${sessionFileName}`])
      throw new Error('主会话 Pi 原生会话文件缺失，未创建侧聊。')
    const content = JSON.stringify({ ...saved, files })
    if (Buffer.byteLength(content) > MAX_STATE_BYTES)
      throw new Error('侧聊 Pi 状态超过 32 MiB 上限。')
    await mkdir(this.directory, { recursive: true, mode: 0o700 })
    const target = this.path(sideChatId)
    const file = await open(target, 'wx', 0o600)
    try {
      await file.writeFile(content)
      await file.sync()
    } catch (error) {
      await rm(target, { force: true })
      throw error
    } finally {
      await file.close()
    }
    return true
  }
  async delete(chatId: string): Promise<void> {
    await rm(this.path(chatId), { force: true })
    await new ChatFileChangeJournal(this.changeDirectory()).delete(chatId)
    this.fileChangeJournals.delete(chatId)
  }
  private path(chatId: string) {
    return join(this.directory, `${createHash('sha256').update(chatId).digest('hex')}.json`)
  }
  private sessionDirectory(chatId: string): string {
    const sessionId = `sailor-${createHash('sha256').update(chatId).digest('hex')}`
    const key = createHash('sha256').update(sessionId).digest('hex')
    return `/home/sailor/.ai-sdk/harness-pi/${key}`
  }

  private changeDirectory(): string {
    return join(this.directory, 'file-changes')
  }

  fileChanges(chatId: string, workspaceRoot?: string): ChatFileChangeJournal {
    const existing = this.fileChangeJournals.get(chatId)
    if (existing) {
      if (workspaceRoot && existing.workspaceRoot !== workspaceRoot)
        throw new Error('会话文件变更的工作区根目录不一致。')
      return existing
    }
    const journal = new ChatFileChangeJournal(
      this.changeDirectory(),
      workspaceRoot,
      this.onFileChange,
    )
    this.fileChangeJournals.set(chatId, journal)
    return journal
  }

  async open(
    chatId: string,
    workspaceRoot?: string,
    runId = 'unknown',
    turnId = runId,
  ): Promise<PiLocalState> {
    let saved: z.infer<typeof stateSchema> | undefined
    try {
      const path = this.path(chatId)
      if ((await stat(path)).size > MAX_STATE_BYTES)
        throw new Error('Pi 会话状态超过 32 MiB 上限。')
      saved = stateSchema.parse(JSON.parse(await readFile(path, 'utf8')))
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT')
        throw new Error('Pi 会话状态无法读取，原文件已保留。', {
          cause: error,
        })
    }
    const fs = new InMemoryFs()
    await fs.mkdir('/home/sailor', { recursive: true })
    for (const [path, content] of Object.entries(saved?.files ?? {})) {
      if (!path.startsWith('/home/sailor/.ai-sdk/') || posix.normalize(path) !== path)
        throw new Error('Pi 会话状态路径无效。')
      await fs.mkdir(posix.dirname(path), { recursive: true })
      await fs.writeFile(path, Buffer.from(content, 'base64'))
    }
    const mounted = new MountableFs({ base: fs })
    if (workspaceRoot) {
      const journal = this.fileChanges(chatId, workspaceRoot)
      mounted.mount(
        '/home/sailor/workspace',
        createWorkspaceFileSystem(workspaceRoot, {
          tracker: createFileChangeTracker(journal, chatId, turnId, runId),
        }),
      )
    }
    const virtual = await Sandbox.create({
      fs: mounted,
      cwd: '/home/sailor',
      env: { HOME: '/home/sailor' },
    })
    // Pi's read tool needs realpath; just-bash 2.x does not register it.
    // Resolve exclusively against the virtual filesystem, never node:fs.
    virtual.bashEnvInstance.registerCommand(
      defineCommand('realpath', async (args, context) => {
        if (args.length !== 1)
          return {
            stdout: '',
            stderr: 'realpath requires one path',
            exitCode: 1,
          }
        try {
          return {
            stdout: `${await context.fs.realpath(posix.resolve(context.cwd, args[0]))}\n`,
            stderr: '',
            exitCode: 0,
          }
        } catch {
          return {
            stdout: '',
            stderr: 'virtual path unavailable',
            exitCode: 1,
          }
        }
      }),
    )
    const sandbox = await createJustBashSandbox({
      sandbox: virtual,
    }).createSession()
    return {
      fs,
      sandbox,
      resume: saved?.resume as HarnessAgentResumeSessionState | undefined,
    }
  }

  async save(
    chatId: string,
    state: PiLocalState,
    resume: HarnessAgentResumeSessionState,
  ): Promise<void> {
    const files: Record<string, string> = {}
    let bytes = 0
    for (const path of state.fs.getAllPaths()) {
      if (!path.startsWith('/home/sailor/.ai-sdk/') || !(await state.fs.stat(path)).isFile) continue
      const content = await state.fs.readFileBuffer(path)
      bytes += content.byteLength
      if (bytes > MAX_STATE_BYTES / 2) throw new Error('Pi 会话状态过大，请新建会话。')
      files[path] = Buffer.from(content).toString('base64')
    }
    const content = JSON.stringify({ version: 1, resume, files })
    const nativeName =
      resume.data && typeof resume.data === 'object' && 'sessionFileName' in resume.data
        ? resume.data.sessionFileName
        : undefined
    if (
      typeof nativeName === 'string' &&
      !Object.keys(files).some((path) => posix.basename(path) === nativeName)
    ) {
      throw new Error('Pi 原生会话未能保存，请重试；不会用空会话覆盖已有记录。')
    }
    if (Buffer.byteLength(content) > MAX_STATE_BYTES)
      throw new Error('Pi 会话状态过大，请新建会话。')
    await mkdir(this.directory, { recursive: true, mode: 0o700 })
    const target = this.path(chatId)
    const temporary = `${target}.${randomUUID()}.tmp`
    try {
      const file = await open(temporary, 'wx', 0o600)
      try {
        await file.writeFile(content)
        await file.sync()
      } finally {
        await file.close()
      }
      await rename(temporary, target)
    } finally {
      await rm(temporary, { force: true })
    }
    state.resume = resume
  }
}

// Only bounded, validated text is copied. No host config or extension discovery.
export async function loadPiSkills(scope: WorkspaceToolScope): Promise<HarnessAgentSkill[]> {
  const skills: HarnessAgentSkill[] = []
  let totalBytes = 0
  for (const base of ['.agents/skills', '.pi/skills']) {
    let directory: string
    try {
      directory = await scope.resolvePath(base, 'directory')
    } catch {
      continue
    }
    const entries = await readdir(directory, { withFileTypes: true })
    for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
      if (!entry.isDirectory() || skills.length >= 32) continue
      const root = `${base}/${entry.name}`
      const files: { path: string; content: string }[] = []
      const visit = async (relative: string, depth: number): Promise<void> => {
        if (depth > 4 || files.length >= 64 || totalBytes >= 1024 * 1024) return
        const directory = await scope.resolvePath(
          relative ? `${root}/${relative}` : root,
          'directory',
        )
        for (const child of (await readdir(directory, { withFileTypes: true })).sort((a, b) =>
          a.name.localeCompare(b.name),
        )) {
          const path = relative ? `${relative}/${child.name}` : child.name
          if (child.isSymbolicLink()) continue
          if (child.isDirectory()) {
            await visit(path, depth + 1)
            continue
          }
          if (!child.isFile() || files.length >= 64) continue
          try {
            const real = await scope.resolvePath(`${root}/${path}`, 'file')
            const size = (await stat(real)).size
            if (size > 64 * 1024 || totalBytes + size > 1024 * 1024) continue
            const content = await readFile(real, 'utf8')
            if (content.includes('\0') || content.includes('\uFFFD')) continue
            totalBytes += Buffer.byteLength(content)
            files.push({ path, content })
          } catch {
            /* Unreadable and sensitive attachments are not exposed. */
          }
        }
      }
      await visit('', 0)
      const skill = files.find((file) => file.path === 'SKILL.md')
      if (!skill) continue
      const lines = skill.content.split(/\r?\n/)
      const end = lines.findIndex((line, index) => index > 0 && line === '---')
      if (lines[0] !== '---' || end < 0) continue
      const document = parseDocument(lines.slice(1, end).join('\n'))
      if (document.errors.length) continue
      let metadata: unknown
      try {
        metadata = document.toJS({ maxAliasCount: 20 })
      } catch {
        continue
      }
      const parsed = z
        .object({
          name: z
            .string()
            .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
            .max(64),
          description: z.string().min(1).max(1024),
        })
        .safeParse(metadata)
      if (!parsed.success || skills.some((item) => item.name === parsed.data.name)) continue
      skills.push({
        ...parsed.data,
        content: lines.slice(end + 1).join('\n'),
        files: files.filter((file) => file.path !== 'SKILL.md'),
      })
    }
  }
  return skills
}
