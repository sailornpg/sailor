import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import { createServer, type ViteDevServer } from 'vite'

let vite: ViteDevServer
let registryModule: typeof import('../src/main/browser/BrowserRegistry.ts')
let ipcModule: typeof import('../src/main/browser/BrowserIpcHandler.ts')
let capturesModule: typeof import('../src/main/browser/BrowserCaptures.ts')

test.before(async () => {
  vite = await createServer({ logLevel: 'silent', server: { middlewareMode: true } })
  registryModule = (await vite.ssrLoadModule(
    '/src/main/browser/BrowserRegistry.ts',
  )) as typeof registryModule
  ipcModule = (await vite.ssrLoadModule(
    '/src/main/browser/BrowserIpcHandler.ts',
  )) as typeof ipcModule
  capturesModule = (await vite.ssrLoadModule(
    '/src/main/browser/BrowserCaptures.ts',
  )) as typeof capturesModule
})

test.after(async () => {
  await vite?.close()
})

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
  goBack(): void {}
  goForward(): void {}
  reload(): void {}
  stop(): void {}
  async loadURL(url: string): Promise<void> {
    this.url = url
    this.back = true
  }
  close(): void {
    this.destroyed = true
  }
}

function harness() {
  let counter = 0
  const agentActivity: string[] = []
  const roots = new Map([['project-1', '/tmp/project-1']])
  const captures = new capturesModule.BrowserCaptures('/tmp/sailor-browser-captures')
  const registry = new registryModule.BrowserRegistry(
    {
      createFactory: () => ({
        createTab: (id: string) => {
          const contents = new FakeContents()
          return {
            id,
            contents: contents as never,
            setBounds: () => {},
            destroy: () => contents.close(),
          }
        },
      }),
      resolveProjectRoot: async (projectId: string) => {
        const root = roots.get(projectId)
        if (root === undefined) throw new Error('工作区不存在。')
        return root
      },
      onChange: () => {},
      onAgentActivity: (projectId: string) => {
        agentActivity.push(projectId)
      },
    },
    { save: captures.save.bind(captures), read: captures.read.bind(captures) },
  )
  const states: unknown[] = []
  const sender = {
    id: 7,
    isDestroyed: () => false,
    send: (payload: unknown) => {
      states.push(payload)
    },
  }
  const handler = new ipcModule.BrowserIpcHandler({
    registry,
    isTrustedSender: (candidate) => candidate.id === 7,
  })
  return { handler, registry, sender, states, agentActivity, capturesRoot: captures.root }
}

test('不受信任的发送方一律拒绝', async () => {
  const { handler } = harness()
  const stranger = { id: 99, isDestroyed: () => false, send: () => {} }
  await assert.rejects(
    () => handler.attach(stranger, { projectId: 'project-1' }),
    /不接受来自该窗口/,
  )
})

test('attach 校验 projectId、补一个空白标签页，并拒绝多余字段', async () => {
  const { handler, sender } = harness()
  const state = await handler.attach(sender, { projectId: 'project-1' })
  assert.equal(state.projectId, 'project-1')
  assert.equal(state.tabs.length, 1)
  assert.equal(state.activeTabId, state.tabs[0]?.id)

  await assert.rejects(() => handler.attach(sender, { projectId: 'project-1', url: 'x' }))
  await assert.rejects(() => handler.attach(sender, { projectId: 'missing' }), /工作区不存在/)
})

test('detach 只把视图摘下来，页面与会话都还在', async () => {
  const { handler, sender, registry } = harness()
  const attached = await handler.attach(sender, { projectId: 'project-1' })
  await handler.detach(sender, { projectId: 'project-1' })
  const site = registry.site('project-1')
  assert.ok(site)
  assert.equal(site.destroyed, false)
  assert.equal(site.state().tabs.length, attached.tabs.length)
})

test('navigate 走同一套地址校验，失败时抛出可读原因', async () => {
  const { handler, sender } = harness()
  await handler.attach(sender, { projectId: 'project-1' })
  const state = await handler.navigate(sender, { projectId: 'project-1', input: 'example.com' })
  assert.equal(state.tabs[0]?.url, 'https://example.com/')
  await assert.rejects(
    () => handler.navigate(sender, { projectId: 'project-1', input: 'file:///etc/passwd' }),
    /只允许 http、https 和 about 地址/,
  )
})

test('浏览器默认对 Agent 可用：没有站点和标签页时自动创建', async () => {
  const { registry } = harness()
  const first = await registry.acquire('project-1')
  assert.equal(first.ok, true)
  if (first.ok) {
    assert.equal(first.site.hasTabs(), true)
    assert.equal(first.site.state().tabs.length, 1)
  }

  // 关掉所有标签页之后再取：会自动补一个空白页，而不是要求用户去点面板。
  const site = registry.site('project-1')
  assert.ok(site)
  for (const tab of site.state().tabs) site.closeTab(tab.id)
  const second = await registry.acquire('project-1')
  assert.equal(second.ok, true)
  if (second.ok) assert.equal(second.site.hasTabs(), true)
})

test('Agent 每次拿到浏览器都会请求展示侧栏，用户自己的操作不会', async () => {
  const { handler, sender, registry, agentActivity } = harness()
  await handler.attach(sender, { projectId: 'project-1' })
  assert.deepEqual(agentActivity, [], '打开面板本身不该触发展示请求')

  await registry.acquire('project-1')
  await registry.acquire('project-1')
  assert.deepEqual(agentActivity, ['project-1', 'project-1'])
})

test('工作区不存在时仍然拒绝，并给出可执行的下一步', async () => {
  const { registry } = harness()
  const result = await registry.acquire('missing')
  assert.equal(result.ok, false)
  if (!result.ok) {
    assert.equal(result.code, 'NOT_CONFIGURED')
    assert.match(result.reason, /开不了浏览器/)
    assert.match(result.recovery, /工作区/)
  }
})

test('授权开关已经从契约与渲染层彻底移除', async () => {
  const files = [
    'src/shared/contracts.ts',
    'src/shared/browser.ts',
    'src/preload/index.ts',
    'src/main/ipc/registerIpc.ts',
    'src/main/browser/BrowserRegistry.ts',
    'src/main/browser/BrowserIpcHandler.ts',
    'src/renderer/src/components/panels/BrowserPanel.tsx',
    'src/renderer/src/lib/panels/browserSurface.ts',
  ]
  for (const file of files) {
    const source = await readFile(file, 'utf8')
    for (const needle of [
      'set-agent-access',
      'setAgentAccess',
      'agentEnabled',
      '允许 Agent 操作',
    ]) {
      assert.equal(source.includes(needle), false, `${file} 仍然包含 ${needle}`)
    }
  }
})

test('readCapture 只认自己签发、且属于该会话的截图 id', async () => {
  const { handler, sender, registry } = harness()
  const capture = await registry.saveCapture({
    chatId: 'chat-1',
    png: new Uint8Array([137, 80, 78, 71]),
    width: 10,
    height: 10,
  })
  const dataUrl = await handler.readCapture(sender, {
    chatId: 'chat-1',
    captureId: capture.captureId,
  })
  assert.match(dataUrl, /^data:image\/png;base64,/)

  await assert.rejects(
    () => handler.readCapture(sender, { chatId: 'chat-2', captureId: capture.captureId }),
    /不属于当前会话/,
  )
  await assert.rejects(
    () => handler.readCapture(sender, { chatId: 'chat-1', captureId: '../../etc/passwd' }),
    /格式不正确/,
  )
})

test('没有活动标签页时导航给出明确拒绝', async () => {
  const { handler, sender, registry } = harness()
  await handler.attach(sender, { projectId: 'project-1' })
  const site = registry.site('project-1')
  assert.ok(site)
  const tabId = site.activeTabId as string
  site.closeTab(tabId)
  await assert.rejects(
    () => handler.navigate(sender, { projectId: 'project-1', input: 'example.com' }),
    /没有活动的标签页/,
  )
})
