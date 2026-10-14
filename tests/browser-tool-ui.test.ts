import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import test from 'node:test'
import { createServer, type ViteDevServer } from 'vite'

const alias = { '@': resolve('src/renderer/src'), '@shared': resolve('src/shared') }

let vite: ViteDevServer
let feedback: typeof import('../src/renderer/src/lib/browserFeedback.ts')

test.before(async () => {
  vite = await createServer({
    logLevel: 'silent',
    server: { middlewareMode: true },
    resolve: { alias },
  })
  feedback = (await vite.ssrLoadModule(
    '/src/renderer/src/lib/browserFeedback.ts',
  )) as typeof feedback
})

test.after(async () => {
  await vite?.close()
})

function successResult(data: unknown, extra: Record<string, unknown> = {}) {
  return {
    schemaVersion: 1,
    toolCallId: 'call-1',
    tool: 'browser_read_page',
    ok: true,
    summary: '读取到 3 个元素',
    durationMs: 12,
    effects: { kind: 'none' },
    truncated: false,
    data,
    ...extra,
  }
}

test('工具还在跑时显示进行中，而不是假装成功', () => {
  const view = feedback.projectBrowserFeedback({
    toolName: 'browser_navigate',
    result: undefined,
    status: 'running',
  })
  assert.equal(view.phase, 'running')
  assert.equal(view.errorCode, null)
})

test('成功结果带出摘要、结构化数据与截图引用', () => {
  const view = feedback.projectBrowserFeedback({
    toolName: 'browser_screenshot',
    result: successResult(
      { width: 800, height: 600, bytes: 1234, chatId: 'chat-1' },
      {
        artifactRefs: [{ id: 'capture-1', kind: 'browser-capture', label: '浏览器截图' }],
      },
    ),
    status: 'complete',
  })
  assert.equal(view.phase, 'succeeded')
  assert.equal(view.summary, '读取到 3 个元素')
  assert.equal(view.captureId, 'capture-1')
  assert.equal(view.data?.chatId, 'chat-1')
})

test('失败结果保留错误码与恢复建议，未授权时不让 UI 误报成功', () => {
  const view = feedback.projectBrowserFeedback({
    toolName: 'browser_click',
    result: {
      schemaVersion: 1,
      toolCallId: 'call-2',
      tool: 'browser_click',
      ok: false,
      summary: '浏览器当前不可由 Agent 操作',
      durationMs: 3,
      effects: { kind: 'none' },
      truncated: false,
      error: {
        code: 'PERMISSION_DENIED',
        message: '用户还没有允许 Agent 操作这个浏览器。',
        retryable: false,
        recovery: [
          { action: 'ask_user', reason: '请用户在浏览器面板打开「允许 Agent 操作」开关，再重试。' },
        ],
      },
    },
    status: 'complete',
  })
  assert.equal(view.phase, 'failed')
  assert.equal(view.errorCode, 'PERMISSION_DENIED')
  assert.equal(view.recovery.length, 1)
  assert.match(view.recovery[0]?.reason ?? '', /允许 Agent 操作/)
})

test('无法识别的结果不会当成成功渲染', () => {
  const view = feedback.projectBrowserFeedback({
    toolName: 'browser_read_page',
    result: 'not-a-tool-result',
    status: 'error',
  })
  assert.equal(view.phase, 'failed')
  assert.equal(view.errorCode, 'INTERNAL_ERROR')
})

test('长文本按上限截断，标签页列表被规范化', () => {
  const view = feedback.projectBrowserFeedback({
    toolName: 'browser_read_page',
    result: successResult({
      text: 'x'.repeat(5000),
      tabs: [{ id: 'tab-1', title: 'A', url: 'https://a.example' }, { bad: true }],
    }),
    status: 'complete',
  })
  assert.equal(feedback.browserViewText(view, 100).length < 200, true)
  const tabs = feedback.browserViewTabs(view)
  assert.equal(tabs.length, 1)
  assert.equal(tabs[0]?.id, 'tab-1')
})

test('会话卡片注册全部浏览器工具，并按 artifactRef 取截图', async () => {
  const toolkit = await readFile('src/renderer/src/components/chat/tools/sailorToolkit.tsx', 'utf8')
  for (const tool of [
    'browser_navigate',
    'browser_read_page',
    'browser_read_text',
    'browser_click',
    'browser_type',
    'browser_key',
    'browser_scroll',
    'browser_screenshot',
    'browser_console',
    'browser_tabs',
  ]) {
    assert.match(toolkit, new RegExp(`${tool}: backendTool\\(SailorBrowserTool\\)`))
  }

  const card = await readFile(
    'src/renderer/src/components/chat/tools/SailorBrowserTool.tsx',
    'utf8',
  )
  // 截图只按 main 的窄 IPC 取，renderer 不碰文件系统。
  assert.match(card, /browser\s*\n?\s*\.readCapture/)
  assert.doesNotMatch(card, /node:fs|require\('fs'\)/)
})
