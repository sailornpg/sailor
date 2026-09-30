import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import { createServer } from 'vite'

async function fixture(t: test.TestContext) {
  const root = await mkdtemp(join(tmpdir(), 'sailor-file-change-'))
  const project = join(root, 'project')
  await mkdir(project)
  t.after(() => rm(root, { recursive: true, force: true }))
  const vite = await createServer({ logLevel: 'silent', server: { middlewareMode: true } })
  t.after(() => vite.close())
  const journalModule = await vite.ssrLoadModule('/src/main/agent/pi/ChatFileChangeJournal.ts')
  const fsModule = await vite.ssrLoadModule('/src/main/agent/pi/WorkspaceFileSystem.ts')
  const journal = new journalModule.ChatFileChangeJournal(join(root, 'changes'), project)
  const tracker = journalModule.createFileChangeTracker(journal, 'chat-1', 'run-1')
  const fs = fsModule.createWorkspaceFileSystem(project, { tracker })
  return { root, project, journal, tracker, fs, Journal: journalModule.ChatFileChangeJournal }
}

test('records create, edit, append and delete as one net file diff', async (t) => {
  const { fs, journal, project } = await fixture(t)

  await writeFile(join(project, 'src.txt'), 'one\ntwo\n')
  await fs.writeFile('src.txt', 'one\nthree\n')
  await fs.appendFile('src.txt', 'four\n')
  const beforeDelete = await journal.getChanges('chat-1')
  assert.equal(beforeDelete.fileCount, 1)
  assert.equal(beforeDelete.addedLines, 2)
  assert.equal(beforeDelete.removedLines, 1)
  assert.deepEqual(beforeDelete.changes[0]?.lines, [
    { kind: 'context', text: 'one' },
    { kind: 'removed', text: 'two' },
    { kind: 'added', text: 'three' },
    { kind: 'added', text: 'four' },
  ])

  await fs.rm('src.txt')
  const afterDelete = await journal.getChanges('chat-1')
  assert.equal(afterDelete.fileCount, 1)
  assert.equal(afterDelete.changes[0]?.kind, 'deleted')
})

test('restores records and drops a write that returns a file to its original content', async (t) => {
  const { fs, journal, root, project, Journal } = await fixture(t)
  await writeFile(join(project, 'same.txt'), 'original\n')
  await fs.writeFile('same.txt', 'changed\n')
  await fs.writeFile('same.txt', 'original\n')

  const noOp = await journal.getChanges('chat-1')
  assert.equal(noOp.fileCount, 0)

  const restored = new Journal(join(root, 'changes'), project)
  assert.equal((await restored.getChanges('chat-1')).fileCount, 0)
})

test('starts a new segment after an external edit instead of merging it into the chat diff', async (t) => {
  const { fs, journal, project } = await fixture(t)
  await fs.writeFile('shared.txt', 'agent-before\n')
  await fs.writeFile('shared.txt', 'agent-after\n')
  await writeFile(join(project, 'shared.txt'), 'external\n')
  await fs.writeFile('shared.txt', 'agent-after-external\n')

  const records = await journal.getRecords('chat-1')
  assert.equal(records.length, 3)
  assert.equal(records[2]?.discontinuous, true)
  assert.equal((await journal.getChanges('chat-1')).changes[0]?.state, 'stale')
})

test('keeps complete diffs for large UTF-8 files while binary files have no text line counts', async (t) => {
  const { fs, journal } = await fixture(t)
  await assert.rejects(() => fs.rm('missing.txt'))
  await fs.writeFile('image.bin', new Uint8Array([0, 1, 2, 3]))
  await fs.writeFile('large.txt', 'x'.repeat(600 * 1024))

  const changes = await journal.getChanges('chat-1')
  assert.equal(changes.fileCount, 2)
  assert.equal(changes.addedLines, null)
  assert.equal(changes.removedLines, null)
  assert.equal(changes.hasIncompleteDiff, true)
  const binary = changes.changes.find((change) => change.path === 'image.bin')
  assert.equal(binary?.addedLines, null)
  assert.equal(binary?.lines.length, 0)
  const large = changes.changes.find((change) => change.path === 'large.txt')
  assert.equal(large?.addedLines, 1)
  assert.equal(large?.removedLines, 0)
  assert.equal(large?.truncated, false)
  assert.equal(large?.lines[0]?.text.length, 600 * 1024)
})

test('returns every line of a text diff instead of clipping the review payload', async (t) => {
  const { fs, journal } = await fixture(t)
  const content = Array.from({ length: 2_501 }, (_, index) => `line ${index + 1}`).join('\n') + '\n'
  await fs.writeFile('many-lines.txt', content)

  const change = (await journal.getChanges('chat-1')).changes[0]
  assert.equal(change?.addedLines, 2_501)
  assert.equal(change?.removedLines, 0)
  assert.equal(change?.lines.length, 2_501)
  assert.equal(change?.truncated, false)
})

test('persists journal state without exposing absolute workspace paths', async (t) => {
  const { fs, journal, root } = await fixture(t)
  await fs.writeFile('nested/file.txt', 'content\n')
  const files = await import('node:fs/promises').then((value) =>
    value.readdir(join(root, 'changes')),
  )
  assert.equal(files.length, 1)
  const persisted = JSON.parse(await readFile(join(root, 'changes', files[0]!), 'utf8'))
  assert.equal(persisted.version, 1)
  assert.equal(persisted.chatId, 'chat-1')
  assert.equal(JSON.stringify(persisted).includes(projectPath(root)), false)
})

test('keeps every record when the journal exceeds the former count and byte caps', async (t) => {
  const { journal, root } = await fixture(t)
  const directory = join(root, 'changes')
  await mkdir(directory)
  const digest = (text: string) => createHash('sha256').update(text).digest('hex')
  const largeA = 'a'.repeat(4_300 * 1024)
  const largeB = 'b'.repeat(4_300 * 1024)
  const records = Array.from({ length: 500 }, (_, index) => {
    const afterText = index === 498 ? largeA : index === 499 ? largeB : `after ${index}`
    return {
      id: `record-${index}`,
      chatId: 'chat-1',
      turnId: `turn-${index}`,
      runId: `run-${index}`,
      path: `file-${index}.txt`,
      before: { hash: digest(''), text: '', lineable: true, existed: false },
      after: { hash: digest(afterText), text: afterText, lineable: true, existed: true },
      at: index,
    }
  })
  const journalPath = join(directory, `${digest('chat-1')}.json`)
  await writeFile(journalPath, JSON.stringify({ version: 1, chatId: 'chat-1', records }))

  await journal.record(
    'chat-1',
    'turn-500',
    'run-500',
    'file-500.txt',
    { hash: digest(''), text: '', lineable: true, existed: false },
    { hash: digest('new'), text: 'new', lineable: true, existed: true },
  )

  const saved = JSON.parse(await readFile(journalPath, 'utf8'))
  assert.equal(saved.records.length, 501)
  assert.equal(saved.records[0]?.id, 'record-0')
  assert.ok(Buffer.byteLength(JSON.stringify(saved)) > 8 * 1024 * 1024)
})

test('concurrent writes retain both file records', async (t) => {
  const { fs, journal } = await fixture(t)
  await Promise.all([fs.writeFile('one.txt', 'one\n'), fs.writeFile('two.txt', 'two\n')])
  const summary = await journal.getChanges('chat-1')
  assert.equal(summary.fileCount, 2)
  assert.deepEqual(summary.changes.map((change) => change.path).sort(), ['one.txt', 'two.txt'])
})

test('a journal save failure does not turn a successful file write into a failed tool call', async (t) => {
  const { fs, journal, root, project } = await fixture(t)
  await writeFile(join(root, 'changes'), 'not a directory')
  await fs.writeFile('saved.txt', 'saved\n')
  assert.equal(await readFile(join(project, 'saved.txt'), 'utf8'), 'saved\n')
  assert.equal((await journal.getChanges('chat-1')).hasTrackingError, true)
})

test('PiStorage shares a chat journal with the review IPC path', async (t) => {
  const { root, project } = await fixture(t)
  const vite = await createServer({ logLevel: 'silent', server: { middlewareMode: true } })
  t.after(() => vite.close())
  const { PiStorage } = await vite.ssrLoadModule('/src/main/agent/pi/PiStorage.ts')
  const storage = new PiStorage(join(root, 'sessions'))
  assert.equal(storage.fileChanges('chat-1', project), storage.fileChanges('chat-1', project))
})

test('empty file creation becoming absent is stale even though empty hashes match', async (t) => {
  const { fs, journal, project } = await fixture(t)
  await fs.writeFile('empty.txt', '')
  await rm(join(project, 'empty.txt'))
  assert.equal((await journal.getChanges('chat-1')).changes[0]?.state, 'stale')
})

function projectPath(root: string): string {
  return join(root, 'project')
}
