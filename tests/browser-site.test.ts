import assert from 'node:assert/strict'
import test from 'node:test'
import { createServer, type ViteDevServer } from 'vite'

import type { BrowserTab, BrowserTabBounds } from '../src/main/browser/BrowserSite.ts'

let vite: ViteDevServer
let BrowserSiteModule: typeof import('../src/main/browser/BrowserSite.ts')
let cdpModule: typeof import('../src/main/browser/cdp.ts')

test.before(async () => {
  vite = await createServer({ logLevel: 'silent', server: { middlewareMode: true } })
  BrowserSiteModule = (await vite.ssrLoadModule(
    '/src/main/browser/BrowserSite.ts',
  )) as typeof BrowserSiteModule
  cdpModule = (await vite.ssrLoadModule('/src/main/browser/cdp.ts')) as typeof cdpModule
})

test.after(async () => {
  await vite?.close()
})

type Listener = (...args: unknown[]) => void

class FakeDebugger {
  attached = false
  detached = 0
  commands: string[] = []
  #listeners = new Map<string, Listener[]>()

  isAttached(): boolean {
    return this.attached
  }
  attach(): void {
    this.attached = true
  }
  detach(): void {
    this.attached = false
    this.detached += 1
  }
  async sendCommand(method: string): Promise<unknown> {
    this.commands.push(method)
    return {}
  }
  on(event: 'message' | 'detach', listener: Listener): void {
    this.#listeners.set(event, [...(this.#listeners.get(event) ?? []), listener])
  }
}

class FakeContents {
  readonly debugger = new FakeDebugger()
  url = ''
  title = ''
  loading = false
  destroyed = false
  back = false
  forward = false
  loads: string[] = []
  #listeners = new Map<string, Listener[]>()

  on(event: string, listener: Listener): void {
    this.#listeners.set(event, [...(this.#listeners.get(event) ?? []), listener])
  }
  emit(event: string): void {
    for (const listener of this.#listeners.get(event) ?? []) listener()
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
    return this.destroyed
  }
  goBack(): void {
    this.back = false
    this.forward = true
    this.url = 'https://example.com/previous'
    this.emit('did-navigate')
  }
  goForward(): void {
    this.forward = false
    this.back = true
    this.url = 'https://example.com/next'
    this.emit('did-navigate')
  }
  reload(): void {
    this.emit('did-start-loading')
  }
  stop(): void {
    this.loading = false
    this.emit('did-stop-loading')
  }
  async loadURL(url: string): Promise<void> {
    if (this.failNextLoad !== undefined) {
      const message = this.failNextLoad
      this.failNextLoad = undefined
      throw new Error(message)
    }
    this.loads.push(url)
    this.url = url
    this.loading = true
    this.emit('did-start-loading')
    this.back = true
    this.emit('did-navigate')
    this.loading = false
    this.emit('did-stop-loading')
  }
  close(): void {
    this.destroyed = true
  }
  failNextLoad: string | undefined
}

class FakeTab implements BrowserTab {
  readonly contents = new FakeContents()
  readonly id: string
  bounds: BrowserTabBounds | null = null
  destroyed = false
  constructor(id: string) {
    this.id = id
  }
  setBounds(bounds: BrowserTabBounds | null): void {
    this.bounds = bounds
  }
  destroy(): void {
    this.destroyed = true
    this.contents.close()
  }
}

function fixture(options: { maxTabs?: number } = {}) {
  const tabs: FakeTab[] = []
  let counter = 0
  let changes = 0
  const site = new BrowserSiteModule.BrowserSite({
    projectId: 'project-1',
    maxTabs: options.maxTabs,
    onChange: () => {
      changes += 1
    },
    createId: () => `tab-${++counter}`,
    factory: {
      createTab: (id) => {
        const tab = new FakeTab(id)
        tabs.push(tab)
        return tab
      },
    },
  })
  return { site, tabs, changes: () => changes }
}

test('打开标签页会激活、限制数量并给出摘要', () => {
  const { site, tabs } = fixture({ maxTabs: 2 })

  const first = site.openTab()
  assert.equal(first.ok, true)
  assert.equal(site.activeTabId, 'tab-1')

  assert.equal(site.openTab().ok, true)
  assert.equal(site.activeTabId, 'tab-2')

  const third = site.openTab()
  assert.equal(third.ok, false)
  if (!third.ok) assert.match(third.reason, /最多同时打开 2 个/)
  assert.equal(tabs.length, 2)
})

test('几何只挂在活动标签页上，null 会隐藏所有标签页', () => {
  const { site, tabs } = fixture()
  site.openTab()
  site.openTab()

  const bounds = { x: 100, y: 200, width: 300, height: 400 }
  site.setActiveBounds(bounds)
  assert.equal(tabs[0].bounds, null)
  assert.deepEqual(tabs[1].bounds, bounds)

  site.activateTab('tab-1')
  assert.deepEqual(tabs[0].bounds, bounds)
  assert.equal(tabs[1].bounds, null)

  site.setActiveBounds(null)
  assert.equal(tabs[0].bounds, null)
})

test('导航只接受白名单地址，缺协议按 https 补全', () => {
  const { site, tabs } = fixture()
  site.openTab()

  const denied = site.navigate('tab-1', 'file:///etc/passwd')
  assert.equal(denied.ok, false)
  if (!denied.ok) assert.match(denied.reason, /只允许/)
  assert.deepEqual(tabs[0].contents.loads, [])

  const guessed = site.navigate('tab-1', 'example.com/docs')
  assert.equal(guessed.ok, true)
  assert.deepEqual(tabs[0].contents.loads, ['https://example.com/docs'])
})

test('前进/后退按历史可用性执行，没历史就不是静默成功', () => {
  const { site, tabs } = fixture()
  site.openTab()
  tabs[0].contents.back = false
  tabs[0].contents.forward = false

  const noBack = site.navigate('tab-1', 'back')
  assert.equal(noBack.ok, false)
  if (!noBack.ok) assert.match(noBack.reason, /没有可后退/)

  tabs[0].contents.back = true
  const back = site.navigate('tab-1', 'back')
  assert.equal(back.ok, true)
  assert.equal(tabs[0].contents.getURL(), 'https://example.com/previous')
})

test('关闭当前标签页激活邻居，关掉最后一个会清空几何', () => {
  const { site, tabs } = fixture()
  site.openTab()
  site.openTab()
  site.setActiveBounds({ x: 0, y: 0, width: 10, height: 10 })

  const closed = site.closeTab('tab-2')
  assert.equal(closed.ok, true)
  assert.equal(site.activeTabId, 'tab-1')
  assert.equal(tabs[1].destroyed, true)
  assert.deepEqual(tabs[0].bounds, { x: 0, y: 0, width: 10, height: 10 })

  site.closeTab('tab-1')
  assert.equal(site.activeTabId, null)
  assert.equal(site.hasTabs(), false)
  assert.equal(site.state().tabs.length, 0)
})

test('页面事件会驱动状态广播，标题为空时回退到地址', () => {
  const { site, tabs, changes } = fixture()
  site.openTab()
  const before = changes()

  void tabs[0].contents.loadURL('https://example.com/')
  assert.ok(changes() > before)

  const summary = site.summaryFor('tab-1')
  assert.equal(summary?.title, 'https://example.com/')
  tabs[0].contents.title = 'Example Domain'
  assert.equal(site.summaryFor('tab-1')?.title, 'Example Domain')
})

test('站点状态只描述标签页，不再有授权字段', () => {
  const { site } = fixture()
  site.openTab()
  assert.deepEqual(Object.keys(site.state()).sort(), ['activeTabId', 'projectId', 'tabs'])
})

test('销毁会释放所有标签页与调试附着，之后不再新建', () => {
  const { site, tabs } = fixture()
  site.openTab()
  site.openTab()
  const sessions = site.state().tabs.map((tab) => site.entryFor(tab.id))
  for (const entry of sessions) entry?.cdp.ensureAttached()

  site.destroy()
  assert.equal(
    tabs.every((tab) => tab.destroyed),
    true,
  )
  assert.equal(site.destroyed, true)
  assert.equal(site.openTab().ok, false)
})

test('每个标签页有独立的 ref 表与会话', () => {
  const { site } = fixture()
  site.openTab()
  site.openTab()
  const first = site.entryFor('tab-1')
  const second = site.entryFor('tab-2')
  assert.ok(first && second)
  assert.notEqual(first.refs, second.refs)
  assert.ok(first.cdp instanceof cdpModule.CdpSession)
  assert.notEqual(first.cdp, second.cdp)
})

test('CDP 附着幂等，DevTools 占用时给出可读原因', () => {
  const host = new FakeDebugger()
  const session = new cdpModule.CdpSession(host)
  session.ensureAttached()
  session.ensureAttached()
  assert.equal(host.attached, true)

  const busy = new FakeDebugger()
  busy.attach = () => {
    throw new Error('Another debugger is already attached to the webContents')
  }
  const busySession = new cdpModule.CdpSession(busy)
  assert.throws(() => busySession.ensureAttached(), /DevTools/)
})

test('CDP 命令超时归一化为 CdpCommandError，且带方法名', async () => {
  const host = new cdpModule.CdpSession(
    {
      isAttached: () => false,
      attach: () => {},
      detach: () => {},
      sendCommand: () => new Promise(() => {}),
      on: () => {},
    },
    { timeoutMs: 10 },
  )
  await assert.rejects(
    () => host.send('Page.navigate', { url: 'https://example.com' }),
    (error: unknown) =>
      error instanceof cdpModule.CdpCommandError &&
      error.timedOut === true &&
      error.method === 'Page.navigate',
  )
})

test('CDP 命令失败保留原因，detach 之后可以重新附着', async () => {
  const host = new FakeDebugger()
  host.sendCommand = async (method) => {
    if (method === 'Page.captureScreenshot') throw new Error('Target closed')
    return { ok: true }
  }
  const session = new cdpModule.CdpSession(host)
  await assert.rejects(
    () => session.send('Page.captureScreenshot'),
    (error: unknown) =>
      error instanceof cdpModule.CdpCommandError && /Target closed/.test(error.message),
  )
  assert.equal(session.attached, true)

  session.detach()
  assert.equal(host.detached, 1)
  assert.equal(session.attached, false)
  session.ensureAttached()
  assert.equal(host.attached, true)
})
