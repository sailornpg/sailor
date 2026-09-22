import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import test from 'node:test'
import { createServer } from 'vite'

const hash = (value: string) => createHash('sha256').update(value).digest('hex')

async function fixture(t: test.TestContext) {
  const directory = await import('node:fs/promises').then(({ mkdtemp }) => mkdtemp(join(tmpdir(), 'sailor-write-file-')))
  const root = join(directory, 'workspace')
  await mkdir(join(root, 'src'), { recursive: true })
  t.after(() => rm(directory, { recursive: true, force: true }))
  const vite = await createServer({
    logLevel: 'silent',
    resolve: { alias: { '@shared': resolve(process.cwd(), 'src/shared') } },
    server: { middlewareMode: true },
  })
  t.after(() => vite.close())
  const scopeModule = await vite.ssrLoadModule('/src/main/workspaces/WorkspaceToolScope.ts')
  const writeModule = await vite.ssrLoadModule('/tests/fixtures/legacy-tools/WorkspaceWriteTools.ts')
  const controller = new AbortController()
  const scope = await scopeModule.WorkspaceToolScope.create(root, controller.signal)
  const context = { chatId: 'chat-1', runId: 'run-1', rootPath: scope.rootPath, scope, signal: controller.signal }
  let grants = 0
  const grantConsumer = {
    consumeGrant() {
      grants += 1
      return { approvalId: 'approval', originRunId: 'origin', scope: { kind: 'workspace-file', path: 'src/file.txt' } }
    },
  }
  return { directory, root, context, controller, writeModule, grantConsumer, grants: () => grants }
}

test('write_file defaults to atomic create and never overwrites an existing file', async t => {
  const { root, context, writeModule, grantConsumer, grants } = await fixture(t)
  const tools = new writeModule.WorkspaceWriteTools(context, grantConsumer)
  const created: any = await tools.writeFile('call-create', { path: 'src/new.txt', content: 'hello\n' })

  assert.equal(created.ok, true)
  assert.deepEqual(created.effects, { kind: 'applied', description: '已创建 src/new.txt' })
  assert.deepEqual(created.data, {
    path: 'src/new.txt', operation: 'create', bytesWritten: 6,
    beforeHash: null, afterHash: hash('hello\n'),
  })
  assert.equal(await readFile(join(root, 'src/new.txt'), 'utf8'), 'hello\n')
  assert.equal(grants(), 1)

  const exists: any = await tools.writeFile('call-exists', { path: 'src/new.txt', content: 'changed\n' })
  assert.equal(exists.ok, false)
  assert.equal(exists.error.code, 'FILE_EXISTS')
  assert.equal(exists.effects.kind, 'none')
  assert.equal(await readFile(join(root, 'src/new.txt'), 'utf8'), 'hello\n')

  const missingParent: any = await tools.writeFile('call-parent', { path: 'missing/new.txt', content: 'x' })
  assert.equal(missingParent.ok, false)
  assert.equal(missingParent.error.code, 'PARENT_NOT_FOUND')
  assert.equal(missingParent.effects.kind, 'none')
})

test('overwrite requires explicit mode and expectedHash, then rechecks the current version', async t => {
  const { root, context, writeModule, grantConsumer } = await fixture(t)
  const target = join(root, 'src/app.ts')
  await writeFile(target, 'old\n')
  const tools = new writeModule.WorkspaceWriteTools(context, grantConsumer)

  const missingHash: any = await tools.writeFile('call-invalid', {
    path: 'src/app.ts', mode: 'overwrite', content: 'new\n',
  })
  assert.equal(missingHash.ok, false)
  assert.equal(missingHash.error.code, 'INVALID_ARGUMENT')
  assert.equal(await readFile(target, 'utf8'), 'old\n')

  const conflict: any = await tools.writeFile('call-conflict', {
    path: 'src/app.ts', mode: 'overwrite', expectedHash: '0'.repeat(64), content: 'new\n',
  })
  assert.equal(conflict.ok, false)
  assert.equal(conflict.error.code, 'VERSION_CONFLICT')
  assert.equal(conflict.error.details.actualHash, hash('old\n'))
  assert.equal(conflict.effects.kind, 'none')
  assert.equal(await readFile(target, 'utf8'), 'old\n')

  const applied: any = await tools.writeFile('call-overwrite', {
    path: 'src/app.ts', mode: 'overwrite', expectedHash: hash('old\n'), content: 'new\n',
  })
  assert.equal(applied.ok, true)
  assert.deepEqual(applied.data, {
    path: 'src/app.ts', operation: 'overwrite', bytesWritten: 4,
    beforeHash: hash('old\n'), afterHash: hash('new\n'),
  })
  assert.equal(await readFile(target, 'utf8'), 'new\n')
})

test('serializes writes to the same canonical path', async t => {
  const { root, context, writeModule, grantConsumer } = await fixture(t)
  let active = 0
  let maximumActive = 0
  const fileSystem = {
    ...writeModule.nodeWorkspaceWriteFileSystem,
    async writeTemporaryFile(path: string, content: Buffer) {
      active += 1
      maximumActive = Math.max(maximumActive, active)
      await new Promise(resolveDelay => setTimeout(resolveDelay, 25))
      try {
        await writeModule.nodeWorkspaceWriteFileSystem.writeTemporaryFile(path, content)
      } finally {
        active -= 1
      }
    },
  }
  const tools = new writeModule.WorkspaceWriteTools(
    context,
    grantConsumer,
    { coordinator: new writeModule.WorkspaceWriteCoordinator(), fileSystem },
  )
  const results: any[] = await Promise.all([
    tools.writeFile('call-a', { path: 'src/race.txt', content: 'first\n' }),
    tools.writeFile('call-b', { path: 'src/race.txt', content: 'second\n' }),
  ])

  assert.equal(maximumActive, 1)
  assert.deepEqual(results.map(result => result.ok).sort(), [false, true])
  assert.equal(results.find(result => !result.ok).error.code, 'FILE_EXISTS')
  assert.equal(await readFile(join(root, 'src/race.txt'), 'utf8'), 'first\n')
})

test('reports permission, storage, cancellation and uncertain publish effects without false success', async t => {
  const { root, context, controller, writeModule, grantConsumer } = await fixture(t)
  const target = join(root, 'src/app.ts')
  await writeFile(target, 'old\n')

  for (const [systemCode, expectedCode] of [['EACCES', 'PERMISSION_DENIED'], ['ENOSPC', 'STORAGE_FULL']] as const) {
    const fileSystem = {
      ...writeModule.nodeWorkspaceWriteFileSystem,
      async writeTemporaryFile() { throw Object.assign(new Error(systemCode), { code: systemCode }) },
    }
    const result: any = await new writeModule.WorkspaceWriteTools(context, grantConsumer, { fileSystem })
      .writeFile(`call-${systemCode}`, {
        path: 'src/app.ts', mode: 'overwrite', expectedHash: hash('old\n'), content: 'new\n',
      })
    assert.equal(result.ok, false)
    assert.equal(result.error.code, expectedCode)
    assert.equal(result.effects.kind, 'none')
    assert.equal(await readFile(target, 'utf8'), 'old\n')
  }

  const uncertainFileSystem = {
    ...writeModule.nodeWorkspaceWriteFileSystem,
    async publishOverwrite(temporaryPath: string, targetPath: string) {
      await rename(temporaryPath, targetPath)
      throw Object.assign(new Error('lost acknowledgement'), { code: 'EIO' })
    },
  }
  const uncertain: any = await new writeModule.WorkspaceWriteTools(context, grantConsumer, { fileSystem: uncertainFileSystem })
    .writeFile('call-uncertain', {
      path: 'src/app.ts', mode: 'overwrite', expectedHash: hash('old\n'), content: 'new\n',
    })
  assert.equal(uncertain.ok, false)
  assert.equal(uncertain.effects.kind, 'unknown')
  assert.match(uncertain.effects.description, /可能/)
  assert.equal(await readFile(target, 'utf8'), 'new\n')

  await writeFile(target, 'cancel-old\n')
  const cancellingFileSystem = {
    ...writeModule.nodeWorkspaceWriteFileSystem,
    async writeTemporaryFile(path: string, content: Buffer) {
      await writeModule.nodeWorkspaceWriteFileSystem.writeTemporaryFile(path, content)
      controller.abort()
    },
  }
  const cancelled: any = await new writeModule.WorkspaceWriteTools(context, grantConsumer, { fileSystem: cancellingFileSystem })
    .writeFile('call-cancel', {
      path: 'src/app.ts', mode: 'overwrite', expectedHash: hash('cancel-old\n'), content: 'cancel-new\n',
    })
  assert.equal(cancelled.ok, false)
  assert.equal(cancelled.error.code, 'CANCELLED')
  assert.equal(cancelled.effects.kind, 'none')
  assert.equal(await readFile(target, 'utf8'), 'cancel-old\n')
})

test('authorization failure is checked before any filesystem mutation', async t => {
  const { root, context, writeModule } = await fixture(t)
  let writes = 0
  const fileSystem = {
    ...writeModule.nodeWorkspaceWriteFileSystem,
    async writeTemporaryFile(path: string, content: Buffer) {
      writes += 1
      await writeModule.nodeWorkspaceWriteFileSystem.writeTemporaryFile(path, content)
    },
  }
  const tools = new writeModule.WorkspaceWriteTools(
    context,
    { consumeGrant() { throw new Error('写入授权不存在或已失效。') } },
    { fileSystem },
  )
  const result: any = await tools.writeFile('call-no-grant', { path: 'src/nope.txt', content: 'x' })

  assert.equal(result.ok, false)
  assert.equal(result.error.code, 'APPROVAL_REQUIRED')
  assert.equal(result.effects.kind, 'none')
  assert.equal(writes, 0)
  await assert.rejects(readFile(join(root, 'src/nope.txt')), { code: 'ENOENT' })
})
