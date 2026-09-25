import { createModelRunner } from './helpers/model-runner.ts'
import assert from 'node:assert/strict'
import { mkdtemp, mkdir, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import test from 'node:test'
import { createServer } from 'vite'
import { MockLanguageModelV4 } from 'ai/test'
import { simulateReadableStream } from 'ai'

const finish = {
  type: 'finish',
  finishReason: { unified: 'stop', raw: undefined },
  usage: { inputTokens: { total: 1 }, outputTokens: { total: 2 } },
}
async function fixture(t: test.TestContext) {
  const dir = await mkdtemp(join(tmpdir(), 'sailor-runs-'))
  t.after(() => rm(dir, { recursive: true, force: true }))
  const vite = await createServer({
    logLevel: 'silent',
    server: { middlewareMode: true },
    resolve: { alias: { '@shared': resolve('src/shared'), '@': resolve('src/renderer/src') } },
  })
  t.after(() => vite.close())
  const { WorkspaceService } = await vite.ssrLoadModule('/src/main/workspaces/WorkspaceService.ts')
  const { WorkspaceStore } = await vite.ssrLoadModule('/src/main/workspaces/WorkspaceStore.ts')
  const { AgentService } = await vite.ssrLoadModule('/src/main/agent/AgentService.ts')
  const store = new WorkspaceStore(join(dir, 'state.json'))
  const workspace = new WorkspaceService(store, async () => dir)
  const p = await store.addProject(dir)
  await mkdir(join(dir, 'other'))
  const q = await store.addProject(join(dir, 'other'))
  const a = await store.createChat(p.id),
    b = await store.createChat(q.id),
    c = await store.createChat(p.id)
  const events: any[] = []
  let abortFirst = false
  const configs: string[] = []
  let modelId = 'first'
  const agent = new AgentService(
    (runId: string, event: any) => {
      events.push({ runId, event })
      if (
        abortFirst &&
        runId === 'a' &&
        event.type === 'chunk' &&
        event.chunk.type === 'text-delta'
      )
        agent.abort('a')
    },
    {
      resolveActiveModel: async () => ({
        providerId: 'test',
        providerName: 'test',
        baseUrl: 'http://localhost',
        protocol: 'openai-completions',
        apiKey: 'fixture',
        modelId,
        reasoningLevels: [],
      }),
    },
    {
      workspace,
      runner: createModelRunner((config: any) => {
        configs.push(config.modelId)
        return new MockLanguageModelV4({
          doStream: async () => ({
            stream: simulateReadableStream({
              chunkDelayInMs: 25,
              chunks: [
                { type: 'text-start', id: 'text' },
                { type: 'text-delta', id: 'text', delta: '一' },
                { type: 'text-delta', id: 'text', delta: '二' },
                { type: 'text-end', id: 'text' },
                finish,
              ] as any,
            }),
          }),
        })
      }),
    },
  )
  const request = (id: string, runId: string) => ({
    chatId: id,
    runId,
    reasoning: 'provider-default',
    messages: [{ id: `u-${runId}`, role: 'user', parts: [{ type: 'text', text: runId }] }],
  })
  return {
    dir,
    vite,
    store,
    workspace,
    agent,
    a,
    b,
    c,
    events,
    request,
    configs,
    setModel: () => {
      modelId = 'second'
    },
    abortFirst: () => {
      abortFirst = true
    },
  }
}

test('同/跨工作区并行，切换不终止，后台保存完整输出和未读状态', async (t) => {
  const { agent, workspace, store, a, b, c, request, setModel, configs } = await fixture(t)
  const first = agent.start(request(a.id, 'a'))
  setModel()
  await workspace.setPreferences({ activeChatId: b.id })
  await Promise.all([first, agent.start(request(b.id, 'b')), agent.start(request(c.id, 'c'))])
  for (const chat of [a, b, c]) {
    const saved = await store.getChat(chat.id)
    assert.equal(saved.status, 'completed', '运行应由主进程保存完成状态')
    assert.equal(
      saved.messages
        .at(-1)
        .parts.filter((p: any) => p.type === 'text')
        .map((p: any) => p.text)
        .join(''),
      '一二',
    )
  }
  assert.equal((await workspace.snapshot()).chats.find((x: any) => x.id === a.id).unread, true)
  await workspace.setPreferences({ activeChatId: a.id })
  assert.equal((await workspace.snapshot()).chats.find((x: any) => x.id === a.id).unread, false)
  assert.deepEqual(configs.sort(), ['first', 'second', 'second'])
})

test('同会话重复提交被拒绝；停止一个不会停止另一个并保留部分输出', async (t) => {
  const { agent, store, a, b, request, abortFirst } = await fixture(t)
  abortFirst()
  const first = agent.start(request(a.id, 'a'))
  await assert.rejects(agent.start(request(a.id, 'duplicate')), /运行/)
  await Promise.all([first, agent.start(request(b.id, 'b'))])
  assert.equal((await store.getChat(a.id)).status, 'stopped')
  assert.equal((await store.getChat(b.id)).status, 'completed')
  assert.equal(
    (await store.getChat(a.id)).messages
      .at(-1)
      .parts.filter((p: any) => p.type === 'text')
      .map((p: any) => p.text)
      .join(''),
    '一',
  )
})

test('停止等待运行落盘后即可立即管理会话', async (t) => {
  const { agent, workspace, a, request } = await fixture(t)
  const running = agent.start(request(a.id, 'a'))
  await new Promise((resolve) => setTimeout(resolve, 10))
  await agent.abort('a')
  assert.equal((await workspace.getChat(a.id)).status, 'stopped')
  await workspace.manageChat(a.id, { action: 'delete' })
  await running
  await assert.rejects(workspace.getChat(a.id), /不存在/)
})

test('保存失败保留内存消息与错误，可重试且不影响另一会话', async (t) => {
  const { workspace, store, a, b, request } = await fixture(t)
  assert.equal(typeof workspace.beginRun, 'function', '需要独立运行生命周期')
  await workspace.beginRun(request(a.id, 'a'))
  const original = store.updateChat.bind(store)
  store.updateChat = async (id: string, ...args: any[]) => {
    if (id === a.id) throw new Error('disk full')
    return original(id, ...args)
  }
  const messages = [
    ...request(a.id, 'a').messages,
    { id: 'answer', role: 'assistant', parts: [{ type: 'text', text: '已生成' }] },
  ]
  await workspace.updateRun(a.id, 'a', messages)
  await workspace.finishRun(a.id, 'a', 'completed')
  assert.match((await workspace.getChat(a.id)).saveError, /保存/)
  assert.equal((await workspace.getChat(a.id)).messages.length, 2)
  await workspace.beginRun(request(b.id, 'b'))
  await workspace.finishRun(b.id, 'b', 'completed')
  assert.equal((await store.getChat(b.id)).status, 'completed')
  store.updateChat = original
  await workspace.retrySave(a.id)
  assert.equal((await workspace.getChat(a.id)).saveError, undefined)
  assert.equal((await store.getChat(a.id)).messages.length, 2)
  await workspace.updateRun(a.id, 'old', [])
  assert.equal((await workspace.getChat(a.id)).messages.length, 2)
})

test('renderer 实例跨视图保留，快速切换只采用最后一次选择', async (t) => {
  const { vite } = await fixture(t)
  const mod = await vite.ssrLoadModule('/src/renderer/src/lib/WorkspaceChats.ts').catch(() => ({}))
  assert.equal(typeof mod.WorkspaceChats, 'function', '需要独立于视图的 Chat 实例注册表')
  let resolveA: (value: any) => void = () => {}
  const api = {
    getChat: (id: string) =>
      id === 'a'
        ? new Promise((r) => {
            resolveA = r
          })
        : Promise.resolve({ id, messages: [] }),
    setPreferences: async () => {},
  }
  const chats = new mod.WorkspaceChats(api)
  const a = chats.select('a')
  const b = chats.select('b')
  await b
  resolveA({ id: 'a', messages: [] })
  await a
  assert.equal(chats.activeId, 'b')
  const instance = await chats.get('b')
  assert.equal(await chats.get('b'), instance)
})

test('计划投影跨会话切换保留同一运行的最后有效快照，新运行会清除旧计划', async (t) => {
  const { vite } = await fixture(t)
  const { WorkspaceChats } = await vite.ssrLoadModule('/src/renderer/src/lib/WorkspaceChats.ts')
  const chats = new WorkspaceChats({
    getChat: async (id: string) => ({ id, messages: [] }),
    setPreferences: async () => {},
  })
  const plan = {
    revision: 2,
    steps: [{ id: 'inspect', title: '检查现状', status: 'in-progress' as const }],
  }
  chats.rememberPlanSnapshots([{ id: 'a', runId: 'run-a', plan } as any])
  chats.rememberPlanSnapshots([{ id: 'a', runId: 'run-a' } as any])
  assert.deepEqual(chats.getStablePlan({ id: 'a', runId: 'run-a' } as any), plan)
  chats.rememberPlanSnapshots([{ id: 'a', runId: 'run-b' } as any])
  assert.equal(chats.getStablePlan({ id: 'a', runId: 'run-b' } as any), undefined)
})

test('取消后的未完成工具 parts 保留历史且可安全续聊', async (t) => {
  const { agent, workspace, store, a, request } = await fixture(t)
  const history = [
    ...request(a.id, 'old').messages,
    {
      id: 'partial',
      role: 'assistant',
      parts: [
        {
          type: 'tool-updatePlan',
          toolCallId: 'unfinished',
          state: 'input-streaming',
          input: undefined,
        },
      ],
    },
  ]
  await store.updateChat(a.id, { messages: history, status: 'stopped' })
  const restored = await workspace.getChat(a.id)
  assert.equal(restored.messages[1].parts[0].state, 'input-streaming')
  assert.equal(restored.messages[1].parts[0].type, 'dynamic-tool')
  assert.equal(restored.messages[1].parts[0].toolName, 'updatePlan')
  await agent.start({
    ...request(a.id, 'new'),
    messages: [...restored.messages, ...request(a.id, 'new').messages],
  })
  assert.equal((await store.getChat(a.id)).status, 'completed')
  assert.equal((await store.getChat(a.id)).messages[1].parts[0].state, 'input-streaming')
})

test('恢复中断运行不自动调用模型，运行前异常仍释放会话锁', async (t) => {
  const { agent, workspace, store, a, request, configs } = await fixture(t)
  await store.updateChat(a.id, { status: 'running', runId: 'interrupted' })
  assert.equal((await workspace.getChat(a.id)).status, 'stopped')
  assert.equal(configs.length, 0)
  await agent.start({ ...request(a.id, 'bad'), messages: [] })
  await agent.start(request(a.id, 'good'))
  assert.equal((await store.getChat(a.id)).status, 'completed')
})

test('切换视图不等待偏好写盘，偏好失败不会阻止访问其他会话', async (t) => {
  const { vite } = await fixture(t)
  const { WorkspaceChats } = await vite.ssrLoadModule('/src/renderer/src/lib/WorkspaceChats.ts')
  const errors: unknown[] = []
  let rejectSave: (error: Error) => void = () => {}
  const api = {
    getChat: async (id: string) => ({ id, messages: [] }),
    setPreferences: () =>
      new Promise((_resolve, reject) => {
        rejectSave = reject
      }),
  }
  const registry = new WorkspaceChats(api, (error: unknown) => errors.push(error))
  const pending = registry.select('other')
  const selected = await Promise.race([
    pending,
    new Promise((resolve) => setTimeout(() => resolve('waiting-for-disk'), 50)),
  ])
  // Settle the injected write before asserting, so a Red failure leaves no hanging promise.
  rejectSave(new Error('偏好保存失败'))
  await pending.catch(() => undefined)
  await new Promise((resolve) => setTimeout(resolve, 0))
  assert.notEqual(selected, 'waiting-for-disk')
  assert.equal(selected.id, 'other')
  assert.equal(errors.length, 1)
})

test('已删除工具的成功历史可恢复且不会重新执行', async (t) => {
  const { agent, workspace, store, a, request, configs } = await fixture(t)
  const output = { title: '旧计划', steps: [{ id: 'one', text: '保留记录', status: 'completed' }] }
  await store.updateChat(a.id, {
    messages: [
      ...request(a.id, 'old').messages,
      {
        id: 'old-plan',
        role: 'assistant',
        parts: [
          {
            type: 'tool-updatePlan',
            toolCallId: 'old-call',
            state: 'output-available',
            input: output,
            output,
          },
        ],
      },
    ],
  })
  const restored = await workspace.getChat(a.id)
  assert.equal(configs.length, 0)
  assert.equal(restored.messages[1].parts[0].type, 'dynamic-tool')
  assert.deepEqual(restored.messages[1].parts[0].output, output)
  await agent.start({
    ...request(a.id, 'continue'),
    messages: [...restored.messages, ...request(a.id, 'continue').messages],
  })
  assert.equal((await store.getChat(a.id)).status, 'completed')
})

test('新一轮运行开始时清除上一轮的计划投影', async (t) => {
  const { workspace, store, a, request } = await fixture(t)
  await workspace.beginRun(request(a.id, 'first'))
  await workspace.updatePlan(a.id, 'first', {
    revision: 1,
    steps: [{ id: 'read', title: '阅读代码', status: 'completed' }],
  })
  await workspace.finishRun(a.id, 'first', 'completed')
  assert.ok((await store.getChat(a.id)).plan)

  await workspace.beginRun(request(a.id, 'second'))
  assert.equal((await workspace.getChat(a.id)).plan, undefined)
})

test('当前 host 工具 update_plan 和 ask_user 的历史可恢复并可管理', async (t) => {
  const { workspace, store, a } = await fixture(t)
  const plan = { revision: 1, steps: [{ id: 'inspect', title: '检查现状', status: 'in-progress' }] }
  await store.updateChat(a.id, {
    messages: [
      {
        id: 'host-tools',
        role: 'assistant',
        parts: [
          {
            type: 'tool-update_plan',
            toolCallId: 'plan-call',
            state: 'output-available',
            input: plan,
            output: plan,
          },
          {
            type: 'tool-ask_user',
            toolCallId: 'ask-call',
            state: 'output-available',
            input: { question: '继续吗？', options: [{ id: 'yes', label: '继续' }] },
            output: { outcome: 'answered', optionId: 'yes' },
          },
        ],
      },
    ],
    status: 'completed',
  })

  const restored = await workspace.getChat(a.id)
  assert.equal(restored.messages[0].parts[0].type, 'dynamic-tool')
  assert.equal(restored.messages[0].parts[0].toolName, 'update_plan')
  assert.equal(restored.messages[0].parts[1].type, 'dynamic-tool')
  assert.equal(restored.messages[0].parts[1].toolName, 'ask_user')

  await workspace.manageChat(a.id, { action: 'rename', title: '可管理的历史' })
  assert.equal((await store.getChat(a.id)).title, '可管理的历史')
})
