import assert from 'node:assert/strict'
import { createServer as createHttpServer } from 'node:http'
import { mkdtemp, mkdir, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import test from 'node:test'
import { createServer } from 'vite'

test('侧聊首轮继承冻结文本，重启后独立续聊且不回写主会话', { timeout: 30000 }, async (t) => {
  const root = await mkdtemp(join(tmpdir(), 'sailor-side-agent-'))
  t.after(() => rm(root, { recursive: true, force: true }))
  await mkdir(join(root, 'project'))
  const requests: any[] = []
  const responses = ['侧聊第一答', '侧聊第二答']
  const server = createHttpServer(async (req, res) => {
    let body = ''
    for await (const chunk of req) body += chunk
    requests.push(JSON.parse(body))
    const answer = responses.shift() ?? '结束'
    res.writeHead(200, { 'content-type': 'text/event-stream' })
    const send = (choices: any[], usage?: any) =>
      res.write(
        `data: ${JSON.stringify({ id: 'side-fixture', object: 'chat.completion.chunk', created: 1, model: 'fixture', choices, usage })}\n\n`,
      )
    send([{ index: 0, delta: { role: 'assistant', content: answer }, finish_reason: null }])
    send([{ index: 0, delta: {}, finish_reason: 'stop' }])
    send([], { prompt_tokens: 20, completion_tokens: 5, total_tokens: 25 })
    res.end('data: [DONE]\n\n')
  })
  await new Promise<void>((done) => server.listen(0, '127.0.0.1', done))
  t.after(
    () =>
      new Promise<void>((done) => {
        server.closeAllConnections()
        server.close(() => done())
      }),
  )
  const vite = await createServer({
    logLevel: 'silent',
    server: { middlewareMode: true },
    resolve: { alias: { '@shared': resolve('src/shared') } },
  })
  t.after(() => vite.close())
  const { WorkspaceStore } = await vite.ssrLoadModule('/src/main/workspaces/WorkspaceStore.ts')
  const { WorkspaceService } = await vite.ssrLoadModule('/src/main/workspaces/WorkspaceService.ts')
  const { AgentService } = await vite.ssrLoadModule('/src/main/agent/AgentService.ts')
  const store = new WorkspaceStore(join(root, 'workspaces.json'))
  const workspace = new WorkspaceService(store, async () => join(root, 'project'))
  const project = await workspace.pickProject()
  const parent = await workspace.createChat(project.id)
  await store.updateChat(parent.id, {
    status: 'completed',
    messages: [
      { id: 'main-u', role: 'user', parts: [{ type: 'text', text: '项目代号是什么？' }] },
      { id: 'main-a', role: 'assistant', parts: [{ type: 'text', text: '主会话代号：北极星' }] },
    ],
  })
  assert.equal(typeof workspace.createSideChat, 'function')
  const side = await workspace.createSideChat(parent.id)
  const parentBefore = await store.getChat(parent.id)
  const config = {
    providerId: 'fixture',
    providerName: 'Fixture',
    modelId: 'fixture',
    apiKey: 'fixture-key',
    baseUrl: `http://127.0.0.1:${(server.address() as any).port}/v1`,
    protocol: 'openai-completions',
    reasoningLevels: [],
    contextWindow: 32768,
    maxOutputTokens: 1024,
  }
  const events: any[] = []
  const agent = () =>
    new AgentService(
      (_id: string, event: any) => events.push(event),
      { resolveActiveModel: async () => config },
      { workspace, piStorageDirectory: join(root, 'pi') },
    )
  const request = async (text: string, quote?: { text: string; messageId: string }) => ({
    chatId: side.id,
    runId: crypto.randomUUID(),
    reasoning: 'provider-default',
    messages: [
      ...(await store.getChat(side.id)).messages,
      {
        id: crypto.randomUUID(),
        role: 'user',
        ...(quote ? { metadata: { custom: { quote } } } : {}),
        parts: [{ type: 'text', text }],
      },
    ],
  })

  await agent().start(
    await request('顺便解释项目目标', { text: '主会话代号：北极星', messageId: 'main-a' }),
  )
  assert.equal((await store.getChat(side.id)).status, 'completed', JSON.stringify(events))
  assert.match(JSON.stringify(requests[0].messages), /北极星/, '首轮必须看到主会话快照')
  assert.match(
    JSON.stringify(requests[0].messages),
    /> 主会话代号：北极星/,
    '选区引用应进入侧聊模型请求',
  )
  assert.equal(
    (await store.getChat(side.id)).messages[0].metadata.custom.quote.messageId,
    'main-a',
    '侧聊历史应保留引用来源',
  )
  assert.deepEqual(await store.getChat(parent.id), parentBefore, '侧聊运行不得更改主会话记录')

  await agent().start(await request('继续说说刚才的回答'))
  assert.equal((await store.getChat(side.id)).status, 'completed', JSON.stringify(events))
  assert.match(
    JSON.stringify(requests[1].messages),
    /侧聊第一答/,
    '新 AgentService 应恢复侧聊原生上下文',
  )
  assert.match(JSON.stringify(requests[1].messages), /顺便解释项目目标/)
  assert.deepEqual(await store.getChat(parent.id), parentBefore)
})

test('侧聊首轮模型请求包含主会话图片像素', { timeout: 30000 }, async (t) => {
  const root = await mkdtemp(join(tmpdir(), 'sailor-side-image-'))
  t.after(() => rm(root, { recursive: true, force: true }))
  await mkdir(join(root, 'project'))
  const requests: any[] = []
  const server = createHttpServer(async (req, res) => {
    let body = ''
    for await (const chunk of req) body += chunk
    requests.push(JSON.parse(body))
    res.writeHead(200, { 'content-type': 'text/event-stream' })
    res.write(
      `data: ${JSON.stringify({ id: 'side-image', object: 'chat.completion.chunk', created: 1, model: 'fixture', choices: [{ index: 0, delta: { role: 'assistant', content: '看到了图片' }, finish_reason: 'stop' }] })}\n\n`,
    )
    res.end('data: [DONE]\n\n')
  })
  await new Promise<void>((done) => server.listen(0, '127.0.0.1', done))
  t.after(
    () =>
      new Promise<void>((done) => {
        server.closeAllConnections()
        server.close(() => done())
      }),
  )
  const vite = await createServer({
    logLevel: 'silent',
    server: { middlewareMode: true },
    resolve: { alias: { '@shared': resolve('src/shared') } },
  })
  t.after(() => vite.close())
  const { WorkspaceStore } = await vite.ssrLoadModule('/src/main/workspaces/WorkspaceStore.ts')
  const { WorkspaceService } = await vite.ssrLoadModule('/src/main/workspaces/WorkspaceService.ts')
  const { AgentService } = await vite.ssrLoadModule('/src/main/agent/AgentService.ts')
  const { PiStorage } = await vite.ssrLoadModule('/src/main/agent/pi/PiStorage.ts')
  const store = new WorkspaceStore(join(root, 'workspaces.json'))
  const storage = new PiStorage(join(root, 'pi'))
  const workspace = new WorkspaceService(
    store,
    async () => join(root, 'project'),
    () => {},
    (parentId: string, sideId: string) => storage.fork(parentId, sideId),
  )
  const project = await workspace.pickProject()
  const parent = await workspace.createChat(project.id)
  const image =
    'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII='
  const config = {
    providerId: 'fixture',
    providerName: 'Fixture',
    modelId: 'fixture',
    apiKey: 'fixture-key',
    baseUrl: `http://127.0.0.1:${(server.address() as any).port}/v1`,
    protocol: 'openai-completions',
    reasoningLevels: [],
    contextWindow: 32768,
    maxOutputTokens: 1024,
    vision: true,
  }
  const agent = new AgentService(
    () => {},
    { resolveActiveModel: async () => config },
    { workspace, piStorageDirectory: join(root, 'pi') },
  )
  await agent.start({
    chatId: parent.id,
    runId: crypto.randomUUID(),
    reasoning: 'provider-default',
    messages: [
      {
        id: 'u1',
        role: 'user',
        parts: [
          { type: 'text', text: '这是什么？' },
          { type: 'file', mediaType: 'image/png', url: image },
        ],
      },
    ],
  })
  assert.equal((await store.getChat(parent.id)).status, 'completed')
  const side = await workspace.createSideChat(parent.id)
  const parentBefore = await store.getChat(parent.id)
  await agent.start({
    chatId: side.id,
    runId: crypto.randomUUID(),
    reasoning: 'provider-default',
    messages: [{ id: 'side-u', role: 'user', parts: [{ type: 'text', text: '再看看这张图片' }] }],
  })
  assert.match(
    JSON.stringify(requests[1]?.messages),
    /image_url/,
    '侧聊模型请求必须收到主会话图像内容',
  )
  assert.match(
    JSON.stringify(requests[1]?.messages),
    /iVBORw0KGgo/,
    '侧聊模型请求必须包含主会话图像字节',
  )
  assert.deepEqual(await store.getChat(parent.id), parentBefore, '侧聊运行不得回写主会话')
  const resumed = new AgentService(
    () => {},
    { resolveActiveModel: async () => config },
    { workspace, piStorageDirectory: join(root, 'pi') },
  )
  await resumed.start({
    chatId: side.id,
    runId: crypto.randomUUID(),
    reasoning: 'provider-default',
    messages: [
      ...(await store.getChat(side.id)).messages,
      { id: 'side-u2', role: 'user', parts: [{ type: 'text', text: '继续描述图片' }] },
    ],
  })
  assert.match(JSON.stringify(requests[2]?.messages), /iVBORw0KGgo/, '重启续聊仍应持有主会话图像')
  assert.match(JSON.stringify(requests[2]?.messages), /再看看这张图片/, '侧聊续接自己的历史')
  await resumed.start({
    chatId: parent.id,
    runId: crypto.randomUUID(),
    reasoning: 'provider-default',
    messages: [
      ...(await store.getChat(parent.id)).messages,
      { id: 'main-u2', role: 'user', parts: [{ type: 'text', text: '再说一句' }] },
    ],
  })
  assert.doesNotMatch(
    JSON.stringify(requests[3]?.messages),
    /再看看这张图片/,
    '主会话不得读到侧聊的提问',
  )
})
