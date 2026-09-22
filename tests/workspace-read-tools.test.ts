import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { chmod, mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import test from 'node:test'
import { createServer } from 'vite'

async function fixture(t: test.TestContext) {
  const directory = await mkdtemp(join(tmpdir(), 'sailor-read-tools-'))
  const root = join(directory, 'workspace')
  await mkdir(join(root, 'src/nested'), { recursive: true })
  t.after(() => rm(directory, { recursive: true, force: true }))
  const vite = await createServer({
    logLevel: 'silent',
    resolve: { alias: { '@shared': resolve(process.cwd(), 'src/shared') } },
    server: { middlewareMode: true },
  })
  t.after(() => vite.close())
  const { WorkspaceToolScope } = await vite.ssrLoadModule('/src/main/workspaces/WorkspaceToolScope.ts')
  const module = await vite.ssrLoadModule('/tests/fixtures/legacy-tools/WorkspaceReadTools.ts')
  const controller = new AbortController()
  const scope = await WorkspaceToolScope.create(root, controller.signal)
  const context = { chatId: 'chat-1', rootPath: scope.rootPath, scope, signal: controller.signal }
  return { root, controller, tools: new module.WorkspaceReadTools(context), contract: await vite.ssrLoadModule('/src/shared/toolFeedback.ts') }
}

test('read_file returns selected text, full hash and explicit truncation', async t => {
  const { root, tools, contract } = await fixture(t)
  const content = Array.from({ length: 700 }, (_, index) => `${index + 1}:${'x'.repeat(120)}`).join('\n')
  await writeFile(join(root, 'large.txt'), content)
  const result: any = await tools.readFile('read-1', { path: 'large.txt' })

  assert.equal(contract.toolResultSchema.parse(result).ok, true)
  assert.equal(result.data.path, 'large.txt')
  assert.equal(result.data.startLine, 1)
  assert.equal(result.data.endLine, 500)
  assert.equal(result.data.totalLines, 700)
  assert.equal(result.data.hash, createHash('sha256').update(content).digest('hex'))
  assert.ok(new TextEncoder().encode(result.data.content).byteLength <= contract.TOOL_BUDGETS.readFileBytes)
  assert.equal(result.truncated, true)

  const slice: any = await tools.readFile('read-2', { path: 'large.txt', startLine: 699, maxLines: 2 })
  assert.match(slice.data.content, /^699:/)
  assert.equal(slice.data.endLine, 700)
  assert.equal(slice.truncated, true)
})

test('read_file reports binary and missing files as structured failures', async t => {
  const { root, tools } = await fixture(t)
  await writeFile(join(root, 'binary.bin'), Buffer.from([1, 2, 0, 4]))

  const binary: any = await tools.readFile('read-binary', { path: 'binary.bin' })
  assert.equal(binary.ok, false)
  assert.equal(binary.error.code, 'BINARY_FILE')
  assert.equal(binary.effects.kind, 'none')

  const missing: any = await tools.readFile('read-missing', { path: 'missing.txt' })
  assert.equal(missing.ok, false)
  assert.equal(missing.error.code, 'NOT_FOUND')
  assert.match(missing.error.recovery[0].action, /list_files/)
})

test('list_files enforces depth and stable pagination while hiding sensitive paths', async t => {
  const { root, tools } = await fixture(t)
  await writeFile(join(root, '.env'), 'SECRET=value\n')
  await writeFile(join(root, 'src/nested/deep.txt'), 'deep\n')
  await Promise.all(Array.from({ length: 205 }, (_, index) => writeFile(join(root, `file-${String(index).padStart(3, '0')}.txt`), 'x')))

  const first: any = await tools.listFiles('list-1', { path: '.', depth: 1, limit: 200 })
  assert.equal(first.ok, true)
  assert.equal(first.data.entries.length, 200)
  assert.equal(first.data.nextCursor, 200)
  assert.equal(first.truncated, true)
  assert.ok(!first.data.entries.some((entry: any) => entry.path === '.env' || entry.path === 'src/nested/deep.txt'))

  const second: any = await tools.listFiles('list-2', { path: '.', depth: 1, limit: 200, cursor: 200 })
  assert.ok(second.data.entries.length > 0)
  assert.equal(second.data.nextCursor, null)

  await mkdir(join(root, 'empty'))
  const empty: any = await tools.listFiles('list-empty', { path: 'empty' })
  assert.deepEqual(empty.data.entries, [])
  assert.equal(empty.truncated, false)
})

test('search_files treats the query literally and returns line numbers with full hashes', async t => {
  const { root, tools } = await fixture(t)
  const source = 'const exact = "a.b"\nconst regexLike = "axb"\nconst again = "a.b"\n'
  await writeFile(join(root, 'src/search.ts'), source)

  const found: any = await tools.searchFiles('search-1', { path: 'src', query: '.', maxResults: 1 })
  assert.equal(found.ok, true)
  assert.equal(found.data.matches.length, 1)
  assert.equal(found.data.matches[0].path, 'src/search.ts')
  assert.equal(found.data.matches[0].lineNumber, 1)
  assert.match(found.data.matches[0].line, /a\.b/)
  assert.equal(found.data.matches[0].hash, createHash('sha256').update(source).digest('hex'))
  assert.equal(found.truncated, true)

  const empty: any = await tools.searchFiles('search-empty', { path: 'src', query: 'not present' })
  assert.deepEqual(empty.data.matches, [])
  assert.match(empty.summary, /未找到/)
})

test('read tools expose permission and cancellation failures without side effects', async t => {
  const { root, controller, tools } = await fixture(t)
  const locked = join(root, 'locked.txt')
  await writeFile(locked, 'locked')
  await chmod(locked, 0o000)
  t.after(() => chmod(locked, 0o600).catch(() => undefined))

  const denied: any = await tools.readFile('read-denied', { path: 'locked.txt' })
  assert.equal(denied.ok, false)
  assert.equal(denied.error.code, 'PERMISSION_DENIED')
  assert.equal(denied.effects.kind, 'none')

  controller.abort()
  const cancelled: any = await tools.listFiles('list-cancelled', { path: '.' })
  assert.equal(cancelled.ok, false)
  assert.equal(cancelled.error.code, 'CANCELLED')
  assert.equal(cancelled.effects.kind, 'none')
  assert.doesNotMatch(JSON.stringify(cancelled), new RegExp(root.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')))
})
