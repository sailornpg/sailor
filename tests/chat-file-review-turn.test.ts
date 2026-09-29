import assert from 'node:assert/strict'
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import { createServer } from 'vite'

test('keeps independent net diffs for consecutive turns editing the same file', async (t) => {
  const root = await mkdtemp(join(tmpdir(), 'sailor-file-review-turn-'))
  const project = join(root, 'project')
  await mkdir(project)
  await writeFile(join(project, 'app.ts'), 'const value = 0\n')
  t.after(() => rm(root, { recursive: true, force: true }))

  const vite = await createServer({ logLevel: 'silent', server: { middlewareMode: true } })
  t.after(() => vite.close())
  const journalModule = await vite.ssrLoadModule('/src/main/agent/pi/ChatFileChangeJournal.ts')
  const fsModule = await vite.ssrLoadModule('/src/main/agent/pi/WorkspaceFileSystem.ts')
  const journal = new journalModule.ChatFileChangeJournal(join(root, 'changes'), project)
  const turnOne = journalModule.createFileChangeTracker(journal, 'chat-1', 'turn-1', 'run-1')
  const turnTwo = journalModule.createFileChangeTracker(journal, 'chat-1', 'turn-2', 'run-2')
  const fsOne = fsModule.createWorkspaceFileSystem(project, { tracker: turnOne })
  const fsTwo = fsModule.createWorkspaceFileSystem(project, { tracker: turnTwo })

  await fsOne.writeFile('app.ts', 'const value = 1\n')
  await fsTwo.writeFile('app.ts', 'const value = 2\n')

  const first = await journal.getTurnChanges('chat-1', 'turn-1')
  const second = await journal.getTurnChanges('chat-1', 'turn-2')
  assert.equal(first.fileCount, 1)
  assert.equal(first.addedLines, 1)
  assert.equal(first.removedLines, 1)
  assert.equal(second.fileCount, 1)
  assert.equal(second.addedLines, 1)
  assert.equal(second.removedLines, 1)
  assert.equal(first.changes[0]?.turnId, 'turn-1')
  assert.equal(second.changes[0]?.turnId, 'turn-2')
})

test('groups approval continuation runs into one turn summary', async (t) => {
  const root = await mkdtemp(join(tmpdir(), 'sailor-file-review-continuation-'))
  const project = join(root, 'project')
  await mkdir(project)
  await writeFile(join(project, 'app.ts'), 'const value = 0\n')
  t.after(() => rm(root, { recursive: true, force: true }))

  const vite = await createServer({ logLevel: 'silent', server: { middlewareMode: true } })
  t.after(() => vite.close())
  const journalModule = await vite.ssrLoadModule('/src/main/agent/pi/ChatFileChangeJournal.ts')
  const fsModule = await vite.ssrLoadModule('/src/main/agent/pi/WorkspaceFileSystem.ts')
  const journal = new journalModule.ChatFileChangeJournal(join(root, 'changes'), project)
  const firstRun = journalModule.createFileChangeTracker(journal, 'chat-1', 'turn-1', 'run-1')
  const resumedRun = journalModule.createFileChangeTracker(journal, 'chat-1', 'turn-1', 'run-2')
  const firstFs = fsModule.createWorkspaceFileSystem(project, { tracker: firstRun })
  const resumedFs = fsModule.createWorkspaceFileSystem(project, { tracker: resumedRun })

  await firstFs.writeFile('app.ts', 'const value = 1\n')
  await resumedFs.appendFile('app.ts', 'export {}\n')

  const summary = await journal.getTurnChanges('chat-1', 'turn-1')
  assert.equal(summary.fileCount, 1)
  assert.equal(summary.changes[0]?.runId, 'run-2')
  assert.equal(summary.addedLines, 2)
})

test('exposes a turn-scoped summary and rejects a change from another turn', async (t) => {
  const root = await mkdtemp(join(tmpdir(), 'sailor-file-review-turn-ipc-'))
  const project = join(root, 'project')
  await mkdir(project)
  await writeFile(join(project, 'app.ts'), 'const value = 0\n')
  t.after(() => rm(root, { recursive: true, force: true }))

  const vite = await createServer({ logLevel: 'silent', server: { middlewareMode: true } })
  t.after(() => vite.close())
  const journalModule = await vite.ssrLoadModule('/src/main/agent/pi/ChatFileChangeJournal.ts')
  const fsModule = await vite.ssrLoadModule('/src/main/agent/pi/WorkspaceFileSystem.ts')
  const serviceModule = await vite.ssrLoadModule('/src/main/workspaces/ChatFileReviewService.ts')
  const journal = new journalModule.ChatFileChangeJournal(join(root, 'changes'), project)
  const tracker = journalModule.createFileChangeTracker(journal, 'chat-1', 'turn-1', 'run-1')
  const fs = fsModule.createWorkspaceFileSystem(project, { tracker })
  await fs.writeFile('app.ts', 'const value = 1\n')

  const service = new serviceModule.ChatFileReviewService({
    resolveChat: async () => ({ projectId: 'project-1' }),
    resolveProjectRoot: async () => project,
    journal: () => journal,
  })
  const summary = await service.turnSummary('chat-1', 'turn-1')
  assert.equal(summary.turnId, 'turn-1')
  assert.equal(summary.status, 'completed')
  assert.equal(summary.changes[0]?.lines.length, 0)
  const detail = await service.turnDetail('chat-1', 'turn-1', summary.changes[0]!.id)
  assert.ok(detail.lines.length > 0)
  await assert.rejects(
    () => service.turnDetail('chat-1', 'turn-2', summary.changes[0]!.id),
    /当前轮次/,
  )
})
