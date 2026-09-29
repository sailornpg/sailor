import assert from 'node:assert/strict'
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import { createServer } from 'vite'

test('只按 chatId 解析项目并返回摘要和指定 diff，拒绝跨会话 changeId', async (t) => {
  const root = await mkdtemp(join(tmpdir(), 'sailor-file-review-ipc-'))
  const project = join(root, 'project')
  await mkdir(project)
  await writeFile(join(project, 'app.ts'), 'const answer = 1\n')
  t.after(() => rm(root, { recursive: true, force: true }))

  const vite = await createServer({ logLevel: 'silent', server: { middlewareMode: true } })
  t.after(() => vite.close())
  const journalModule = await vite.ssrLoadModule('/src/main/agent/pi/ChatFileChangeJournal.ts')
  const serviceModule = await vite.ssrLoadModule('/src/main/workspaces/ChatFileReviewService.ts')
  const journal = new journalModule.ChatFileChangeJournal(join(root, 'changes'), project)
  const tracker = journalModule.createFileChangeTracker(journal, 'chat-1', 'run-1')
  const before = await tracker.before(['app.ts'])
  await writeFile(join(project, 'app.ts'), 'const answer = 2\n')
  await tracker.after(['app.ts'], before)

  const service = new serviceModule.ChatFileReviewService({
    resolveChat: async (chatId: string) => {
      if (chatId !== 'chat-1') throw new Error('会话不存在。')
      return { projectId: 'project-1' }
    },
    resolveProjectRoot: async (projectId: string) => {
      if (projectId !== 'project-1') throw new Error('工作区不存在。')
      return project
    },
    journal: (chatId: string, workspaceRoot: string) =>
      new journalModule.ChatFileChangeJournal(join(root, 'changes'), workspaceRoot),
  })
  const summary = await service.summary('chat-1')
  assert.equal(summary.fileCount, 1)
  assert.equal(summary.changes[0]?.path, 'app.ts')
  assert.deepEqual(summary.changes[0]?.lines, [], 'summary IPC must not carry diff bodies')
  const detail = await service.detail('chat-1', summary.changes[0]!.id)
  assert.ok(detail.lines.length > 0)
  assert.equal(detail.id, summary.changes[0]?.id)
  await assert.rejects(() => service.detail('chat-2', summary.changes[0]!.id), /会话不存在/)
  await assert.rejects(() => service.detail('chat-1', 'wrong-change'), /变更不存在/)
})

test('host_exec 标记只反映真实执行，且不会伪造文件计数', async (t) => {
  const root = await mkdtemp(join(tmpdir(), 'sailor-file-review-host-'))
  const project = join(root, 'project')
  await mkdir(project)
  t.after(() => rm(root, { recursive: true, force: true }))
  const vite = await createServer({ logLevel: 'silent', server: { middlewareMode: true } })
  t.after(() => vite.close())
  const journalModule = await vite.ssrLoadModule('/src/main/agent/pi/ChatFileChangeJournal.ts')
  const serviceModule = await vite.ssrLoadModule('/src/main/workspaces/ChatFileReviewService.ts')
  const journal = new journalModule.ChatFileChangeJournal(join(root, 'changes'), project)
  await journal.markHostExec('chat-1')
  const service = new serviceModule.ChatFileReviewService({
    resolveChat: async () => ({ projectId: 'p' }),
    resolveProjectRoot: async () => project,
    journal: () => journal,
  })
  const summary = await service.summary('chat-1')
  assert.equal(summary.fileCount, 0)
  assert.equal(summary.hasUntrackedHostExec, true)
})
