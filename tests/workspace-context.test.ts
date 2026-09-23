import assert from 'node:assert/strict'
import test from 'node:test'
import { createServer } from 'vite'
import { resolve } from 'node:path'
async function fixture(t: test.TestContext) {
  const vite = await createServer({
    logLevel: 'silent',
    server: { middlewareMode: true },
    resolve: {
      alias: {
        '@': resolve('src/renderer/src'),
        '@shared': resolve('src/shared'),
      },
    },
  })
  t.after(() => vite.close())
  const m = await vite
    .ssrLoadModule('/src/shared/workspaceContext.ts')
    .catch(() => ({}))
  assert.equal(typeof m.createWorkspaceContext, 'function', '需要实现引用快照')
  return { vite, m }
}
const source = {
  relativePath: 'src/a.ts',
  content: 'first\n你好 world\nthird',
  sha256: 'a'.repeat(64),
  truncated: false,
  previewable: true,
}
test('选区保持精确字符和行号，文件快照不能冒充截断全文', async (t) => {
  const { m } = await fixture(t)
  const part = m.createWorkspaceContext('p', source, { start: 6, end: 8 })
  assert.equal(part.data.text, '你好')
  assert.equal(part.data.startLine, 2)
  assert.equal(part.data.endLine, 2)
  assert.throws(
    () => m.createWorkspaceContext('p', { ...source, truncated: true }),
    /截断/,
  )
  assert.throws(
    () => m.createWorkspaceContext('p', source, { start: 8, end: 6 }),
    /选区/,
  )
  assert.equal(m.createWorkspaceContext('p', source).data.kind, 'file')
})
test('引用限制数量、字节与项目边界，不允许敏感/越界路径', async (t) => {
  const { m } = await fixture(t)
  const part = m.createWorkspaceContext('p', source)
  assert.throws(() => m.validateWorkspaceContexts([part], 'q'), /工作区/)
  assert.throws(
    () => m.validateWorkspaceContexts(Array(9).fill(part), 'p'),
    /8/,
  )
  assert.throws(
    () => m.createWorkspaceContext('p', { ...source, relativePath: '../x' }),
    /路径/,
  )
  assert.throws(
    () => m.createWorkspaceContext('p', { ...source, relativePath: '.env' }),
    /路径/,
  )
  assert.throws(
    () =>
      m.createWorkspaceContext('p', { ...source, content: '你'.repeat(12000) }),
    /32/,
  )
})
test('待发送引用按会话隔离、内容去重，移除不影响其他会话', async (t) => {
  const { vite, m } = await fixture(t)
  const s = await vite
    .ssrLoadModule('/src/renderer/src/lib/workspaceContextDrafts.ts')
    .catch(() => ({}))
  assert.equal(typeof s.WorkspaceContextDrafts, 'function')
  const store = new s.WorkspaceContextDrafts()
  const part = m.createWorkspaceContext('p', source)
  store.add('a', part)
  store.add('a', { ...part, data: { ...part.data, id: 'other' } })
  store.add('b', part)
  assert.equal(store.get('a').length, 1)
  store.remove('a', part.data.id)
  assert.equal(store.get('a').length, 0)
  assert.equal(store.get('b').length, 1)
})

test('转换保留历史快照，生成模型文本并对跨项目引用拒绝', async (t) => {
  const { vite, m } = await fixture(t)
  const mod = await vite
    .ssrLoadModule('/src/main/agent/pi/workspaceContext.ts')
    .catch(() => ({}))
  assert.equal(
    typeof mod.projectWorkspaceMessages,
    'function',
    '需要模型引用转换器',
  )
  const part = m.createWorkspaceContext('p', source, { start: 6, end: 8 })
  const messages = [
    { id: 'u', role: 'user', parts: [{ type: 'text', text: '说明' }, part] },
  ]
  const projected = mod.projectWorkspaceMessages(messages, 'p')
  assert.equal(projected[0].parts[1].type, 'text')
  assert.match(projected[0].parts[1].text, /你好/)
  assert.match(projected[0].parts[1].text, /src\/a.ts/)
  assert.equal(messages[0].parts[1].type, 'data-workspace-context')
  assert.throws(() => mod.projectWorkspaceMessages(messages, 'q'), /工作区/)
  const { validateChatMessages } = await vite.ssrLoadModule(
    '/src/main/workspaces/validateChatMessages.ts',
  )
  assert.equal(
    (await validateChatMessages(messages))[0].parts[1].data.text,
    '你好',
  )
  await assert.rejects(
    validateChatMessages([
      {
        ...messages[0],
        parts: [{ ...part, data: { ...part.data, text: 42 } }],
      },
    ]),
  )
})

test('引用随会话落盘并恢复，切换项目不能伪造引用所属项目', async (t) => {
  const { vite, m } = await fixture(t)
  const { mkdtemp, mkdir, rm } = await import('node:fs/promises')
  const { tmpdir } = await import('node:os')
  const { join } = await import('node:path')
  const root = await mkdtemp(join(tmpdir(), 'sailor-context-'))
  t.after(() => rm(root, { recursive: true, force: true }))
  const projectPath = join(root, 'project')
  await mkdir(projectPath)
  const { WorkspaceStore } = await vite.ssrLoadModule(
    '/src/main/workspaces/WorkspaceStore.ts',
  )
  const { WorkspaceService } = await vite.ssrLoadModule(
    '/src/main/workspaces/WorkspaceService.ts',
  )
  const file = join(root, 'state.json')
  const store = new WorkspaceStore(file)
  const project = await store.addProject(projectPath)
  const chat = await store.createChat(project.id)
  const ref = m.createWorkspaceContext(project.id, source)
  const messages = [{ id: 'u', role: 'user', parts: [ref] }]
  await store.updateChat(chat.id, { messages })
  const service = new WorkspaceService(
    new WorkspaceStore(file),
    async () => null,
  )
  assert.equal(
    (await service.getChat(chat.id)).messages[0].parts[0].data.text,
    source.content,
  )
  const request = {
    chatId: chat.id,
    runId: 'r',
    reasoning: 'provider-default',
    messages,
  }
  assert.equal(
    (await service.validateRequest(request)).messages[0].parts[0].type,
    'data-workspace-context',
  )
  await assert.rejects(
    service.validateRequest({
      ...request,
      messages: [
        {
          ...messages[0],
          parts: [{ ...ref, data: { ...ref.data, projectId: 'other' } }],
        },
      ],
    }),
    /会话消息/,
  )
})
