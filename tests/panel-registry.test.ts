import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import test from 'node:test'
import { createServer } from 'vite'

const alias = { '@': resolve('src/renderer/src'), '@shared': resolve('src/shared') }

test('面板注册表描述符完整、无冲突，懒加载模块都能解析', async () => {
  const vite = await createServer({ logLevel: 'silent', server: { middlewareMode: true }, resolve: { alias } })
  try {
    const { DEFAULT_PANEL_ID, panelDescriptors } = await vite.ssrLoadModule('/src/renderer/src/lib/panels/descriptors.ts')
    const { createPanelRegistry, panelScopeId, validatePanelDescriptors } = await vite.ssrLoadModule('/src/renderer/src/lib/panels/registry.ts')

    assert.deepEqual(validatePanelDescriptors(panelDescriptors), [])
    assert.deepEqual(panelDescriptors.map(descriptor => descriptor.id), ['review', 'terminal', 'browser', 'files', 'side-chat'])
    assert.equal(panelDescriptors.some(descriptor => descriptor.id === DEFAULT_PANEL_ID), true)
    assert.equal(panelDescriptors.every(descriptor => descriptor.multiplicity === 'single'), true)

    for (const descriptor of panelDescriptors) {
      const module = await descriptor.load()
      assert.equal(typeof module.default, 'function', `${descriptor.id} 面板缺少默认导出组件`)
    }

    const registry = createPanelRegistry(panelDescriptors)
    const empty = { chatId: null, projectId: null }
    const resolved = registry.resolve(empty)
    assert.equal(resolved.length, panelDescriptors.length)
    assert.deepEqual(resolved.filter(entry => entry.available).map(entry => entry.descriptor.id), ['browser', 'side-chat'])
    for (const entry of resolved.filter(candidate => !candidate.available)) {
      assert.equal(typeof entry.reason, 'string')
      assert.notEqual(entry.reason, '')
    }

    const contextual = { chatId: 'chat-1', projectId: 'project-1' }
    assert.equal(registry.find('review', contextual)?.scopeId, 'chat-1')
    assert.equal(registry.find('terminal', contextual)?.scopeId, 'chat-1')
    assert.equal(registry.find('files', contextual)?.scopeId, 'project-1')
    assert.equal(registry.find('browser', contextual)?.scopeId, '')
    assert.equal(registry.find('missing', contextual), undefined)
    assert.equal(registry.isKnown('missing'), false)
    assert.deepEqual(registry.shortcutCandidates(empty).filter(candidate => candidate.available).map(candidate => candidate.id), ['browser', 'side-chat'])

    assert.equal(panelScopeId({ scope: 'global' }, contextual), '')
    assert.equal(validatePanelDescriptors([
      { ...panelDescriptors[0], title: '' },
      { ...panelDescriptors[1], id: panelDescriptors[0].id },
      { ...panelDescriptors[2], shortcut: panelDescriptors[0].shortcut },
    ]).length, 3, '重复 id、重复快捷键与空标题都应被注册期校验捕获')
  } finally {
    await vite.close()
  }
})

test('类型化面板打开请求拒绝非法结构', async () => {
  const vite = await createServer({ logLevel: 'silent', server: { middlewareMode: true }, resolve: { alias } })
  try {
    const { parsePanelOpenRequest } = await vite.ssrLoadModule('/src/renderer/src/lib/panels/panelData.ts')
    const preview = { url: 'https://example.com/a', content: '正文', title: '标题' }

    assert.deepEqual(parsePanelOpenRequest({ panelId: 'browser', data: { preview } }), { panelId: 'browser', data: { preview } })
    assert.deepEqual(parsePanelOpenRequest({ panelId: 'review' }), { panelId: 'review', data: undefined })
    for (const invalid of [null, undefined, 'browser', 42, {}, { panelId: '' }, { panelId: 'browser', data: { preview: { url: 1, content: 'x' } } }, { panelId: 'browser', data: { preview: { url: 'https://a' } } }]) {
      assert.equal(parsePanelOpenRequest(invalid), null, `非法请求应被拒绝: ${JSON.stringify(invalid)}`)
    }
  } finally {
    await vite.close()
  }
})

test('面板打开不再经全局 DOM 事件广播', async () => {
  const fallback = await readFile('src/renderer/src/components/chat/tools/StructuredToolFallback.tsx', 'utf8')
  const shell = await readFile('src/renderer/src/components/layout/AppShell.tsx', 'utf8')

  assert.match(fallback, /requestPanelOpen\(\{ panelId: "browser"/)
  assert.doesNotMatch(fallback, /sailor:web-preview/)
  assert.doesNotMatch(shell, /sailor:web-preview/)
  assert.doesNotMatch(shell, /dispatchEvent/)
  assert.match(shell, /subscribePanelRequests/)
})
