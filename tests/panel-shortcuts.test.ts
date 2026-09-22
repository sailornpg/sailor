import assert from 'node:assert/strict'
import test from 'node:test'

async function loadShortcuts() {
  try {
    return await import('../src/renderer/src/lib/panels/shortcuts.ts')
  } catch {
    assert.fail('面板快捷键模块尚未实现')
  }
}

const key = (overrides: Partial<Record<string, unknown>> = {}) => ({
  key: 'g',
  metaKey: false,
  ctrlKey: false,
  shiftKey: false,
  altKey: false,
  ...overrides,
})

test('按平台格式化展示文案', async () => {
  const { formatShortcut } = await loadShortcuts()
  assert.equal(formatShortcut({ key: 'g', ctrl: true, shift: true }, 'mac'), '⌃⇧G')
  assert.equal(formatShortcut({ key: '`', ctrl: true }, 'mac'), '⌃`')
  assert.equal(formatShortcut({ key: 's', meta: true, alt: true }, 'mac'), '⌥⌘S')
  assert.equal(formatShortcut({ key: 't', meta: true }, 'other'), 'Ctrl+T')
  assert.equal(formatShortcut({ key: 'g', ctrl: true, shift: true }, 'other'), 'Ctrl+Shift+G')
})

test('平台检测区分 macOS 与其它平台', async () => {
  const { detectPanelPlatform } = await loadShortcuts()
  assert.equal(detectPanelPlatform('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)'), 'mac')
  assert.equal(detectPanelPlatform('Mozilla/5.0 (Windows NT 10.0; Win64; x64)'), 'other')
})

test('修饰键必须精确匹配，多余修饰键不触发', async () => {
  const { matchesShortcut } = await loadShortcuts()
  const review = { key: 'g', ctrl: true, shift: true }

  assert.equal(matchesShortcut(key({ ctrlKey: true, shiftKey: true }), review, 'mac'), true)
  assert.equal(matchesShortcut(key({ ctrlKey: true }), review, 'mac'), false)
  assert.equal(matchesShortcut(key({ ctrlKey: true, shiftKey: true, altKey: true }), review, 'mac'), false)
  assert.equal(matchesShortcut(key({ ctrlKey: true, shiftKey: true, metaKey: true }), review, 'mac'), false)
  assert.equal(matchesShortcut(key({ ctrlKey: true, shiftKey: true, key: 'H' }), review, 'mac'), false)
})

test('macOS 上 ⌘ 与 ⌃ 是不同修饰键，其它平台统一落到 Ctrl', async () => {
  const { matchesShortcut } = await loadShortcuts()
  const browser = { key: 't', meta: true }
  const terminal = { key: '`', ctrl: true }

  assert.equal(matchesShortcut(key({ key: 't', metaKey: true }), browser, 'mac'), true)
  assert.equal(matchesShortcut(key({ key: 't', ctrlKey: true }), browser, 'mac'), false)
  assert.equal(matchesShortcut(key({ key: '`', ctrlKey: true }), terminal, 'mac'), true)
  assert.equal(matchesShortcut(key({ key: '`', metaKey: true }), terminal, 'mac'), false)
  assert.equal(matchesShortcut(key({ key: 't', ctrlKey: true }), browser, 'other'), true)
  assert.equal(matchesShortcut(key({ key: '`', ctrlKey: true }), terminal, 'other'), true)
  assert.equal(matchesShortcut(key({ key: 't', metaKey: true }), browser, 'other'), false, '其它平台不接受 Win/Super 键')
})

test('输入焦点内不接受无修饰键的快捷键', async () => {
  const { findPanelShortcut } = await loadShortcuts()
  const candidates = [{ id: 'review', shortcut: { key: 'g', ctrl: true, shift: true }, available: true }]
  const input = { tagName: 'TEXTAREA' }

  assert.equal(findPanelShortcut({ ...key({ ctrlKey: true, shiftKey: true }), target: input }, candidates, 'mac'), 'review')
  assert.equal(findPanelShortcut({ ...key({ key: 't', metaKey: true }), target: input }, [{ id: 'browser', shortcut: { key: 't', meta: true }, available: true }], 'mac'), 'browser')
  assert.equal(findPanelShortcut({ ...key(), target: input }, candidates, 'mac'), null, '普通按键必须留给 composer')
  assert.equal(findPanelShortcut({ ...key(), target: { tagName: 'DIV' } }, candidates, 'mac'), null)
})

test('不可用面板不吞掉快捷键', async () => {
  const { findPanelShortcut } = await loadShortcuts()
  const event = key({ ctrlKey: true, shiftKey: true })
  assert.equal(findPanelShortcut(event, [{ id: 'review', shortcut: { key: 'g', ctrl: true, shift: true }, available: false }], 'mac'), null)
  assert.equal(findPanelShortcut(event, [{ id: 'review', shortcut: { key: 'g', ctrl: true, shift: true }, available: true }], 'mac'), 'review')
})

test('快捷键签名稳定，可用于注册期冲突检测', async () => {
  const { shortcutSignature } = await loadShortcuts()
  assert.equal(shortcutSignature({ key: 'G', ctrl: true, shift: true }), 'ctrl+shift+g')
  assert.equal(shortcutSignature({ key: 's', meta: true, alt: true }), 'meta+alt+s')
  assert.equal(shortcutSignature({ key: 's', alt: true, meta: true }), 'meta+alt+s')
  assert.notEqual(shortcutSignature({ key: 'g', ctrl: true, shift: true }), shortcutSignature({ key: 'g', ctrl: true }))
})
