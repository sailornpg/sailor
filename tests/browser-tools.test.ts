import assert from 'node:assert/strict'
import test from 'node:test'
import { createServer, type ViteDevServer } from 'vite'

let vite: ViteDevServer
let browserToolsModule: typeof import('../src/main/browser/browserTools.ts')
let siteModule: typeof import('../src/main/browser/BrowserSite.ts')
let snapshotModule: typeof import('../src/main/browser/snapshot.ts')

test.before(async () => {
  vite = await createServer({ logLevel: 'silent', server: { middlewareMode: true } })
  browserToolsModule = (await vite.ssrLoadModule(
    '/src/main/browser/browserTools.ts',
  )) as typeof browserToolsModule
  siteModule = (await vite.ssrLoadModule('/src/main/browser/BrowserSite.ts')) as typeof siteModule
  snapshotModule = (await vite.ssrLoadModule(
    '/src/main/browser/snapshot.ts',
  )) as typeof snapshotModule
})

test.after(async () => {
  await vite?.close()
})

interface SentCommand {
  method: string
  params: Record<string, unknown>
}

class FakeCdp {
  readonly commands: SentCommand[] = []
  readonly listeners: Array<(event: { method: string; params: Record<string, unknown> }) => void> =
    []
  readonly responses = new Map<string, unknown>()

  async send(method: string, params: Record<string, unknown> = {}): Promise<unknown> {
    this.commands.push({ method, params })
    return this.responses.get(method) ?? {}
  }

  subscribe(
    listener: (event: { method: string; params: Record<string, unknown> }) => void,
  ): () => void {
    this.listeners.push(listener)
    return () => {
      this.listeners.splice(this.listeners.indexOf(listener), 1)
    }
  }

  methods(): string[] {
    return this.commands.map((command) => command.method)
  }
}

class FakeTab {
  readonly id: string
  readonly contents = new FakeContents()
  bounds: unknown = null
  destroyed = false
  constructor(id: string) {
    this.id = id
  }
  setBounds(bounds: unknown): void {
    this.bounds = bounds
  }
  destroy(): void {
    this.destroyed = true
  }
}

class FakeContents {
  url = ''
  title = ''
  loading = false
  destroyed = false
  back = false
  forward = false
  readonly debugger = {
    isAttached: () => false,
    attach: () => {},
    detach: () => {},
    sendCommand: async () => ({}),
    on: () => {},
  }
  on(): void {}
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
    return this.destroyed
  }
  goBack(): void {
    this.back = false
    this.forward = true
  }
  goForward(): void {}
  reload(): void {}
  stop(): void {}
  async loadURL(url: string): Promise<void> {
    this.url = url
  }
  close(): void {
    this.destroyed = true
  }
}

const AX_TREE = {
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
      name: { value: 'Add item' },
      childIds: [],
      backendDOMNodeId: 21,
      properties: [{ name: 'focusable', value: { value: true } }],
    },
  ],
}

interface HarnessOptions {
  /** acquire 的失败分支。 */
  deny?: 'NOT_CONFIGURED' | 'LIMIT_EXCEEDED'
  /** 该 tab 是否保留活动标签页。 */
  withTab?: boolean
}

function harness(options: HarnessOptions = {}) {
  const tabs: FakeTab[] = []
  let counter = 0
  const site = new siteModule.BrowserSite({
    projectId: 'project-1',
    createId: () => `tab-${++counter}`,
    factory: {
      createTab: (id: string) => {
        const tab = new FakeTab(id)
        tabs.push(tab)
        return tab as never
      },
    },
  })
  if (options.withTab !== false) site.openTab()
  const cdp = new FakeCdp()
  const refs = snapshotModule.createRefTable()
  // 预先绑定一个已知 ref，模拟 browser_read_page 已经跑过。
  snapshotModule.bindRef(refs, {
    nodeId: '2',
    ignored: false,
    role: 'button',
    name: 'Add item',
    childIds: [],
    backendDOMNodeId: 21,
  })
  site.entryFor = () => ({ refs, cdp: cdp as never, tab: tabs[0] as never })

  const captures: Array<{ chatId: string; bytes: number }> = []
  const access = {
    acquire: async () => {
      if (options.deny === 'NOT_CONFIGURED') {
        return {
          ok: false as const,
          code: 'NOT_CONFIGURED' as const,
          reason: '这个工作区开不了浏览器：工作区不存在。',
          recovery: '请确认该会话仍然关联着有效的工作区，然后重试。',
        }
      }
      if (options.deny === 'LIMIT_EXCEEDED') {
        return {
          ok: false as const,
          code: 'LIMIT_EXCEEDED' as const,
          reason: '每个工作区最多同时打开 4 个标签页。',
          recovery: '请先用 browser_tabs 关掉不需要的标签页。',
        }
      }
      return { ok: true as const, site: site as never }
    },
    saveCapture: async (input: {
      chatId: string
      png: Uint8Array
      width: number
      height: number
    }) => {
      captures.push({ chatId: input.chatId, bytes: input.png.byteLength })
      return {
        captureId: '11111111-2222-4333-8444-555555555555',
        chatId: input.chatId,
        path: '/tmp/x.png',
        width: input.width,
        height: input.height,
        bytes: input.png.byteLength,
        createdAt: new Date().toISOString(),
      }
    },
  }

  const tools = browserToolsModule.createBrowserTools({
    access: access as never,
    projectId: 'project-1',
    chatId: 'chat-1',
  }) as Record<
    string,
    { execute: (input: unknown, options: { toolCallId: string }) => Promise<unknown> }
  >

  const run = async (name: string, input: unknown) => {
    const tool = tools[name]
    assert.ok(tool, `缺少工具 ${name}`)
    return (await tool.execute(input, { toolCallId: 'call-1' })) as {
      ok: boolean
      summary: string
      truncated: boolean
      data?: Record<string, unknown>
      error?: { code: string; message: string; recovery: Array<{ reason: string }> }
      artifactRefs?: Array<{ id: string; kind: string }>
    }
  }

  return { site, tabs, cdp, refs, tools, run, captures }
}

test('拿不到浏览器时给出真实原因和可执行恢复指引', async () => {
  const { run } = harness({ deny: 'NOT_CONFIGURED' })
  const result = await run('browser_navigate', { url: 'https://example.com' })
  assert.equal(result.ok, false)
  assert.equal(result.error?.code, 'NOT_CONFIGURED')
  assert.match(result.error?.recovery[0]?.reason ?? '', /工作区/)
})

test('标签页数量打满时按 LIMIT_EXCEEDED 拒绝，而不是静默失败', async () => {
  const { run } = harness({ deny: 'LIMIT_EXCEEDED' })
  const result = await run('browser_click', { ref: 'ref_1' })
  assert.equal(result.ok, false)
  assert.equal(result.error?.code, 'LIMIT_EXCEEDED')
  assert.match(result.error?.recovery[0]?.reason ?? '', /browser_tabs/)
})

test('navigate 拒绝非白名单地址，合法地址落到真实导航', async () => {
  const { run, tabs } = harness()
  const denied = await run('browser_navigate', { url: 'file:///etc/passwd' })
  assert.equal(denied.ok, false)
  assert.equal(denied.error?.code, 'INVALID_ARGUMENT')
  assert.equal(tabs[0].contents.url, '')

  const allowed = await run('browser_navigate', { url: 'example.com/docs' })
  assert.equal(allowed.ok, true)
  assert.equal(tabs[0].contents.url, 'https://example.com/docs')
  assert.equal(allowed.data?.url, 'https://example.com/docs')
})

test('read_page 把可访问性树转成带 ref 的文本', async () => {
  const { run, cdp } = harness()
  cdp.responses.set('Accessibility.getFullAXTree', AX_TREE)
  const result = await run('browser_read_page', { mode: 'interactive' })
  assert.equal(result.ok, true)
  assert.equal(result.data?.elementCount, 1)
  assert.match(String(result.data?.text), /\[ref_\d+\] button "Add item"/)
})

test('click 用 ref 找到元素中心并派发真实鼠标事件', async () => {
  const { run, cdp } = harness()
  cdp.responses.set('DOM.getBoxModel', {
    model: { content: [100, 200, 300, 200, 300, 260, 100, 260] },
  })
  const result = await run('browser_click', { ref: 'ref_1' })
  assert.equal(result.ok, true)
  assert.deepEqual(result.data?.coordinate, [200, 230])
  const pressed = cdp.commands.find(
    (command) =>
      command.method === 'Input.dispatchMouseEvent' && command.params.type === 'mousePressed',
  )
  assert.equal(pressed?.params.x, 200)
  assert.equal(pressed?.params.button, 'left')
})

test('ref 失效时返回 NOT_FOUND 并提示重新读取页面', async () => {
  const { run } = harness()
  const result = await run('browser_click', { ref: 'ref_99' })
  assert.equal(result.ok, false)
  assert.equal(result.error?.code, 'NOT_FOUND')
  assert.equal(result.error?.recovery[0]?.reason.includes('browser_read_page'), true)
})

test('type 聚焦元素并插入文本，submit 时补一次回车', async () => {
  const { run, cdp } = harness()
  const result = await run('browser_type', { ref: 'ref_1', text: 'hello', submit: true })
  assert.equal(result.ok, true)
  assert.equal(result.data?.characters, 5)
  assert.deepEqual(cdp.methods().slice(0, 3), ['DOM.enable', 'DOM.focus', 'Input.insertText'])
  assert.equal(cdp.commands.at(-1)?.params.key, 'Enter')
})

test('key 解析失败不静默，合法序列按 keyDown/keyUp 成对派发', async () => {
  const { run, cdp } = harness()
  const bad = await run('browser_key', { keys: 'NotAKey' })
  assert.equal(bad.ok, false)
  assert.equal(bad.error?.code, 'INVALID_ARGUMENT')

  const good = await run('browser_key', { keys: 'cmd+a' })
  assert.equal(good.ok, true)
  assert.deepEqual(cdp.methods(), ['Input.dispatchKeyEvent', 'Input.dispatchKeyEvent'])
  assert.equal(cdp.commands[0]?.params.modifiers, 4)
})

test('screenshot 落盘并在结果里给出 artifactRef', async () => {
  const { run, cdp, captures } = harness()
  cdp.responses.set('Page.captureScreenshot', { data: Buffer.from('png-bytes').toString('base64') })
  cdp.responses.set('Page.getLayoutMetrics', {
    cssLayoutViewport: { clientWidth: 640, clientHeight: 480 },
  })
  const result = await run('browser_screenshot', {})
  assert.equal(result.ok, true)
  assert.equal(result.data?.width, 640)
  assert.equal(result.artifactRefs?.[0]?.kind, 'browser-capture')
  assert.equal(captures[0]?.chatId, 'chat-1')
})

test('tabs 支持列出、新建、切换与关闭', async () => {
  const { run } = harness()
  const listed = await run('browser_tabs', { action: 'list' })
  assert.equal(listed.ok, true)
  assert.equal((listed.data?.tabs as unknown[]).length, 1)

  const opened = await run('browser_tabs', { action: 'open' })
  assert.equal(opened.ok, true)

  const closed = await run('browser_tabs', { action: 'close', tabId: 'tab-1' })
  assert.equal(closed.ok, true)

  const missing = await run('browser_tabs', { action: 'activate', tabId: 'tab-404' })
  assert.equal(missing.ok, false)
  assert.equal(missing.error?.code, 'NOT_FOUND')
})

test('console 读取缓冲区并支持正则过滤', async () => {
  const { run, cdp } = harness()
  // 第一次调用开始监听；只有这之后产生的消息才会被记录。
  const initial = await run('browser_console', {})
  assert.equal(initial.ok, true)
  assert.equal((initial.data?.messages as unknown[]).length, 0)
  for (const listener of cdp.listeners) {
    listener({
      method: 'Runtime.consoleAPICalled',
      params: { type: 'log', args: [{ type: 'string', value: '[MyApp] ready' }] },
    })
    listener({
      method: 'Runtime.consoleAPICalled',
      params: { type: 'error', args: [{ type: 'string', value: 'boom' }] },
    })
  }
  const filtered = await run('browser_console', { pattern: 'MyApp' })
  assert.equal(filtered.ok, true)
  assert.equal((filtered.data?.messages as unknown[]).length, 1)

  const errorsOnly = await run('browser_console', { onlyErrors: true })
  assert.equal((errorsOnly.data?.messages as unknown[]).length, 1)

  const bad = await run('browser_console', { pattern: '[' })
  assert.equal(bad.ok, false)
  assert.equal(bad.error?.code, 'INVALID_ARGUMENT')
})
