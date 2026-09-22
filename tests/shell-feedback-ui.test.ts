import assert from 'node:assert/strict'
import test from 'node:test'
import { createServer, type ViteDevServer } from 'vite'

let vite: ViteDevServer
let feedback: typeof import('../src/renderer/src/lib/shellExecutionFeedback.ts')

test.before(async () => {
  vite = await createServer({ logLevel: 'silent', resolve: { alias: { '@shared': `${process.cwd()}/src/shared`, '@': `${process.cwd()}/src/renderer/src` } }, server: { middlewareMode: true } })
  feedback = await vite.ssrLoadModule('/src/renderer/src/lib/shellExecutionFeedback.ts') as typeof feedback
})

test.after(async () => { await vite?.close() })

test('projects shell output, truncation, exit metadata and termination reason for ToolFallback', async () => {
  const failed = {
    schemaVersion: 1, toolCallId: 'call', tool: 'execute_shell', ok: false as const,
    summary: '命令退出码 2', durationMs: 12, effects: { kind: 'none' as const }, truncated: true,
    artifactRefs: [{ id: '/tmp/call.log', kind: 'shell-log', label: '完整命令日志' }],
    error: { code: 'COMMAND_FAILED' as const, message: '命令执行失败。', retryable: false, details: { exitCode: 2, signal: null, terminationReason: 'non-zero', stdoutTail: 'out', stderrTail: 'err' }, recovery: [{ action: 'inspect_log', reason: '查看完整日志' }] },
  }
  const view = feedback.projectShellExecutionFeedback({ toolName: 'execute_shell', args: { command: 'false', cwd: '.', timeoutMs: 1000 }, result: failed, status: 'complete' })
  assert.equal(view?.phase, 'failed')
  assert.equal(view?.exitCode, 2)
  assert.equal(view?.truncated, true)
  assert.equal(view?.logRef?.kind, 'shell-log')
  assert.equal(view?.terminationReason, 'non-zero')
})

test('throttles live log updates and keeps official ToolFallback and ToolGroup composition', async () => {
  let now = 0
  const throttle = feedback.createShellLogThrottle(50, () => now)
  assert.equal(throttle.push('a'), 'a')
  now = 10
  assert.equal(throttle.push('b'), null)
  now = 60
  assert.equal(throttle.push('c'), 'bc')
  const structuredSource = await (await import('node:fs/promises')).readFile('src/renderer/src/components/chat/tools/StructuredToolFallback.tsx', 'utf8')
  const threadSource = await (await import('node:fs/promises')).readFile('src/renderer/src/components/assistant-ui/elements/thread.aui.tsx', 'utf8')
  assert.match(structuredSource, /ToolFallback\.Root/)
  assert.match(structuredSource, /execute_shell/)
  assert.match(threadSource, /ToolGroupRoot/)
})
