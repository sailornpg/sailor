import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import { createServer, type ViteDevServer } from 'vite'

let vite: ViteDevServer
let writeModule: typeof import('./fixtures/legacy-tools/WorkspaceWriteTools.ts')
let scopeModule: typeof import('../src/main/workspaces/WorkspaceToolScope.ts')

const hash = (content: string) => createHash('sha256').update(content).digest('hex')

test.before(async () => {
  vite = await createServer({ logLevel: 'silent', server: { middlewareMode: true } })
  writeModule = await vite.ssrLoadModule('/tests/fixtures/legacy-tools/WorkspaceWriteTools.ts') as typeof writeModule
  scopeModule = await vite.ssrLoadModule('/src/main/workspaces/WorkspaceToolScope.ts') as typeof scopeModule
})

test.after(async () => { await vite?.close() })

async function fixture(t: test.TestContext, content = 'one\ntwo\nthree\n') {
  const root = await mkdtemp(join(tmpdir(), 'sailor-apply-patch-'))
  t.after(() => rm(root, { recursive: true, force: true }))
  await writeFile(join(root, 'app.ts'), content)
  const controller = new AbortController()
  const scope = await scopeModule.WorkspaceToolScope.create(root, controller.signal)
  const context = { chatId: 'chat-patch', runId: 'run-patch', rootPath: root, scope, signal: controller.signal }
  const grantConsumer = { consumeGrant() { return { approvalId: 'approval', originRunId: 'run-patch', scope: { kind: 'workspace-file' as const, path: 'app.ts' } } } }
  return { root, context, grantConsumer }
}

test('applies one deterministic unified patch and returns hashes, line counts, and diff reference', async t => {
  const { root, context, grantConsumer } = await fixture(t)
  const tools = new writeModule.WorkspaceWriteTools(context, grantConsumer)
  const result: any = await tools.applyPatch('patch-1', {
    path: 'app.ts',
    expectedHash: hash('one\ntwo\nthree\n'),
    patch: '@@ -1,3 +1,3 @@\n one\n-two\n+TWO\n three\n',
  })
  assert.equal(result.ok, true)
  assert.equal(result.data.path, 'app.ts')
  assert.equal(result.data.beforeHash, hash('one\ntwo\nthree\n'))
  assert.equal(result.data.afterHash, hash('one\nTWO\nthree\n'))
  assert.deepEqual(result.data.changes, { addedLines: 1, removedLines: 1 })
  assert.equal(result.data.diffRef.kind, 'unified-diff')
  assert.equal(await readFile(join(root, 'app.ts'), 'utf8'), 'one\nTWO\nthree\n')
})

test('rejects malformed, multi-file, ambiguous, and context-mismatched patches without writing', async t => {
  const { root, context, grantConsumer } = await fixture(t, 'same\nsame\n')
  const tools = new writeModule.WorkspaceWriteTools(context, grantConsumer)
  const original = await readFile(join(root, 'app.ts'), 'utf8')
  const cases = [
    ['malformed', 'not a patch'],
    ['multi-file', '*** Begin Patch\n*** Update File: app.ts\n@@\n-same\n+new\n*** Update File: other.ts\n@@\n-x\n+y\n*** End Patch'],
    ['ambiguous', '@@\n same\n+new\n'],
    ['context mismatch', '@@\n missing\n-old\n+new\n'],
  ] as const
  for (const [label, patch] of cases) {
    const result: any = await tools.applyPatch(`patch-${label}`, {
      path: 'app.ts', expectedHash: hash(original), patch,
    })
    assert.equal(result.ok, false, label)
    assert.ok(['INVALID_ARGUMENT', 'PATCH_PARSE_ERROR', 'PATCH_AMBIGUOUS', 'PATCH_CONTEXT_MISMATCH'].includes(result.error.code), label)
    assert.equal(result.effects.kind, 'none', label)
    assert.equal(await readFile(join(root, 'app.ts'), 'utf8'), original, label)
  }
})

test('rejects stale versions and never applies a patch twice after retry', async t => {
  const { root, context, grantConsumer } = await fixture(t)
  const tools = new writeModule.WorkspaceWriteTools(context, grantConsumer)
  const oldHash = hash('one\ntwo\nthree\n')
  await writeFile(join(root, 'app.ts'), 'one\nexternal\nthree\n')
  const stale: any = await tools.applyPatch('patch-stale', {
    path: 'app.ts', expectedHash: oldHash, patch: '@@\n one\n-two\n+TWO\n three\n',
  })
  assert.equal(stale.ok, false)
  assert.equal(stale.error.code, 'VERSION_CONFLICT')
  assert.equal(await readFile(join(root, 'app.ts'), 'utf8'), 'one\nexternal\nthree\n')

  const currentHash = hash('one\nexternal\nthree\n')
  const patch = '@@\n one\n-external\n+EXTERNAL\n three\n'
  const first: any = await tools.applyPatch('patch-retry', { path: 'app.ts', expectedHash: currentHash, patch })
  assert.equal(first.ok, true)
  const retry: any = await tools.applyPatch('patch-retry-again', { path: 'app.ts', expectedHash: currentHash, patch })
  assert.equal(retry.ok, false)
  assert.equal(retry.error.code, 'VERSION_CONFLICT')
  assert.equal(await readFile(join(root, 'app.ts'), 'utf8'), 'one\nEXTERNAL\nthree\n')
})

test('serializes same-path patches so only one competing patch can apply', async t => {
  const { root, context, grantConsumer } = await fixture(t)
  const fileSystem = {
    ...writeModule.nodeWorkspaceWriteFileSystem,
    async writeTemporaryFile(path: string, content: Buffer) {
      await new Promise(resolve => setTimeout(resolve, 20))
      return writeModule.nodeWorkspaceWriteFileSystem.writeTemporaryFile(path, content)
    },
  }
  const tools = new writeModule.WorkspaceWriteTools(context, grantConsumer, {
    fileSystem,
    coordinator: new writeModule.WorkspaceWriteCoordinator(),
  })
  const expectedHash = hash('one\ntwo\nthree\n')
  const patch = (value: string) => `@@ -1,3 +1,3 @@\n one\n-two\n+${value}\n three\n`
  const results: any[] = await Promise.all([
    tools.applyPatch('patch-a', { path: 'app.ts', expectedHash, patch: patch('TWO-A') }),
    tools.applyPatch('patch-b', { path: 'app.ts', expectedHash, patch: patch('TWO-B') }),
  ])
  assert.deepEqual(results.map(result => result.ok).sort(), [false, true])
  assert.equal(results.find(result => !result.ok).error.code, 'VERSION_CONFLICT')
  assert.match(await readFile(join(root, 'app.ts'), 'utf8'), /TWO-[AB]/)
})
