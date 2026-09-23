import assert from 'node:assert/strict'
import test from 'node:test'

async function loadUiLayout() {
  try {
    return await import('../src/renderer/src/lib/layout/uiLayout.ts')
  } catch {
    assert.fail('外壳布局模块尚未实现')
  }
}

function storage(initial: Record<string, string> = {}) {
  const values = new Map(Object.entries(initial))
  return {
    getItem(key: string) { return values.get(key) ?? null },
    setItem(key: string, value: string) { values.set(key, value) },
    dump() { return Object.fromEntries(values) },
  }
}

test('侧栏宽度 clamp 到合法区间，非法值回退默认', async () => {
  const { SIDEBAR_WIDTH_DEFAULT, SIDEBAR_WIDTH_MAX, SIDEBAR_WIDTH_MIN, clampSidebarWidth } = await loadUiLayout()

  assert.equal(clampSidebarWidth(SIDEBAR_WIDTH_MIN - 1), SIDEBAR_WIDTH_MIN)
  assert.equal(clampSidebarWidth(SIDEBAR_WIDTH_MAX + 1), SIDEBAR_WIDTH_MAX)
  assert.equal(clampSidebarWidth(301.4), 301)
  assert.equal(clampSidebarWidth(Number.NaN), SIDEBAR_WIDTH_DEFAULT)
  assert.equal(clampSidebarWidth(Number.POSITIVE_INFINITY), SIDEBAR_WIDTH_DEFAULT)
})

test('reducer 只接受真实宽度变更，重复收起请求保持同一引用', async () => {
  const { clampSidebarWidth, createDefaultUiLayout, uiLayoutReducer } = await loadUiLayout()

  let state = createDefaultUiLayout()
  assert.equal(state.leftCollapsed, false)

  state = uiLayoutReducer(state, { type: 'setLeftCollapsed', collapsed: true })
  assert.equal(state.leftCollapsed, true)

  const repeated = uiLayoutReducer(state, { type: 'setLeftCollapsed', collapsed: true })
  assert.equal(repeated, state, '相同状态不应触发新的渲染')

  const widened = uiLayoutReducer(state, { type: 'setLeftWidth', width: 999 })
  assert.equal(widened.leftWidth, clampSidebarWidth(999))

  const ignored = uiLayoutReducer(state, { type: 'setLeftWidth', width: Number.NaN })
  assert.equal(ignored, state, '非法宽度不应写进状态')
})

test('持久化数据非法或版本不符时整体降级到默认布局', async () => {
  const { SIDEBAR_WIDTH_DEFAULT, UI_LAYOUT_VERSION, createDefaultUiLayout, parseUiLayout } = await loadUiLayout()

  assert.deepEqual(parseUiLayout(null), createDefaultUiLayout())
  assert.deepEqual(parseUiLayout('{'), createDefaultUiLayout())
  assert.deepEqual(parseUiLayout('"nope"'), createDefaultUiLayout())
  assert.deepEqual(parseUiLayout(JSON.stringify({ version: UI_LAYOUT_VERSION - 1, leftWidth: 320, leftCollapsed: true })), createDefaultUiLayout())
  assert.equal(parseUiLayout(JSON.stringify({ version: UI_LAYOUT_VERSION })).leftWidth, SIDEBAR_WIDTH_DEFAULT)
  assert.equal(parseUiLayout(JSON.stringify({ version: UI_LAYOUT_VERSION, leftCollapsed: 'yes' })).leftCollapsed, false, '非布尔值不能当成已收起')
})

test('持久化读写在 storage 抛错时不抛异常', async () => {
  const { UI_LAYOUT_STORAGE_KEY, createDefaultUiLayout, readUiLayout, saveUiLayout, serializeUiLayout } = await loadUiLayout()
  const throwing = {
    getItem() { throw new Error('blocked') },
    setItem() { throw new Error('blocked') },
  }

  assert.deepEqual(readUiLayout(undefined), createDefaultUiLayout())
  assert.deepEqual(readUiLayout(throwing), createDefaultUiLayout())
  assert.equal(saveUiLayout(throwing, createDefaultUiLayout()), false)

  const saved = { ...createDefaultUiLayout(), leftWidth: 320, leftCollapsed: true }
  const store = storage()
  assert.equal(saveUiLayout(store, saved), true)
  assert.equal(store.getItem(UI_LAYOUT_STORAGE_KEY), serializeUiLayout(saved))
  assert.equal(readUiLayout(store).leftWidth, 320)
  assert.equal(readUiLayout(store).leftCollapsed, true)
})
