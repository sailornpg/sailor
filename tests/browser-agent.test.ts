// 「真实的 agent 读取并操作浏览器」的自动化证据。
//
// 这里跑的是生产链路：scripted 模型端点 → PiRunner → HarnessAgent/Pi → browser_* 工具。
// 模型自己决定调用哪些工具，测试只负责把它的决定录下来，并断言工具真的执行了。
import assert from 'node:assert/strict'
import { createServer as httpServer } from 'node:http'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import test from 'node:test'
import { createServer as viteServer, type ViteDevServer } from 'vite'

interface ScriptedReply {
  tool?: string
  id?: string
  input?: unknown
  text?: string
}

/** 极简 OpenAI-completions 端点：按脚本依次回 tool_call 或文本。 */
async function startScriptedModel(replies: ScriptedReply[]) {
  const requests: any[] = []
  const server = httpServer(async (req, res) => {
    let body = ''
    for await (const chunk of req) body += chunk
    const parsed = JSON.parse(body)
    requests.push(parsed)
    const reply = replies.shift() ?? { text: '完成' }
    const delta = reply.tool
      ? {
          tool_calls: [
            {
              index: 0,
              id: reply.id ?? 'call-1',
              type: 'function',
              function: { name: reply.tool, arguments: JSON.stringify(reply.input ?? {}) },
            },
          ],
        }
      : { content: reply.text ?? '完成' }
    res.writeHead(200, { 'content-type': 'text/event-stream' })
    const send = (choices: unknown[], usage?: unknown) =>
      res.write(
        `data: ${JSON.stringify({
          id: 'completion',
          object: 'chat.completion.chunk',
          created: 1,
          model: 'fixture',
          choices,
          ...(usage === undefined ? {} : { usage }),
        })}\n\n`,
      )
    send([{ index: 0, delta: { role: 'assistant', ...delta }, finish_reason: null }])
    send([{ index: 0, delta: {}, finish_reason: reply.tool ? 'tool_calls' : 'stop' }])
    send([], { prompt_tokens: 20, completion_tokens: 5, total_tokens: 25 })
    res.end('data: [DONE]\n\n')
  })
  await new Promise<void>((resolveListen) => server.listen(0, '127.0.0.1', resolveListen))
  return {
    requests,
    baseUrl: `http://127.0.0.1:${(server.address() as { port: number }).port}/v1`,
    close: () =>
      new Promise<void>((resolveClose) => {
        server.closeAllConnections()
        server.close(() => resolveClose())
      }),
  }
}

class FakeContents {
  url = ''
  title = ''
  loading = false
  back = false
  forward = false
  readonly clicks: string[] = []
  readonly debugger
  #listeners = new Map<string, Array<() => void>>()

  constructor() {
    this.debugger = {
      isAttached: () => false,
      attach: () => {},
      detach: () => {},
      sendCommand: async () => ({}),
      on: () => {},
    }
  }
  on(event: string, listener: () => void): void {
    this.#listeners.set(event, [...(this.#listeners.get(event) ?? []), listener])
  }
  getURL(): string {
    return this.url
  }
  getTitle(): string {
    return this.title
  }
  isLoading(): boolean {
    return this.loading
  }
  canGoBack(): boolean {
    return this.back
  }
  canGoForward(): boolean {
    return this.forward
  }
  isDestroyed(): boolean {
    return false
  }
  goBack(): void {}
  goForward(): void {}
  reload(): void {}
  stop(): void {}
  async loadURL(url: string): Promise<void> {
    this.url = url
  }
  close(): void {}
}

/** 记录 Agent 到底点了什么：工具走的是真实 BrowserSite，只有 CDP 被替换成记录器。 */
class RecordingCdp {
  readonly commands: { method: string; params: Record<string, unknown> }[] = []
  readonly responses = new Map<string, unknown>()

  async send(method: string, params: Record<string, unknown> = {}): Promise<unknown> {
    this.commands.push({ method, params })
    return this.responses.get(method) ?? {}
  }
  subscribe(): () => void {
    return () => {}
  }
}

async function fixture(options: { available: boolean; replies: ScriptedReply[] }) {
  const root = await mkdtemp(join(tmpdir(), 'sailor-browser-agent-'))
  const model = await startScriptedModel(options.replies)
  const vite: ViteDevServer = await viteServer({
    logLevel: 'silent',
    server: { middlewareMode: true },
    resolve: { alias: { '@shared': resolve('src/shared') } },
  })
  const { BrowserSite } = await vite.ssrLoadModule('/src/main/browser/BrowserSite.ts')
  const { createRefTable } = await vite.ssrLoadModule('/src/main/browser/snapshot.ts')
  const { PiRunner } = await vite.ssrLoadModule('/src/main/agent/pi/PiRunner.ts')
  const { WorkspaceToolScope } = await vite.ssrLoadModule(
    '/src/main/workspaces/WorkspaceToolScope.ts',
  )

  const contents = new FakeContents()
  const site = new BrowserSite({
    projectId: 'project-1',
    createId: () => 'tab-1',
    factory: {
      createTab: (id: string) => ({
        id,
        contents,
        setBounds: () => {},
        destroy: () => {},
      }),
    },
  })
  site.openTab()
  const cdp = new RecordingCdp()
  cdp.responses.set('Accessibility.getFullAXTree', {
    nodes: [
      {
        nodeId: '1',
        ignored: false,
        role: { value: 'rootWebArea' },
        name: { value: 'Fixture' },
        childIds: ['2'],
        backendDOMNodeId: 11,
      },
      {
        nodeId: '2',
        ignored: false,
        role: { value: 'button' },
        name: { value: '点我' },
        childIds: [],
        backendDOMNodeId: 21,
      },
    ],
  })
  cdp.responses.set('DOM.getBoxModel', {
    model: { content: [100, 200, 200, 200, 200, 240, 100, 240] },
  })
  // ref 必须来自模型自己那次 browser_read_page：脚本先读页面再点 ref_1，
  // 这样「读 → 拿 ref → 点」的链路才算真的被验证。
  const refs = createRefTable()
  // 真实 BrowserSite + 记录型 CDP：断言的是 Agent 实际发起了什么操作。
  site.entryFor = () => ({
    refs,
    cdp: cdp as never,
    tab: (site as never as { activeEntry: { tab: unknown } }).activeEntry!.tab as never,
  })

  const access = {
    acquire: async () =>
      options.available
        ? { ok: true as const, site }
        : {
            ok: false as const,
            code: 'NOT_CONFIGURED' as const,
            reason: '这个工作区开不了浏览器：工作区不存在。',
            recovery: '请确认该会话仍然关联着有效的工作区，然后重试。',
          },
    saveCapture: async () => ({
      captureId: '11111111-2222-4333-8444-555555555555',
      chatId: 'chat-1',
      path: '/tmp/capture.png',
      width: 10,
      height: 10,
      bytes: 1,
      createdAt: new Date().toISOString(),
    }),
  }

  const controller = new AbortController()
  const scope = await WorkspaceToolScope.create(root, controller.signal)
  const runner = new PiRunner(join(root, 'pi'), undefined, () => {}, access as never)
  const events: any[] = []
  const config = {
    providerId: 'fixture',
    providerName: 'Fixture',
    modelId: 'fixture',
    apiKey: 'fixture-key',
    baseUrl: model.baseUrl,
    protocol: 'openai-completions' as const,
    reasoningLevels: [],
    contextWindow: 32768,
    maxOutputTokens: 1024,
  }

  const run = async (text: string) => {
    const request = {
      runId: 'run-1',
      turnId: 'turn-1',
      chatId: 'chat-1',
      messages: [{ id: 'm-1', role: 'user' as const, parts: [{ type: 'text' as const, text }] }],
    }
    const chunks: any[] = []
    for await (const chunk of runner.run({
      request,
      config,
      signal: controller.signal,
      context: {
        chatId: 'chat-1',
        runId: 'run-1',
        projectId: 'project-1',
        rootPath: root,
        scope,
        signal: controller.signal,
        permissionMode: 'allow-all' as const,
      },
      onPiEvent: (event) => events.push(event),
    })) {
      chunks.push(chunk)
    }
    return chunks
  }

  return {
    run,
    cdp,
    contents,
    site,
    requests: model.requests,
    close: async () => {
      await model.close()
      await vite.close()
      await rm(root, { recursive: true, force: true })
    },
  }
}

function toolOutputs(chunks: any[]): any[] {
  return chunks.filter((chunk) => chunk.type === 'tool-output-available')
}

test('真实的 agent 会自己调用 browser_* 工具读页面并点击', { timeout: 120_000 }, async (t) => {
  const f = await fixture({
    available: true,
    replies: [
      { tool: 'browser_read_page', id: 'call-read-1', input: { mode: 'interactive' } },
      { tool: 'browser_click', id: 'call-click-1', input: { ref: 'ref_1' } },
      { text: '页面上的「点我」按钮已经点击完成。' },
    ],
  })
  t.after(f.close)

  const chunks = await f.run('打开侧边栏浏览器，读一下页面，然后点「点我」按钮')

  // 1) 模型实际被广告到了浏览器工具，而不是测试直接调用工具函数。
  const advertised = f.requests[0].tools.map((tool: any) => tool.function.name)
  assert.ok(advertised.includes('browser_read_page'), JSON.stringify(advertised))
  assert.ok(advertised.includes('browser_click'), JSON.stringify(advertised))

  // 2) 工具调用来自模型（tool-input-available 带上模型给的参数）。
  const inputs = chunks.filter((chunk) => chunk.type === 'tool-input-available')
  const readCall = inputs.find((chunk) => chunk.toolName === 'browser_read_page')
  const clickCall = inputs.find((chunk) => chunk.toolName === 'browser_click')
  assert.equal(readCall?.input?.mode, 'interactive')
  assert.equal(clickCall?.input?.ref, 'ref_1')

  // 3) 工具真的执行了：读页面拿回 ref，点击真的派发了鼠标事件。
  const outputs = toolOutputs(chunks)
  const readOutput = outputs.find((chunk) => chunk.toolCallId === 'call-read-1')
  const clickOutput = outputs.find((chunk) => chunk.toolCallId === 'call-click-1')
  assert.equal(readOutput?.output?.ok, true, JSON.stringify(readOutput))
  assert.match(String(readOutput?.output?.data?.text), /\[ref_\d+\] button "点我"/)
  assert.equal(clickOutput?.output?.ok, true, JSON.stringify(clickOutput))

  const pressed = f.cdp.commands.find(
    (command) =>
      command.method === 'Input.dispatchMouseEvent' && command.params.type === 'mousePressed',
  )
  assert.ok(pressed, JSON.stringify(f.cdp.commands.map((c) => c.method)))
  assert.equal(pressed?.params.button, 'left')

  // 4) 第二轮请求里模型看得到工具结果（结果真的回到了模型上下文）。
  const secondTurn = JSON.stringify(f.requests[1]?.messages ?? [])
  assert.match(secondTurn, /browser_read_page/)
  assert.match(secondTurn, /ref_\d+/)
})

test('拿不到浏览器时，Agent 的工具调用被真实拒绝且不会碰页面', { timeout: 120_000 }, async (t) => {
  const f = await fixture({
    available: false,
    replies: [
      { tool: 'browser_read_page', id: 'call-denied-1', input: { mode: 'interactive' } },
      { text: '我现在拿不到浏览器。' },
    ],
  })
  t.after(f.close)

  const chunks = await f.run('读一下页面')

  const denied = toolOutputs(chunks).find((chunk) => chunk.toolCallId === 'call-denied-1')
  assert.equal(denied?.output?.ok, false, JSON.stringify(denied))
  assert.equal(denied?.output?.error?.code, 'NOT_CONFIGURED')
  assert.match(String(denied?.output?.error?.recovery?.[0]?.reason), /工作区/)

  // 拒绝必须发生在工具层：页面读取一次都没发生。
  assert.equal(f.cdp.commands.length, 0, JSON.stringify(f.cdp.commands))
  assert.match(JSON.stringify(f.requests[1]?.messages ?? []), /NOT_CONFIGURED/)
})
