import assert from 'node:assert/strict'
import { mkdtemp, mkdir, readFile, rm, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import { createServer } from 'vite'

async function fixture(t: test.TestContext) {
  const root = await mkdtemp(join(tmpdir(), 'sailor-pi-storage-'))
  t.after(() => rm(root, { recursive: true, force: true }))
  const vite = await createServer({ logLevel: 'silent', server: { middlewareMode: true } })
  t.after(() => vite.close())
  const mod = await vite.ssrLoadModule('/src/main/agent/pi/PiStorage.ts').catch(() => ({}))
  assert.equal(typeof mod.PiStorage, 'function', '需要可恢复且隔离的 Pi 内部存储')
  return { root, mod, vite }
}

test('内部虚拟文件可恢复；命令不能读取真实主机文件', async t => {
  const { root, mod } = await fixture(t)
  const secret = join(root, 'host-only.txt')
  await writeFile(secret, 'host-only')
  const store = new mod.PiStorage(join(root, 'state'))
  const state = await store.open('chat/../../x')
  const result = await state.sandbox.run({ command: `cat '${secret}'` })
  assert.notEqual(result.exitCode, 0)
  await state.sandbox.run({ command: 'mkdir -p /home/sailor/.ai-sdk' })
  await state.sandbox.writeTextFile({ path: '/home/sailor/.ai-sdk/session.json', content: 'native-state' })
  const resume = { type: 'resume-session', harnessId: 'pi', specificationVersion: 'harness-v1', data: {} }
  await store.save('chat/../../x', state, resume)
  const restored = await new mod.PiStorage(join(root, 'state')).open('chat/../../x')
  assert.deepEqual(restored.resume, resume)
  assert.equal(await restored.sandbox.readTextFile({ path: '/home/sailor/.ai-sdk/session.json' }), 'native-state')
  assert.equal((await new mod.PiStorage(join(root, 'state')).open('other')).resume, undefined)
  assert.equal(await readFile(secret, 'utf8'), 'host-only')
  await store.delete('chat/../../x')
  assert.equal((await store.open('chat/../../x')).resume, undefined)
  assert.equal(await readFile(secret, 'utf8'), 'host-only')
  await store.delete('chat/../../x')
})

test('Skills 仅加载工作区内的合法文件，拒绝越界符号链接与敏感附件', async t => {
  const { root, mod, vite } = await fixture(t)
  const { WorkspaceToolScope } = await vite.ssrLoadModule('/src/main/workspaces/WorkspaceToolScope.ts')
  const project = join(root, 'project')
  await mkdir(join(project, '.agents/skills/review/references'), { recursive: true })
  await writeFile(join(project, '.agents/skills/review/SKILL.md'), '---\nname: review\ndescription: "Review: carefully"\n---\nRead references/rules.md')
  await writeFile(join(project, '.agents/skills/review/references/rules.md'), 'rules')
  await writeFile(join(project, '.agents/skills/review/.env'), 'hidden')
  await mkdir(join(root, 'outside'))
  await writeFile(join(root, 'outside/SKILL.md'), 'outside')
  await symlink(join(root, 'outside'), join(project, '.agents/skills/escape'))
  const scope = await WorkspaceToolScope.create(project, new AbortController().signal)
  const skills = await mod.loadPiSkills(scope)
  assert.equal(skills.length, 1)
  assert.equal(skills[0].name, 'review')
  assert.equal(skills[0].description, 'Review: carefully')
  assert.deepEqual(skills[0].files, [{ path: 'references/rules.md', content: 'rules' }])
})

test('本地挂载读写真实文件，拒绝敏感路径与符号链接；快照不包含项目内容', async t => {
  const { root, mod } = await fixture(t)
  const project = join(root, 'project')
  await mkdir(project)
  await writeFile(join(project, 'source.txt'), 'project-data')
  await writeFile(join(project, '.env'), 'private-data')
  await writeFile(join(root, 'outside.txt'), 'outside-data')
  await symlink(join(root, 'outside.txt'), join(project, 'escape'))
  const store = new mod.PiStorage(join(root, 'state'))
  const state = await store.open('mounted', project)
  assert.equal(await state.sandbox.readTextFile({ path: '/home/sailor/workspace/source.txt' }), 'project-data')
  await state.sandbox.writeTextFile({ path: '/home/sailor/workspace/created.txt', content: 'written' })
  assert.equal(await readFile(join(project, 'created.txt'), 'utf8'), 'written')
  for (const name of ['.env', 'escape']) {
    const result = await state.sandbox.run({ command: `cat /home/sailor/workspace/${name}` })
    assert.notEqual(result.exitCode, 0)
    assert.doesNotMatch(result.stdout, /private-data|outside-data/)
  }
  await store.save('mounted', state, { type: 'resume-session', harnessId: 'pi', specificationVersion: 'harness-v1', data: {} })
  const { readdir } = await import('node:fs/promises')
  const saved = await readFile(join(root, 'state', (await readdir(join(root, 'state')))[0]), 'utf8')
  assert.deepEqual(JSON.parse(saved).files, {})
})
