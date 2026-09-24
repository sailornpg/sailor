import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import test, { after } from 'node:test'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { createServer, type ViteDevServer } from 'vite'

const ALIASES = {
  '@': resolve('src/renderer/src'),
  '@shared': resolve('src/shared'),
}

let server: ViteDevServer | null = null

async function load(path: string): Promise<Record<string, any>> {
  server ??= await createServer({ logLevel: 'silent', server: { middlewareMode: true }, resolve: { alias: ALIASES } })
  return server.ssrLoadModule(path)
}

after(async () => {
  await server?.close()
})

async function loadPanel() {
  const tabs = await load('/src/renderer/src/lib/terminal/terminalTabs.ts').catch(() => assert.fail('终端 tab 逻辑尚未实现'))
  const session = await load('/src/renderer/src/lib/terminal/terminalSession.ts').catch(() => assert.fail('终端会话控制器尚未实现'))
  const panel = await load('/src/renderer/src/components/panels/TerminalPanel.tsx').catch(() => assert.fail('终端面板尚未实现'))
  assert.equal(typeof tabs.addTab, 'function')
  assert.equal(typeof session.createTerminalController, 'function')
  assert.equal(typeof panel.TerminalTabsView, 'function', '需要可静态渲染的会话 tab 条')
  assert.equal(typeof panel.TerminalSessionStatus, 'function', '需要可静态渲染的会话状态区')
  return { tabs, session, panel }
}

const info = (ordinal: number, overrides: Record<string, unknown> = {}) => ({
  projectId: 'p1',
  sessionId: `s${ordinal}`,
  ordinal,
  status: 'running',
  shell: 'zsh',
  pid: 4000 + ordinal,
  cols: 80,
  rows: 24,
  exit: null,
  failure: null,
  ...overrides,
})

function createFakeApi() {
  const log: string[] = []
  const calls: Record<string, any[]> = { create: [], list: [], attach: [], detach: [], write: [], resize: [], terminate: [] }
  let listener: ((payload: any) => void) | null = null
  let openInfo: any = info(1)
  let attachResult: any = { subscriptionId: 'sub-1', info: openInfo, chunks: [{ seq: 1, data: 'hello' }], nextSeq: 2, truncated: false }

  const api = {
    create: async (input: any) => {
      log.push('create')
      calls.create.push(input)
      return openInfo
    },
    list: async (input: any) => {
      log.push('list')
      calls.list.push(input)
      return [openInfo]
    },
    attach: async (input: any) => {
      log.push('attach')
      calls.attach.push(input)
      return { ...attachResult, info: openInfo }
    },
    detach: async (subscriptionId: string) => {
      log.push('detach')
      calls.detach.push(subscriptionId)
    },
    write: async (input: any) => {
      calls.write.push(input)
    },
    resize: async (input: any) => {
      calls.resize.push(input)
      return { ...openInfo, cols: input.cols, rows: input.rows }
    },
    terminate: async (input: any) => {
      log.push('terminate')
      calls.terminate.push(input)
    },
    subscribe: (next: (payload: any) => void) => {
      log.push('subscribe')
      listener = next
      return () => {
        log.push('unsubscribe')
        listener = null
      }
    },
  }

  return {
    api,
    calls,
    log,
    emit: (payload: any) => listener?.(payload),
    setOpenInfo: (next: any) => {
      openInfo = next
    },
    setAttachResult: (next: any) => {
      attachResult = next
    },
  }
}

async function createControllerFixture() {
  const { session } = await loadPanel()
  const fake = createFakeApi()
  const sink: string[] = []
  const states: any[] = []
  const controller = session.createTerminalController({
    api: fake.api,
    projectId: 'p1',
    write: (data: string) => sink.push(data),
    reset: () => undefined,
    onState: (state: any) => states.push(state),
  })
  return { session, fake, calls: fake.calls, log: fake.log, controller, sink, states }
}

test('新建 tab 追加并激活，重复 sessionId 只激活', async () => {
  const { tabs } = await loadPanel()
  let state = tabs.createTabsState()
  state = tabs.addTab(state, info(1))
  assert.deepEqual(state.tabs.map((tab: any) => tab.label), ['终端 1'])
  assert.equal(state.activeSessionId, 's1')

  state = tabs.addTab(state, info(2))
  assert.deepEqual(state.tabs.map((tab: any) => tab.label), ['终端 1', '终端 2'])
  assert.equal(state.activeSessionId, 's2')

  state = tabs.activateTab(state, 's1')
  const again = tabs.addTab(state, info(1))
  assert.equal(again.tabs.length, 2, '同一会话不能出现两个 tab')
  assert.equal(again.activeSessionId, 's1')
})

test('关闭 tab 激活右邻再左邻，全部关闭后没有激活项', async () => {
  const { tabs } = await loadPanel()
  let state = tabs.createTabsState()
  state = tabs.addTab(state, info(1))
  state = tabs.addTab(state, info(2))
  state = tabs.addTab(state, info(3))

  state = tabs.activateTab(state, 's2')
  const closed = tabs.removeTab(state, 's2')
  assert.equal(closed.activeSessionId, 's3', '优先激活右邻')

  const closedLast = tabs.removeTab(closed, 's3')
  assert.equal(closedLast.activeSessionId, 's1', '没有右邻时激活左邻')

  const closedAll = tabs.removeTab(closedLast, 's1')
  assert.equal(closedAll.activeSessionId, null)
  assert.deepEqual(closedAll.tabs, [])
})

test('关闭非激活 tab 不改变激活项，未知 id 不产生变化', async () => {
  const { tabs } = await loadPanel()
  let state = tabs.createTabsState()
  state = tabs.addTab(state, info(1))
  state = tabs.addTab(state, info(2))

  const closed = tabs.removeTab(state, 's1')
  assert.equal(closed.activeSessionId, 's2')
  assert.equal(tabs.removeTab(closed, 'missing'), closed, '未知会话必须原样返回')
})

test('已退出的 tab 不占用每工作区上限', async () => {
  const { tabs } = await loadPanel()
  let state = tabs.createTabsState()
  state = tabs.addTab(state, info(1))
  state = tabs.addTab(state, info(2))
  assert.equal(tabs.liveTabCount(state), 2)
  assert.equal(tabs.canCreateTab(state, 2), false)

  state = tabs.updateTab(state, 's1', { phase: 'exited' })
  assert.equal(tabs.liveTabCount(state), 1)
  assert.equal(tabs.canCreateTab(state, 2), true, '退出的 tab 不应阻止新建终端')
  assert.equal(tabs.canCreateTab(state, 1), false)
})

test('状态更新只改目标 tab，并在无变化时保持引用', async () => {
  const { tabs } = await loadPanel()
  let state = tabs.createTabsState()
  state = tabs.addTab(state, info(1))
  state = tabs.addTab(state, info(2))

  const updated = tabs.updateTab(state, 's1', { phase: 'failed', error: '无法启动终端：boom' })
  assert.equal(updated.tabs[0].phase, 'failed')
  assert.equal(updated.tabs[0].error, '无法启动终端：boom')
  assert.equal(updated.tabs[1].phase, 'running', '其它 tab 不受影响')
  assert.equal(tabs.updateTab(updated, 's1', { phase: 'failed', error: '无法启动终端：boom' }), updated, '相同状态不触发重渲染')
  assert.equal(updated.activeSessionId, state.activeSessionId)
})

test('renderer 重载后按 ordinal 恢复 tab 并激活最新会话', async () => {
  const { tabs } = await loadPanel()
  const state = tabs.adoptSessions([info(2), info(1, { status: 'exited', exit: { code: 130, signal: null } })])
  assert.deepEqual(state.tabs.map((tab: any) => tab.label), ['终端 1', '终端 2'])
  assert.equal(state.tabs[0].phase, 'exited')
  assert.equal(state.activeSessionId, 's2')
  assert.deepEqual(tabs.adoptSessions([]), { tabs: [], activeSessionId: null })
})

test('控制器先订阅再附着并回放快照，随后按序号续传', async () => {
  const { fake, controller, sink } = await createControllerFixture()

  await controller.attach('s1', 100, 30)

  assert.deepEqual(fake.log.slice(0, 2), ['subscribe', 'attach'])
  assert.deepEqual(fake.calls.attach, [{ projectId: 'p1', sessionId: 's1', sinceSeq: 0 }])
  assert.equal(sink.join(''), 'hello')
  assert.equal(controller.getState().phase, 'running')
  assert.equal(controller.getState().lastSeq, 1)

  fake.emit({ subscriptionId: 'other', event: { type: 'output', projectId: 'p1', sessionId: 's1', seq: 2, data: 'foreign' } })
  fake.emit({ subscriptionId: 'sub-1', event: { type: 'output', projectId: 'p1', sessionId: 's1', seq: 1, data: 'dup' } })
  assert.equal(sink.join(''), 'hello', '重复或他人订阅的输出不能写入')

  fake.emit({ subscriptionId: 'sub-1', event: { type: 'output', projectId: 'p1', sessionId: 's1', seq: 2, data: ' world' } })
  assert.equal(sink.join(''), 'hello world')
  fake.emit({ subscriptionId: 'sub-1', event: { type: 'output', projectId: 'p1', sessionId: 's1', seq: 4, data: '!' } })
  assert.equal(controller.getState().truncated, true, '序号缺口必须显式暴露')
})

test('截断与 dropped 事件进入控制器状态', async () => {
  const { fake, controller } = await createControllerFixture()
  await controller.attach('s1', 100, 30)

  fake.emit({ subscriptionId: 'sub-1', event: { type: 'dropped', projectId: 'p1', sessionId: 's1', bytes: 256 } })
  assert.equal(controller.getState().truncated, true)
  assert.equal(controller.getState().droppedBytes, 256)

  fake.setAttachResult({ subscriptionId: 'sub-2', chunks: [], nextSeq: 8, truncated: true })
  await controller.attach('s2', 100, 30)
  assert.equal(controller.getState().truncated, true)
  assert.equal(controller.getState().lastSeq, 7, '快照给出 nextSeq 时不能重复回放')
})

test('状态事件驱动阶段变化，退出的会话不再接受输入', async () => {
  const { fake, controller, calls } = await createControllerFixture()
  await controller.attach('s1', 100, 30)
  await controller.send('ls\r')
  assert.deepEqual(calls.write, [{ projectId: 'p1', sessionId: 's1', data: 'ls\r' }])

  fake.emit({ subscriptionId: 'sub-1', event: { type: 'state', projectId: 'p1', sessionId: 's1', info: info(1, { status: 'exited', pid: null, exit: { code: 130, signal: null } }) } })
  assert.equal(controller.getState().phase, 'exited')
  assert.deepEqual(controller.getState().info.exit, { code: 130, signal: null })
  await controller.send('echo late\r')
  assert.equal(calls.write.length, 1)
})

test('终止调用主进程，dispose 只解绑订阅', async () => {
  const { fake, controller, calls } = await createControllerFixture()
  await controller.attach('s1', 100, 30)
  await controller.terminate()
  assert.deepEqual(calls.terminate, [{ projectId: 'p1', sessionId: 's1' }])
  assert.equal(controller.getState().phase, 'exited')

  await controller.dispose()
  assert.equal(fake.log.filter(entry => entry === 'unsubscribe').length, 1)
  assert.deepEqual(calls.detach, ['sub-1'])
  assert.equal(calls.terminate.length, 1, '关闭面板不得终止进程')
})

test('尺寸只在运行中且数值变化时传递', async () => {
  const { controller, calls } = await createControllerFixture()
  await controller.attach('s1', 100, 30)
  assert.deepEqual(calls.resize, [{ projectId: 'p1', sessionId: 's1', cols: 100, rows: 30 }], '附着后立即对齐尺寸')

  await controller.resize(120, 40)
  assert.equal(calls.resize.length, 2)
  await controller.resize(120, 40)
  assert.equal(calls.resize.length, 2, '相同尺寸不重复发送')
})

test('附着失败进入 failed 并给出可读原因', async () => {
  const { session, fake } = await createControllerFixture()
  const states: any[] = []
  const controller = session.createTerminalController({
    api: { ...fake.api, attach: async () => { throw new Error('终端会话不存在。') } },
    projectId: 'p1',
    write: () => undefined,
    reset: () => undefined,
    onState: (state: any) => states.push(state),
  })

  await controller.attach('gone', 80, 24)
  assert.equal(controller.getState().phase, 'failed')
  assert.match(controller.getState().error, /终端会话不存在/)
})

test('tab 条渲染会话名、状态点、激活标记与新建按钮', async () => {
  const { panel } = await loadPanel()
  const tabs = [
    { sessionId: 's1', ordinal: 1, label: '终端 1', phase: 'exited', truncated: false, droppedBytes: 0, error: null },
    { sessionId: 's2', ordinal: 2, label: '终端 2', phase: 'running', truncated: false, droppedBytes: 0, error: null },
  ]
  const html = renderToStaticMarkup(
    React.createElement(panel.TerminalTabsView, {
      tabs,
      activeSessionId: 's2',
      canCreate: true,
      createHint: '',
      onCreate: () => undefined,
      onSelect: () => undefined,
      onClose: () => undefined,
    }),
  )

  assert.match(html, /终端 1/)
  assert.match(html, /终端 2/)
  assert.match(html, /data-status="exited"/)
  assert.match(html, /data-status="running"/)
  assert.match(html, /aria-selected="true"/)
  assert.match(html, /aria-label="新建终端"/)
  assert.match(html, /aria-label="关闭终端 1"/)
  assert.doesNotMatch(html, /PID|重新启动/, '面板顶部不再显示状态信息与终止/重启文字')
})

test('达到上限时新建按钮禁用并给出真实原因', async () => {
  const { panel } = await loadPanel()
  const html = renderToStaticMarkup(
    React.createElement(panel.TerminalTabsView, {
      tabs: [{ sessionId: 's1', ordinal: 1, label: '终端 1', phase: 'running', truncated: false, droppedBytes: 0, error: null }],
      activeSessionId: 's1',
      canCreate: false,
      createHint: '每个工作区最多同时打开 4 个终端（当前 4 个）。',
      onCreate: () => undefined,
      onSelect: () => undefined,
      onClose: () => undefined,
    }),
  )
  assert.match(html, /disabled/)
  assert.match(html, /最多同时打开 4 个终端/)
})

test('会话状态区显示启动、退出、失败与截断提示', async () => {
  const { panel } = await loadPanel()
  const render = (view: any) => renderToStaticMarkup(React.createElement(panel.TerminalSessionStatus, { view, onCreate: () => undefined }))

  const starting = render({ phase: 'starting', info: null, sessionId: 's1', lastSeq: 0, truncated: false, droppedBytes: 0, error: null })
  assert.match(starting, /正在启动终端/)

  const exited = render({ phase: 'exited', info: info(1, { status: 'exited', exit: { code: 130, signal: null } }), sessionId: 's1', lastSeq: 0, truncated: false, droppedBytes: 0, error: null })
  assert.match(exited, /已退出/)
  assert.match(exited, /130/)
  assert.match(exited, /新建终端/)

  const failed = render({ phase: 'failed', info: null, sessionId: 's1', lastSeq: 0, truncated: false, droppedBytes: 0, error: '无法附着终端：会话不存在。' })
  assert.match(failed, /无法附着终端：会话不存在。/)
  assert.match(failed, /新建终端/)

  const truncated = render({ phase: 'running', info: info(1), sessionId: 's1', lastSeq: 9, truncated: true, droppedBytes: 512, error: null })
  assert.match(truncated, /丢弃/)
  assert.equal(render({ phase: 'running', info: info(1), sessionId: 's1', lastSeq: 9, truncated: false, droppedBytes: 0, error: null }), '')
})

test('面板在没有工作区时说明原因，且不静默写剪贴板或打开外链', async () => {
  const { panel } = await loadPanel()
  const html = renderToStaticMarkup(
    React.createElement(panel.default, {
      instanceId: 'terminal',
      panelId: 'terminal',
      scopeId: '',
      context: { chatId: 'chat-1', projectId: null },
      data: {},
    }),
  )
  assert.match(html, /工作区/)

  const sources = await Promise.all([
    readFile('src/renderer/src/components/panels/TerminalPanel.tsx', 'utf8'),
    readFile('src/renderer/src/lib/terminal/terminalSession.ts', 'utf8'),
    readFile('src/renderer/src/lib/terminal/terminalTabs.ts', 'utf8'),
  ])
  for (const text of sources) {
    assert.doesNotMatch(text, /navigator\.clipboard|clipboard\.writeText/, '终端输出不得静默写剪贴板')
    assert.doesNotMatch(text, /addon-web-links|shell\.openExternal|window\.open\(/, '终端输出不得自动打开外链')
  }
})
