import assert from 'node:assert/strict'
import { createServer as httpServer } from 'node:http'
import { mkdtemp, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import test from 'node:test'
import { getThreadMessageTokenUsage } from '@assistant-ui/ai-sdk'
import { createServer } from 'vite'
import { createXlsx, createZip } from './helpers/document-fixtures.ts'

async function fixture(t: test.TestContext) {
  const root = await mkdtemp(join(tmpdir(), 'sailor-pi-agent-'))
  t.after(() => rm(root, { recursive: true, force: true }))
  await mkdir(join(root, 'project'))
  const requests: any[] = []
  const replies: any[] = []
  const server = httpServer(async (req, res) => {
    let text = ''
    for await (const chunk of req) text += chunk
    requests.push(JSON.parse(text))
    const reply = replies.shift() ?? { text: '收到' }
    res.writeHead(200, { 'content-type': 'text/event-stream' })
    if (req.url?.endsWith('/responses')) {
      const item = {
        id: 'message-1',
        type: 'message',
        role: 'assistant',
        status: 'completed',
        content: [{ type: 'output_text', text: reply.text, annotations: [] }],
      }
      const response = {
        id: 'response-1',
        object: 'response',
        created_at: 1,
        model: 'fixture',
        status: 'completed',
        output: [item],
        usage: {
          input_tokens: 20,
          output_tokens: 5,
          total_tokens: 25,
          input_tokens_details: { cached_tokens: 0 },
          output_tokens_details: { reasoning_tokens: 0 },
        },
      }
      const event = (value: any) =>
        res.write(`event: ${value.type}\ndata: ${JSON.stringify(value)}\n\n`)
      event({
        type: 'response.created',
        response: { ...response, output: [], status: 'in_progress' },
      })
      event({
        type: 'response.output_item.added',
        output_index: 0,
        item: { ...item, content: [], status: 'in_progress' },
      })
      event({
        type: 'response.content_part.added',
        item_id: item.id,
        output_index: 0,
        content_index: 0,
        part: { type: 'output_text', text: '', annotations: [] },
      })
      event({
        type: 'response.output_text.delta',
        item_id: item.id,
        output_index: 0,
        content_index: 0,
        delta: reply.text,
      })
      event({ type: 'response.output_item.done', output_index: 0, item })
      event({ type: 'response.completed', response })
      res.end()
      return
    }
    const delta = reply.tool
      ? {
          tool_calls: [
            {
              index: 0,
              id: reply.id ?? 'write-1',
              type: 'function',
              function: { name: reply.tool, arguments: JSON.stringify(reply.input) },
            },
          ],
        }
      : { content: reply.text }
    const send = (choices: any[], usage?: any) =>
      res.write(
        `data: ${JSON.stringify({ id: 'completion', object: 'chat.completion.chunk', created: 1, model: 'fixture', choices, usage })}\n\n`,
      )
    send([{ index: 0, delta: { role: 'assistant', ...delta }, finish_reason: null }])
    send([{ index: 0, delta: {}, finish_reason: reply.tool ? 'tool_calls' : 'stop' }])
    send([], {
      prompt_tokens: reply.tokens ?? 20,
      completion_tokens: 5,
      total_tokens: (reply.tokens ?? 20) + 5,
    })
    res.end('data: [DONE]\n\n')
  })
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r))
  t.after(
    () =>
      new Promise<void>((r) => {
        server.closeAllConnections()
        server.close(() => r())
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
  const chat = await workspace.createChat(project.id)
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
  const createAgent = (onEvent?: (runId: string, event: any) => void) =>
    new AgentService(
      (id: string, event: any) => {
        events.push(event)
        onEvent?.(id, event)
      },
      { resolveActiveModel: async () => ({ ...config }) },
      { workspace, piStorageDirectory: join(root, 'pi') },
    )
  const request = async (text: string) => ({
    runId: crypto.randomUUID(),
    chatId: chat.id,
    reasoning: 'provider-default',
    messages: [
      ...(await store.getChat(chat.id)).messages,
      { id: crypto.randomUUID(), role: 'user', parts: [{ type: 'text', text }] },
    ],
  })
  return {
    root,
    store,
    workspace,
    chat,
    config,
    requests,
    replies,
    events,
    createAgent,
    request,
    vite,
  }
}

test(
  '真实 Pi runtime 多轮与重建恢复原生上下文，模型只看到 Pi 原生工具',
  { timeout: 120000 },
  async (t) => {
    const f = await fixture(t)
    const source = await readFile('src/main/agent/AgentService.ts', 'utf8')
    assert.doesNotMatch(source, /new ToolLoopAgent/, '主运行链路需要迁移到 Pi Harness')
    await f.createAgent().start(await f.request('记住项目代号：蓝鲸'))
    assert.equal((await f.store.getChat(f.chat.id)).status, 'completed', JSON.stringify(f.events))
    await f.createAgent().start(await f.request('继续之前的任务'))
    assert.equal((await f.store.getChat(f.chat.id)).status, 'completed', JSON.stringify(f.events))
    assert.equal(f.requests.length, 2)
    for (const path of await readdir(join(f.root, 'pi')))
      assert.doesNotMatch(await readFile(join(f.root, 'pi', path), 'utf8'), /fixture-key/)
    assert.match(JSON.stringify(f.requests[1].messages), /蓝鲸/)
    const names = f.requests[0].tools.map((tool: any) => tool.function.name)
    for (const name of ['read', 'write', 'edit', 'bash', 'grep', 'find', 'ls'])
      assert.ok(names.includes(name), JSON.stringify(names))
    assert.ok(!names.includes('read_file'))
    assert.ok(!names.includes('execute_shell'))
  },
)

test('Pi 拒绝审批不会写文件，重启不能重用旧审批', { timeout: 30000 }, async (t) => {
  const f = await fixture(t)
  const agent = f.createAgent()
  f.replies.push({ tool: 'write', input: { file_path: 'denied.txt', content: 'no' } })
  await agent.start(await f.request('写文件'))
  const approval = f.events.find((e) => e.chunk?.type === 'tool-approval-request')?.chunk
  assert.ok(approval, JSON.stringify(f.events))
  const response = {
    chatId: f.chat.id,
    toolCallId: approval.toolCallId,
    toolName: 'write',
    approvalId: approval.approvalId,
    approved: false,
  }
  assert.throws(() => f.createAgent().respondToApproval(response), /失效|不存在/)
  agent.respondToApproval(response)
  const history = (await f.store.getChat(f.chat.id)).messages
  const part = history.at(-1).parts.find((p: any) => p.toolCallId === approval.toolCallId)
  part.state = 'approval-responded'
  part.approval = { ...part.approval, approved: false }
  await agent.start({
    chatId: f.chat.id,
    runId: crypto.randomUUID(),
    reasoning: 'provider-default',
    messages: history,
  })
  await assert.rejects(readFile(join(f.root, 'project/denied.txt')))
  assert.equal((await f.store.getChat(f.chat.id)).status, 'completed', JSON.stringify(f.events))
})

for (const approved of [true, false]) {
  test(
    `计划在连续两次${approved ? '允许' : '拒绝'}工具审批续跑时始终保留`,
    { timeout: 40000 },
    async (t) => {
      const f = await fixture(t)
      const agent = f.createAgent()
      const plan = {
        revision: 1,
        steps: [{ id: 'work', title: '执行任务', status: 'in-progress' }],
      }
      f.replies.push(
        { tool: 'update_plan', id: 'plan-1', input: plan },
        { tool: 'write', id: 'write-first', input: { file_path: 'plan.txt', content: 'first' } },
      )
      await agent.start(await f.request('创建计划并执行两个需要审批的步骤'))
      assert.deepEqual((await f.workspace.getChat(f.chat.id)).plan, plan)

      const resumedPlans: unknown[] = []
      const beginRun = f.workspace.beginRun.bind(f.workspace)
      f.workspace.beginRun = async (request: unknown) => {
        await beginRun(request)
        const snapshot = await f.workspace.snapshot()
        resumedPlans.push(snapshot.chats.find((chat: any) => chat.id === f.chat.id)?.plan)
      }
      for (const revision of [2, 3]) {
        const approval = f.events.findLast(
          (event) => event.chunk?.type === 'tool-approval-request',
        )?.chunk
        assert.ok(approval)
        agent.respondToApproval({
          chatId: f.chat.id,
          toolCallId: approval.toolCallId,
          toolName: 'write',
          approvalId: approval.approvalId,
          approved,
        })
        const history = (await f.store.getChat(f.chat.id)).messages
        const part = history
          .at(-1)
          .parts.find((part: any) => part.toolCallId === approval.toolCallId)
        part.state = 'approval-responded'
        part.approval = { ...part.approval, approved }
        f.replies.push({
          tool: 'update_plan',
          id: `plan-${revision}`,
          input: {
            ...plan,
            revision,
            steps: [{ ...plan.steps[0], status: revision === 3 ? 'completed' : 'in-progress' }],
          },
        })
        f.replies.push(
          revision === 2
            ? {
                tool: 'write',
                id: 'write-second',
                input: { file_path: 'plan.txt', content: 'second' },
              }
            : { text: '任务完成' },
        )
        await agent.start({
          chatId: f.chat.id,
          runId: crypto.randomUUID(),
          reasoning: 'provider-default',
          messages: history,
        })
        assert.equal(
          (await f.workspace.getChat(f.chat.id)).status,
          'completed',
          JSON.stringify(f.events.filter((event) => event.chunk?.type === 'error')),
        )
      }
      assert.deepEqual(
        resumedPlans,
        [plan, { ...plan, revision: 2 }],
        '审批恢复后的第一个工作区快照必须保留计划，不能先清空再等待模型重新 update_plan',
      )
      assert.equal((await f.store.getChat(f.chat.id)).plan?.revision, 3)
      if (approved) assert.equal(await readFile(join(f.root, 'project/plan.txt'), 'utf8'), 'second')
      else await assert.rejects(readFile(join(f.root, 'project/plan.txt')))
      await agent.start(await f.request('新的独立任务'))
      assert.equal((await f.workspace.getChat(f.chat.id)).plan, undefined)
    },
  )
}

test('停止 Pi 后不继续输出，下一轮可恢复对话', { timeout: 30000 }, async (t) => {
  const f = await fixture(t)
  let aborted = false
  let afterAbort = 0
  const agent = f.createAgent((id, event) => {
    if (event.chunk?.type !== 'text-delta') return
    if (aborted) afterAbort++
    else {
      aborted = true
      agent.abort(id)
    }
  })
  f.replies.push({ text: '第一段回答。第二段回答。第三段回答。' })
  await agent.start(await f.request('输出较长回答'))
  assert.equal(afterAbort, 0)
  assert.equal((await f.store.getChat(f.chat.id)).status, 'stopped')
  await f.createAgent().start(await f.request('继续'))
  assert.equal((await f.store.getChat(f.chat.id)).status, 'completed', JSON.stringify(f.events))
})

test('Pi 原生自动压缩触发并作为可恢复事件输出；Skills 按需读取', { timeout: 30000 }, async (t) => {
  const f = await fixture(t)
  await mkdir(join(f.root, 'project/.agents/skills/review'), { recursive: true })
  await writeFile(
    join(f.root, 'project/.agents/skills/review/SKILL.md'),
    '---\nname: review\ndescription: Review carefully\n---\nCheck tests first.',
  )
  await f.createAgent().start(await f.request('项目代号蓝鲸'))
  await f.createAgent().start(await f.request('背景资料'.repeat(25000)))
  f.replies.push(
    {
      tool: 'read',
      id: 'skill-1',
      input: { file_path: '/home/sailor/.agents/skills/review/SKILL.md' },
    },
    { text: '完成检查', tokens: 31000 },
    { text: '项目摘要：已检查测试。' },
  )
  await f.createAgent().start(await f.request('按 review Skill 检查'))
  assert.equal((await f.store.getChat(f.chat.id)).status, 'completed', JSON.stringify(f.events))
  assert.match(JSON.stringify(f.requests[2].messages), /Review carefully/)
  assert.match(JSON.stringify(f.requests[3].messages), /Check tests first/)
  assert.ok(
    f.events.some((e) => e.chunk?.toolName === 'compaction'),
    JSON.stringify(f.events),
  )
  await f.createAgent().start(await f.request('继续摘要中的任务'))
  assert.equal((await f.store.getChat(f.chat.id)).status, 'completed', JSON.stringify(f.events))
  assert.match(JSON.stringify(f.requests.at(-1).messages), /项目摘要/)
})

test('Pi 写入等待 main 审批，批准后只执行一次并续跑', { timeout: 30000 }, async (t) => {
  const f = await fixture(t)
  const agent = f.createAgent()
  // Some providers omit usage on the approval-producing tool call.
  f.replies.push({ tool: 'write', input: { file_path: 'hello.txt', content: 'hello' }, tokens: 0 })
  await agent.start(await f.request('创建 hello.txt'))
  const approval = f.events.find((e) => e.chunk?.type === 'tool-approval-request')?.chunk
  assert.ok(approval, JSON.stringify(f.events))
  await assert.rejects(readFile(join(f.root, 'project/hello.txt')))
  agent.respondToApproval({
    chatId: f.chat.id,
    toolCallId: approval.toolCallId,
    toolName: 'write',
    approvalId: approval.approvalId,
    approved: true,
  })
  const history = (await f.store.getChat(f.chat.id)).messages
  const part = history.at(-1).parts.find((p: any) => p.toolCallId === approval.toolCallId)
  part.state = 'approval-responded'
  part.approval = { ...part.approval, approved: true }
  f.replies.push({ text: '写入完成', tokens: 222 })
  await agent.start({
    chatId: f.chat.id,
    runId: crypto.randomUUID(),
    reasoning: 'provider-default',
    messages: history,
  })
  assert.equal(
    await readFile(join(f.root, 'project/hello.txt'), 'utf8'),
    'hello',
    JSON.stringify(f.events),
  )
  assert.equal((await f.store.getChat(f.chat.id)).status, 'completed', JSON.stringify(f.events))
  assert.equal((await f.store.getChat(f.chat.id)).messages.at(-1).metadata?.usage?.inputTokens, 222)
  assert.equal(f.requests.length, 2)
  assert.equal((await f.store.getChat(f.chat.id)).messages.at(-1).id, history.at(-1).id)
})

test(
  'Pi 自定义 Responses endpoint 产生流式回答，下一轮可切换模型',
  { timeout: 30000 },
  async (t) => {
    const f = await fixture(t)
    f.config.protocol = 'openai-responses'
    f.replies.push({ text: 'Responses 回答' })
    await f.createAgent().start(await f.request('使用 Responses'))
    assert.equal((await f.store.getChat(f.chat.id)).status, 'completed', JSON.stringify(f.events))
    assert.ok(f.events.some((e) => e.chunk?.type === 'text-delta'))
    f.config.modelId = 'another-model'
    await f.createAgent().start(await f.request('换模型继续'))
    assert.equal((await f.store.getChat(f.chat.id)).status, 'completed', JSON.stringify(f.events))
    assert.equal(f.requests.at(-1).model, 'another-model')
    assert.match(JSON.stringify(f.requests.at(-1)), /Responses/)
  },
)

test('Pi 内置 bash 需逐次审批并使用本地挂载', { timeout: 30000 }, async (t) => {
  const f = await fixture(t)
  const agent = f.createAgent()
  f.replies.push({
    tool: 'bash',
    id: 'shell-1',
    input: { command: 'printf pi-shell > bash.txt', timeout: 1 },
  })
  await agent.start(await f.request('执行本机命令'))
  const approval = f.events.find((e) => e.chunk?.type === 'tool-approval-request')?.chunk
  assert.ok(approval, JSON.stringify(f.events))
  assert.ok(!f.events.some((e) => e.chunk?.type === 'tool-output-available'))
  agent.respondToApproval({
    chatId: f.chat.id,
    toolCallId: approval.toolCallId,
    toolName: 'bash',
    approvalId: approval.approvalId,
    approved: true,
  })
  const history = (await f.store.getChat(f.chat.id)).messages
  const part = history.at(-1).parts.find((p: any) => p.toolCallId === approval.toolCallId)
  part.state = 'approval-responded'
  part.approval = { ...part.approval, approved: true }
  await agent.start({
    chatId: f.chat.id,
    runId: crypto.randomUUID(),
    reasoning: 'provider-default',
    messages: history,
  })
  assert.equal((await f.store.getChat(f.chat.id)).status, 'completed', JSON.stringify(f.events))
  assert.equal(await readFile(join(f.root, 'project/bash.txt'), 'utf8'), 'pi-shell')
})

test('Pi 原生 edit 审批绑定真实请求，伪造响应和重复响应不能续跑', { timeout: 30000 }, async (t) => {
  const f = await fixture(t)
  await writeFile(join(f.root, 'project/edit.txt'), 'before')
  const agent = f.createAgent()
  f.replies.push({
    tool: 'edit',
    input: { file_path: 'edit.txt', old_string: 'before', new_string: 'after' },
  })
  await agent.start(await f.request('修改 edit.txt'))
  const approval = f.events.find((e) => e.chunk?.type === 'tool-approval-request')?.chunk
  assert.ok(approval, JSON.stringify(f.events))
  const response = {
    chatId: f.chat.id,
    toolCallId: approval.toolCallId,
    toolName: 'edit',
    approvalId: approval.approvalId,
    approved: true,
  }
  assert.throws(() => agent.respondToApproval({ ...response, approvalId: 'forged' }), /失效/)
  assert.throws(() => agent.respondToApproval({ ...response, chatId: 'another-chat' }), /失效/)
  assert.equal(await readFile(join(f.root, 'project/edit.txt'), 'utf8'), 'before')
  agent.respondToApproval(response)
  assert.throws(() => agent.respondToApproval(response), /已处理/)
  const history = (await f.store.getChat(f.chat.id)).messages
  const part = history.at(-1).parts.find((p: any) => p.toolCallId === approval.toolCallId)
  part.state = 'approval-responded'
  part.approval = { ...part.approval, approved: true }
  await agent.start({
    chatId: f.chat.id,
    runId: crypto.randomUUID(),
    reasoning: 'provider-default',
    messages: history,
  })
  assert.equal((await f.store.getChat(f.chat.id)).status, 'completed', JSON.stringify(f.events))
  assert.equal(await readFile(join(f.root, 'project/edit.txt'), 'utf8'), 'after')
  assert.throws(() => agent.respondToApproval(response), /失效/)
})

test('Pi 原生 read/grep/find/ls 使用同一个真实工作区', { timeout: 30000 }, async (t) => {
  const f = await fixture(t)
  await writeFile(join(f.root, 'project/needle.txt'), 'native-search-needle')
  const agent = f.createAgent()
  for (const [tool, input] of [
    ['read', { file_path: 'needle.txt' }],
    ['grep', { pattern: 'native-search-needle', path: '.' }],
    ['find', { pattern: '*.txt', path: '.' }],
    ['ls', { path: '.' }],
  ] as const) {
    f.events.length = 0
    f.replies.push({ tool, id: `native-${tool}`, input }, { text: 'done' })
    await agent.start(await f.request(`使用 ${tool}`))
    assert.equal((await f.store.getChat(f.chat.id)).status, 'completed', JSON.stringify(f.events))
    assert.ok(
      !f.events.some((e) => e.chunk?.type === 'tool-output-error'),
      JSON.stringify(f.events),
    )
    assert.match(JSON.stringify(f.requests.at(-1).messages), /native-search-needle|needle.txt/)
  }
})

test(
  'Pi 每步真实用量通过消息 metadata 传给 UI 并保存，后续调用不累计历史',
  { timeout: 30000 },
  async (t) => {
    const f = await fixture(t)
    f.replies.push({ text: '第一轮', tokens: 100 }, { text: '第二轮', tokens: 200 })
    await f.createAgent().start(await f.request('第一轮'))
    let message = (await f.store.getChat(f.chat.id)).messages.at(-1)
    assert.ok(
      message.metadata,
      JSON.stringify(f.events.filter((e: any) => e.chunk?.type === 'message-metadata')),
    )
    // 总量走官方形状：主进程写出的 metadata 必须能被 @assistant-ui/ai-sdk 的官方提取器直接消费。
    assert.deepEqual(message.metadata.usage, {
      inputTokens: 100,
      outputTokens: 5,
      totalTokens: 105,
    })
    assert.deepEqual(
      getThreadMessageTokenUsage({ role: 'assistant', metadata: message.metadata }),
      { inputTokens: 100, outputTokens: 5, totalTokens: 105 },
    )
    // 官方没有的部分：窗口上限 + 本轮真实 payload 的分类测量。
    const { payload, ...extras } = message.metadata.contextUsage
    assert.deepEqual(extras, { contextWindow: 32768, modelId: 'fixture' })
    const { SAILOR_INSTRUCTIONS } = await f.vite.ssrLoadModule('/src/main/agent/pi/PiRunner.ts')
    assert.equal(payload.systemChars, SAILOR_INSTRUCTIONS.length)
    assert.match(
      JSON.stringify(f.requests[0]),
      new RegExp(SAILOR_INSTRUCTIONS.slice(0, 40).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')),
    )
    assert.equal(payload.conversationChars, '第一轮'.length)
    assert.equal(payload.attachmentChars, 0)
    assert.equal(payload.images, 0)
    assert.ok(payload.toolChars > 0, JSON.stringify(payload))
    await f.createAgent().start(await f.request('第二轮'))
    message = (await f.store.getChat(f.chat.id)).messages.at(-1)
    assert.equal(message.metadata.usage.inputTokens, 200)
  },
)

test('同一会话切换视觉模型后图片实际送达 provider', { timeout: 30000 }, async (t) => {
  const f = await fixture(t)
  const agent = f.createAgent()
  await agent.start(await f.request('记住蓝鲸'))
  f.config.modelId = 'vision-model'
  Object.assign(f.config, { vision: true })
  const request = await f.request('这是什么图片？')
  const image =
    'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII='
  request.messages.at(-1).parts.push({ type: 'file', mediaType: 'image/png', url: image })
  await agent.start(request)
  assert.equal(
    (await f.store.getChat(f.chat.id)).status,
    'completed',
    JSON.stringify(f.events.filter((e) => e.chunk?.type === 'error')),
  )
  assert.equal(f.requests.at(-1).model, 'vision-model')
  assert.match(JSON.stringify(f.requests.at(-1).messages), /image_url/)
  assert.match(JSON.stringify(f.requests.at(-1).messages), /iVBOR/)
  await f.createAgent().start(await f.request('继续描述刚才的图片'))
  assert.equal((await f.store.getChat(f.chat.id)).status, 'completed')
  assert.match(JSON.stringify(f.requests.at(-1).messages), /iVBOR/, '重建后原生日志保留图片')
})

test('非视觉模型发送图片返回明确提示且不发模型请求', { timeout: 30000 }, async (t) => {
  const f = await fixture(t)
  const request = await f.request('看图片')
  request.messages
    .at(-1)
    .parts.push({ type: 'file', mediaType: 'image/png', url: 'data:image/png;base64,AA==' })
  await f.createAgent().start(request)
  assert.equal(f.requests.length, 0)
  assert.match(f.events.find((e) => e.chunk?.type === 'error').chunk.errorText, /视觉能力/)
})

test('非图片附件返回明确提示且不发模型请求', { timeout: 30000 }, async (t) => {
  const f = await fixture(t)
  Object.assign(f.config, { vision: true })
  const request = await f.request('看看这个演示文稿')
  request.messages.at(-1).parts.push({
    type: 'file',
    mediaType: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    filename: 'deck.pptx',
    url: `data:application/vnd.openxmlformats-officedocument.presentationml.presentation;base64,${createZip([{ name: 'ppt/presentation.xml', data: '<p/>' }]).toString('base64')}`,
  })
  await f.createAgent().start(request)
  assert.equal(f.requests.length, 0)
  const errorText = f.events.find((e) => e.chunk?.type === 'error').chunk.errorText
  assert.match(errorText, /deck\.pptx/, '提示必须点名被拒绝的附件')
  assert.match(errorText, /xlsx\/xlsm、docx、pdf、csv\/tsv/, '提示必须说明当前支持的类型')
  assert.doesNotMatch(errorText, /图片附件格式无效/, '非图片附件不能报成图片格式错误')
})

test('不支持的图片类型返回明确提示且不发模型请求', { timeout: 30000 }, async (t) => {
  const f = await fixture(t)
  Object.assign(f.config, { vision: true })
  const request = await f.request('看看这张图')
  request.messages.at(-1).parts.push({
    type: 'file',
    mediaType: 'image/svg+xml',
    filename: 'icon.svg',
    url: 'data:image/svg+xml;base64,PHN2Zy8+',
  })
  await f.createAgent().start(request)
  assert.equal(f.requests.length, 0)
  const errorText = f.events.find((e) => e.chunk?.type === 'error').chunk.errorText
  assert.match(errorText, /image\/svg\+xml/, '提示必须说明不支持的图片子类型')
  assert.match(errorText, /PNG、JPEG、WebP/, '提示必须说明可转换的目标类型')
})

test('非法图片数据返回明确提示且不发模型请求', { timeout: 30000 }, async (t) => {
  const f = await fixture(t)
  Object.assign(f.config, { vision: true })
  const request = await f.request('看看这张图')
  request.messages.at(-1).parts.push({
    type: 'file',
    mediaType: 'image/png',
    filename: 'screenshot.png',
    url: 'https://example.com/screenshot.png',
  })
  await f.createAgent().start(request)
  assert.equal(f.requests.length, 0)
  const errorText = f.events.find((e) => e.chunk?.type === 'error').chunk.errorText
  assert.match(errorText, /screenshot\.png/, '提示必须点名被拒绝的附件')
  assert.match(errorText, /数据无效/, '必须区分「数据无效」与「类型不支持」')
})

const xlsxDataUrl = `data:application/vnd.openxmlformats-officedocument.spreadsheetml.sheet;base64,${createXlsx().toString('base64')}`

test('文档附件写入会话 VFS 并在本轮 prompt 中列出绝对路径', { timeout: 30000 }, async (t) => {
  const f = await fixture(t)
  const request = await f.request('看看这个表格')
  request.messages.at(-1).parts.push({
    type: 'file',
    mediaType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    filename: 'sales.xlsx',
    url: xlsxDataUrl,
  })
  await f.createAgent().start(request)
  assert.equal((await f.store.getChat(f.chat.id)).status, 'completed', JSON.stringify(f.events))
  const body = JSON.stringify(f.requests.at(-1).messages)
  assert.match(body, /\/home\/sailor\/attachments\//, 'prompt 必须给出附件在会话 VFS 中的绝对路径')
  assert.match(body, /sales\.xlsx/, 'prompt 必须点名附件')
  assert.match(body, /read_document/, 'prompt 必须提示用 read_document 读取')
  assert.doesNotMatch(body, /base64/, '附件正文不能整段塞进 prompt')
})

test('read_document 读取上传的 xlsx 附件并返回解析结果', { timeout: 30000 }, async (t) => {
  const f = await fixture(t)
  const attachmentPath = `/home/sailor/attachments/${f.chat.id}/sales.xlsx`
  f.replies.push(
    { tool: 'read_document', id: 'rd-1', input: { path: attachmentPath } },
    { text: '表格看完了' },
  )
  const request = await f.request('看看这个表格')
  request.messages.at(-1).parts.push({
    type: 'file',
    mediaType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    filename: 'sales.xlsx',
    url: xlsxDataUrl,
  })
  await f.createAgent().start(request)
  assert.equal((await f.store.getChat(f.chat.id)).status, 'completed', JSON.stringify(f.events))
  const names = f.requests[0].tools.map((tool: any) => tool.function.name)
  assert.ok(
    names.includes('read_document'),
    `read_document 必须注册给模型: ${JSON.stringify(names)}`,
  )

  const toolResult = JSON.stringify(f.requests.at(-1).messages)
  assert.match(toolResult, /Summary/, '工具结果必须带上 sheet 名')
  assert.match(toolResult, /Widget/, '工具结果必须带上解析出的行')
  assert.doesNotMatch(toolResult, /PARSE_FAILED|UNSUPPORTED_TYPE/, '上传的附件必须被成功解析')
})
