import assert from 'node:assert/strict'
import test from 'node:test'

async function loadLayout() {
  try {
    return await import('../src/renderer/src/lib/panels/layout.ts')
  } catch {
    assert.fail('面板布局模块尚未实现')
  }
}

function storage(initial: Record<string, string> = {}): Storage {
  const values = new Map(Object.entries(initial))
  return {
    get length() { return values.size },
    clear() { values.clear() },
    getItem(key) { return values.get(key) ?? null },
    key(index) { return [...values.keys()][index] ?? null },
    removeItem(key) { values.delete(key) },
    setItem(key, value) { values.set(key, value) },
  }
}

test('打开面板会去重、激活并保持 tab 顺序', async () => {
  const { createDefaultPanelLayout, createPanelInstanceId, panelLayoutReducer } = await loadLayout()
  const review = { instanceId: createPanelInstanceId('review', 'chat-1'), panelId: 'review', scopeId: 'chat-1' }
  const browser = { instanceId: createPanelInstanceId('browser'), panelId: 'browser', scopeId: '' }

  let state = createDefaultPanelLayout()
  assert.equal(state.visible, false)

  state = panelLayoutReducer(state, { type: 'open', instance: review, multiplicity: 'single' })
  assert.equal(state.visible, true)
  assert.equal(state.activeInstanceId, review.instanceId)
  assert.deepEqual(state.lastActive, review)

  state = panelLayoutReducer(state, { type: 'open', instance: browser, multiplicity: 'single' })
  assert.deepEqual(state.open.map(item => item.panelId), ['review', 'browser'])
  assert.equal(state.activeInstanceId, browser.instanceId)

  state = panelLayoutReducer(state, { type: 'open', instance: review, multiplicity: 'single' })
  assert.equal(state.open.length, 2)
  assert.equal(state.activeInstanceId, review.instanceId)
})

test('单实例面板按 panel+scope 去重，多实例面板按 instanceId 区分', async () => {
  const { createDefaultPanelLayout, panelLayoutReducer } = await loadLayout()
  const first = { instanceId: 'side-chat#1', panelId: 'side-chat', scopeId: '' }
  const second = { instanceId: 'side-chat#2', panelId: 'side-chat', scopeId: '' }

  let state = createDefaultPanelLayout()
  state = panelLayoutReducer(state, { type: 'open', instance: first, multiplicity: 'multi' })
  state = panelLayoutReducer(state, { type: 'open', instance: second, multiplicity: 'multi' })
  assert.equal(state.open.length, 2)

  const replacement = { instanceId: 'side-chat#3', panelId: 'side-chat', scopeId: '' }
  state = panelLayoutReducer(state, { type: 'open', instance: replacement, multiplicity: 'single' })
  assert.equal(state.open.length, 2, '单实例语义不会新增同 slot 的 tab')
  assert.deepEqual(state.open.map(item => item.instanceId), ['side-chat#1', 'side-chat#2'], '单实例语义激活已有实例而不是替换它')
  assert.equal(state.activeInstanceId, 'side-chat#1')
})

test('关闭激活 tab 后激活相邻项，关闭最后一个 tab 后保留功能列表可见性', async () => {
  const { createDefaultPanelLayout, panelLayoutReducer } = await loadLayout()
  const review = { instanceId: 'review', panelId: 'review', scopeId: '' }
  const files = { instanceId: 'files', panelId: 'files', scopeId: '' }
  const browser = { instanceId: 'browser', panelId: 'browser', scopeId: '' }

  let state = createDefaultPanelLayout()
  for (const instance of [review, files, browser]) state = panelLayoutReducer(state, { type: 'open', instance })

  state = panelLayoutReducer(state, { type: 'activate', instanceId: files.instanceId })
  state = panelLayoutReducer(state, { type: 'close', instanceId: files.instanceId })
  assert.equal(state.activeInstanceId, browser.instanceId, '关闭中间 tab 后应激活右侧相邻项')
  assert.equal(state.visible, true)

  state = panelLayoutReducer(state, { type: 'close', instanceId: browser.instanceId })
  assert.equal(state.activeInstanceId, review.instanceId, '关闭最后一个 tab 后应回退到左侧相邻项')

  state = panelLayoutReducer(state, { type: 'close', instanceId: review.instanceId })
  assert.equal(state.activeInstanceId, null)
  assert.deepEqual(state.open, [])
  assert.equal(state.visible, true, 'dock 顶部常驻功能列表，关掉最后一个 tab 后仍应可见')
  assert.equal(state.lastActive?.panelId, 'files', '关闭 tab 不应丢失“上次使用的面板”记忆')
})

test('可见性与是否打开面板解耦：空布局也能被显式打开', async () => {
  const { createDefaultPanelLayout, panelLayoutReducer } = await loadLayout()

  const shown = panelLayoutReducer(createDefaultPanelLayout(), { type: 'setVisible', visible: true })
  assert.equal(shown.visible, true, '没有打开任何面板时，点击开关也应能打开右栏功能列表')
  assert.deepEqual(shown.open, [], '打开右栏不应替用户选中任何面板')

  const review = { instanceId: 'review', panelId: 'review', scopeId: '' }
  const opened = panelLayoutReducer(shown, { type: 'open', instance: review })
  assert.equal(opened.visible, true)
  assert.deepEqual(opened.open.map(item => item.panelId), ['review'])

  const hidden = panelLayoutReducer(opened, { type: 'setVisible', visible: false })
  assert.equal(hidden.visible, false)
  assert.deepEqual(hidden.open.map(item => item.panelId), ['review'], '隐藏右栏不应关闭已打开的 tab')
})

test('激活不存在的实例、空布局显示、tab 上限与宽度越界都被约束', async () => {
  const { createDefaultPanelLayout, panelLayoutReducer, PANEL_TAB_LIMIT, PANEL_WIDTH_MAX, PANEL_WIDTH_MIN, clampPanelWidth } = await loadLayout()

  let state = createDefaultPanelLayout()
  const untouched = panelLayoutReducer(state, { type: 'activate', instanceId: 'missing' })
  assert.deepEqual(untouched, state)
  assert.equal(panelLayoutReducer(state, { type: 'setVisible', visible: true }).visible, true, '空布局也能切换可见性')

  for (let index = 0; index < PANEL_TAB_LIMIT + 2; index += 1) {
    state = panelLayoutReducer(state, { type: 'open', instance: { instanceId: `panel-${index}`, panelId: `panel-${index}`, scopeId: '' } })
  }
  assert.equal(state.open.length, PANEL_TAB_LIMIT)

  assert.equal(clampPanelWidth(10), PANEL_WIDTH_MIN)
  assert.equal(clampPanelWidth(9999), PANEL_WIDTH_MAX)
  assert.equal(panelLayoutReducer(state, { type: 'setWidth', width: 10 }).width, PANEL_WIDTH_MIN)
  assert.equal(panelLayoutReducer(state, { type: 'setWidth', width: Number.NaN }).width, state.width)
})

test('持久化往返保留布局，非法输入整体降级且不抛错', async () => {
  const { PANEL_LAYOUT_STORAGE_KEY, createDefaultPanelLayout, readPanelLayout, savePanelLayout } = await loadLayout()
  const target = storage()
  const layout = {
    ...createDefaultPanelLayout(),
    visible: true,
    width: 512,
    open: [{ instanceId: 'browser', panelId: 'browser', scopeId: '' }],
    activeInstanceId: 'browser',
    lastActive: { instanceId: 'browser', panelId: 'browser', scopeId: '' },
  }

  assert.equal(savePanelLayout(target, layout), true)
  assert.deepEqual(readPanelLayout(target), layout)
  assert.notEqual(readPanelLayout(target), layout, '读取结果应是新对象，避免共享引用')

  for (const raw of ['{broken', 'null', '[]', JSON.stringify({ version: 99 }), JSON.stringify({ version: 1, visible: 'yes', open: [] })]) {
    assert.deepEqual(readPanelLayout(storage({ [PANEL_LAYOUT_STORAGE_KEY]: raw })), createDefaultPanelLayout())
  }

  const broken = storage()
  broken.getItem = () => { throw new Error('storage unavailable') }
  assert.deepEqual(readPanelLayout(broken), createDefaultPanelLayout())
  assert.equal(savePanelLayout(undefined, layout), false)
})

test('读取时修复越界宽度、失效激活项与未知面板', async () => {
  const { PANEL_LAYOUT_STORAGE_KEY, createPanelInstanceId, parsePanelLayout, readPanelLayout, retainKnownPanels } = await loadLayout()
  const repaired = readPanelLayout(storage({
    [PANEL_LAYOUT_STORAGE_KEY]: JSON.stringify({
      version: 1,
      visible: true,
      width: 100000,
      open: [
        { instanceId: 'review', panelId: 'review', scopeId: '' },
        { instanceId: 'review', panelId: 'review', scopeId: '' },
        { instanceId: 'browser', panelId: 'browser', scopeId: '' },
      ],
      activeInstanceId: 'gone',
      lastActive: null,
    }),
  }))
  assert.equal(repaired.width, 720)
  assert.deepEqual(repaired.open.map(item => item.panelId), ['review', 'browser'])
  assert.equal(repaired.activeInstanceId, 'review', '失效的激活项应回退到第一个 tab')

  const parsed = parsePanelLayout(JSON.stringify({ version: 1, visible: true, width: 384, open: [], activeInstanceId: null, lastActive: null }))
  assert.equal(parsed.visible, true, '空布局的可见性应原样恢复')
  assert.deepEqual(parsed.open, [])

  const state = {
    version: 1,
    visible: true,
    width: 384,
    open: [
      { instanceId: createPanelInstanceId('review', 'chat-1'), panelId: 'review', scopeId: 'chat-1' },
      { instanceId: 'retired', panelId: 'retired', scopeId: '' },
    ],
    activeInstanceId: 'retired',
    lastActive: { instanceId: 'retired', panelId: 'retired', scopeId: '' },
  }
  const retained = retainKnownPanels(state, panelId => panelId !== 'retired')
  assert.deepEqual(retained.open.map(item => item.panelId), ['review'])
  assert.equal(retained.activeInstanceId, createPanelInstanceId('review', 'chat-1'))
  assert.equal(retained.visible, true)
})

test('切换上下文时会话/工作区面板重新绑定 scope', async () => {
  const { createDefaultPanelLayout, createPanelInstanceId, rebindPanelScopes } = await loadLayout()
  const scoped = (panelId: string, scopeId: string) => ({ instanceId: createPanelInstanceId(panelId, scopeId), panelId, scopeId })
  const state = {
    ...createDefaultPanelLayout(),
    visible: true,
    open: [scoped('review', 'chat-1'), scoped('browser', '')],
    activeInstanceId: createPanelInstanceId('review', 'chat-1'),
    lastActive: scoped('review', 'chat-1'),
  }

  const scopeIds: Record<string, string> = { review: 'chat-2', browser: '' }
  const rebound = rebindPanelScopes(state, panelId => scopeIds[panelId] ?? '')
  assert.deepEqual(rebound.open.map(item => item.scopeId), ['chat-2', ''])
  assert.equal(rebound.activeInstanceId, createPanelInstanceId('review', 'chat-2'))
  assert.equal(rebound.lastActive?.scopeId, 'chat-2')
  assert.equal(rebindPanelScopes(rebound, panelId => scopeIds[panelId] ?? ''), rebound, '无变化时应返回原对象')
})
