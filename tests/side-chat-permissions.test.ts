import assert from 'node:assert/strict'
import { createServer as createHttpServer } from 'node:http'
import { mkdtemp, mkdir, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import test from 'node:test'
import { createServer } from 'vite'

test('侧聊只暴露只读工具且没有可伪造的写入审批', { timeout: 30000 }, async (t) => {
  const root = await mkdtemp(join(tmpdir(), 'sailor-side-tools-'))
  t.after(() => rm(root, { recursive: true, force: true }))
  await mkdir(join(root, 'project'))
  const requests: any[] = []
  const server = createHttpServer(async (req, res) => {
    let body = ''
    for await (const chunk of req) body += chunk
    requests.push(JSON.parse(body))
    res.writeHead(200, { 'content-type': 'text/event-stream' })
    const send = (choices: any[], usage?: any) =>
      res.write(
        `data: ${JSON.stringify({ id: 'side-tools', object: 'chat.completion.chunk', created: 1, model: 'fixture', choices, usage })}\n\n`,
      )
    send([{ index: 0, delta: { role: 'assistant', content: '只读回答' }, finish_reason: null }])
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
      { id: 'u1', role: 'user', parts: [{ type: 'text', text: '介绍项目' }] },
      { id: 'a1', role: 'assistant', parts: [{ type: 'text', text: '项目说明' }] },
    ],
  })
  const side = await workspace.createSideChat(parent.id)
  const events: any[] = []
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
  const agent = new AgentService(
    (_id: string, event: any) => events.push(event),
    { resolveActiveModel: async () => config },
    { workspace, piStorageDirectory: join(root, 'pi') },
  )
  await agent.start({
    chatId: side.id,
    runId: crypto.randomUUID(),
    reasoning: 'provider-default',
    messages: [{ id: 'side-u', role: 'user', parts: [{ type: 'text', text: '只读检查' }] }],
  })
  assert.equal((await store.getChat(side.id)).status, 'completed', JSON.stringify(events))
  const names = requests[0].tools.map((tool: any) => tool.function.name)
  for (const name of ['read', 'grep', 'find', 'ls'])
    assert.ok(names.includes(name), JSON.stringify(names))
  for (const name of ['write', 'edit', 'bash'])
    assert.ok(!names.includes(name), JSON.stringify(names))
  assert.throws(
    () =>
      agent.respondToApproval({
        chatId: side.id,
        approvalId: 'forged',
        toolCallId: 'call',
        toolName: 'write',
        approved: true,
      }),
    /审批.*不存在|失效/,
  )
  assert.ok(!events.some((event) => event.chunk?.type === 'tool-approval-request'))
})
