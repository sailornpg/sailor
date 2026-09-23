import assert from 'node:assert/strict'
import { mkdtemp, mkdir, symlink, writeFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import test from 'node:test'
import { createServer } from 'vite'

async function loadService(t: test.TestContext) {
  const vite = await createServer({
    logLevel: 'silent',
    server: { middlewareMode: true },
    resolve: { alias: { '@shared': resolve('src/shared') } },
  })
  t.after(() => vite.close())
  const mod = await vite
    .ssrLoadModule('/src/main/workspaces/WorkspaceFilesService.ts')
    .catch(() => ({}))
  assert.equal(
    typeof mod.WorkspaceFilesService,
    'function',
    '需要实现工作区文件读取服务',
  )
  return mod.WorkspaceFilesService as new (
    resolveProjectRoot: (projectId: string) => Promise<string>,
  ) => {
    list(projectId: string, path?: string, cursor?: string): Promise<unknown>
    read(projectId: string, path: string): Promise<unknown>
  }
}

test('文件服务按项目读取分页树，并返回受限文本预览与 hash', async (t) => {
  const Service = await loadService(t)
  const root = await mkdtemp(join(tmpdir(), 'sailor-files-'))
  const outside = await mkdtemp(join(tmpdir(), 'sailor-files-outside-'))
  t.after(async () => {
    await rm(root, { recursive: true, force: true })
    await rm(outside, { recursive: true, force: true })
  })
  await mkdir(join(root, 'src'))
  await writeFile(join(root, 'src', 'main.ts'), 'export const answer = 42\n')
  const service = new Service(async (projectId) => {
    assert.equal(projectId, 'project-1')
    return root
  })

  const page = (await service.list('project-1', 'src')) as {
    entries: Array<{ relativePath: string; kind: string }>
    nextCursor?: string
  }
  assert.deepEqual(
    page.entries.map((entry) => [entry.relativePath, entry.kind]),
    [['src/main.ts', 'file']],
  )
  assert.equal(page.nextCursor, undefined)

  const preview = (await service.read('project-1', 'src/main.ts')) as {
    relativePath: string
    content: string
    sha256: string
    truncated: boolean
  }
  assert.equal(preview.relativePath, 'src/main.ts')
  assert.equal(preview.content, 'export const answer = 42\n')
  assert.match(preview.sha256, /^[a-f0-9]{64}$/)
  assert.equal(preview.truncated, false)
})

test('文件服务拒绝越界、敏感路径和二进制文件', async (t) => {
  const Service = await loadService(t)
  const root = await mkdtemp(join(tmpdir(), 'sailor-files-'))
  const outside = await mkdtemp(join(tmpdir(), 'sailor-outside-'))
  t.after(async () => {
    await rm(root, { recursive: true, force: true })
    await rm(outside, { recursive: true, force: true })
  })
  await writeFile(join(root, '.env'), 'SECRET=hidden')
  await writeFile(join(root, 'image.bin'), Buffer.from([0, 1, 2, 3]))
  await writeFile(join(outside, 'outside.txt'), 'outside')
  await symlink(join(outside, 'outside.txt'), join(root, 'link.txt'))
  const service = new Service(async () => root)

  await assert.rejects(service.read('p', '.env'), /敏感/)
  await assert.rejects(service.read('p', 'link.txt'), /工作区之外|符号链接/)
  const binary = (await service.read('p', 'image.bin')) as {
    previewable: boolean
    reason?: string
  }
  assert.equal(binary.previewable, false)
  assert.match(binary.reason ?? '', /二进制|预览/)
})

test('保留普通隐藏文件，拒绝内部符号链接，严格验证游标并安全截断 UTF-8', async (t) => {
  const Service = await loadService(t)
  const root = await mkdtemp(join(tmpdir(), 'sailor-files-'))
  const outside = await mkdtemp(join(tmpdir(), 'sailor-files-outside-'))
  t.after(async () => {
    await rm(root, { recursive: true, force: true })
    await rm(outside, { recursive: true, force: true })
  })
  await writeFile(join(root, '.gitignore'), 'out')
  await writeFile(join(root, 'text.txt'), '你'.repeat(180000))
  await writeFile(join(outside, 'outside.txt'), 'outside')
  await symlink(join(outside, 'outside.txt'), join(root, 'alias.txt'))
  const service = new Service(async () => root)
  const page = (await service.list('p')) as { entries: { name: string }[] }
  assert.ok(page.entries.some((e) => e.name === '.gitignore'))
  await assert.rejects(service.read('p', 'alias.txt'), /符号链接/)
  await symlink(join(root, 'text.txt'), join(root, 'internal.txt'))
  await assert.rejects(service.read('p', 'internal.txt'), /符号链接/)
  await assert.rejects(service.list('p', '', '1junk'), /游标/)
  await assert.rejects(service.read('p', '../outside'), /工作区/)
  const preview = (await service.read('p', 'text.txt')) as {
    content: string
    truncated: boolean
  }
  assert.equal(preview.truncated, true)
  assert.ok(!preview.content.includes('\ufffd'))
  assert.ok(Buffer.byteLength(preview.content) <= 512 * 1024)
})

test('分页不重复，行数限制和无效 UTF-8 明确返回', async (t) => {
  const Service = await loadService(t)
  const root = await mkdtemp(join(tmpdir(), 'sailor-files-'))
  t.after(() => rm(root, { recursive: true, force: true }))
  await Promise.all(
    Array.from({ length: 205 }, (_, i) =>
      writeFile(join(root, `${i}.txt`), 'x'),
    ),
  )
  const service = new Service(async () => root)
  const first = (await service.list('p')) as {
    entries: { name: string }[]
    nextCursor: string
  }
  const second = (await service.list('p', '', first.nextCursor)) as {
    entries: { name: string }[]
  }
  assert.equal(first.entries.length, 200)
  assert.equal(
    new Set([...first.entries, ...second.entries].map((e) => e.name)).size,
    205,
  )
  await writeFile(join(root, 'lines.txt'), 'a\n'.repeat(21000))
  await writeFile(join(root, 'invalid.txt'), Buffer.from([0xff]))
  const lines = (await service.read('p', 'lines.txt')) as {
    content: string
    truncated: boolean
  }
  assert.equal(lines.content.split('\n').length, 20000)
  assert.equal(lines.truncated, true)
  assert.equal(
    ((await service.read('p', 'invalid.txt')) as { previewable: boolean })
      .previewable,
    false,
  )
})

test('换行规范化与 CodeMirror 偏移一致；系统 I/O 错误不泄露主机路径', async (t) => {
  const Service = await loadService(t)
  const root = await mkdtemp(join(tmpdir(), 'sailor-files-'))
  t.after(() => rm(root, { recursive: true, force: true }))
  await writeFile(join(root, 'windows.txt'), 'first\r\nsecond\r\n')
  const service = new Service(async () => root)
  assert.equal(
    ((await service.read('p', 'windows.txt')) as { content: string }).content,
    'first\nsecond\n',
  )
  const broken = new Service(async () => {
    throw Object.assign(new Error('ENOENT /private/hidden/project'), {
      code: 'ENOENT',
      syscall: 'open',
    })
  })
  await assert.rejects(
    broken.list('p'),
    (error) => error instanceof Error && !error.message.includes('/private'),
  )
})
