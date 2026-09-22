import assert from 'node:assert/strict'
import test from 'node:test'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { createServer, type ViteDevServer } from 'vite'

let vite: ViteDevServer
let feedback: typeof import('../src/renderer/src/lib/fileChangeFeedback.ts')

test.before(async () => {
  vite = await createServer({
    logLevel: 'silent',
    resolve: { alias: { '@shared': `${process.cwd()}/src/shared`, '@': `${process.cwd()}/src/renderer/src` } },
    server: { middlewareMode: true },
  })
  feedback = await vite.ssrLoadModule('/src/renderer/src/lib/fileChangeFeedback.ts') as typeof feedback
})

test.after(async () => { await vite?.close() })

test('projects an approval or running patch with bounded preview and path', () => {
  const projected = feedback.projectFileChangeFeedback({
    toolName: 'apply_patch',
    args: { path: 'src/app.ts', patch: 'x'.repeat(10_000) },
    status: 'requires-action',
  })
  assert.deepEqual(projected?.phase, 'pending')
  assert.equal(projected?.path, 'src/app.ts')
  assert.equal(projected?.preview?.truncated, true)
  assert.equal(projected?.preview?.text.length, feedback.FILE_CHANGE_PREVIEW_CHARS)
})

test('projects an applied result with real effects, hashes, line counts and diff reference', () => {
  const result = {
    schemaVersion: 1, toolCallId: 'call-1', tool: 'apply_patch', ok: true as const,
    summary: '已应用补丁 src/app.ts', durationMs: 4, effects: { kind: 'applied' as const }, truncated: false,
    data: {
      path: 'src/app.ts', beforeHash: 'a'.repeat(64), afterHash: 'b'.repeat(64),
      changes: { addedLines: 2, removedLines: 1 }, diffRef: { id: 'diff-123', kind: 'unified-diff' },
    },
  }
  const projected = feedback.projectFileChangeFeedback({ toolName: 'apply_patch', args: { path: 'src/app.ts' }, result, status: 'complete' })
  assert.deepEqual(projected, {
    kind: 'file-change', phase: 'applied', path: 'src/app.ts', summary: result.summary,
    effects: result.effects, changes: result.data.changes, beforeHash: result.data.beforeHash,
    afterHash: result.data.afterHash, diffRef: result.data.diffRef,
  })
})

test('preserves structured failure and recovery actions for history and UI', () => {
  const result = {
    schemaVersion: 1, toolCallId: 'call-2', tool: 'apply_patch', ok: false as const,
    summary: '未修改 src/app.ts：文件版本冲突', durationMs: 2, effects: { kind: 'none' as const }, truncated: false,
    error: {
      code: 'VERSION_CONFLICT' as const, message: '当前版本与 expectedHash 不一致。', retryable: false,
      recovery: [{ action: 'read_file', path: 'src/app.ts', reason: '读取最新内容后重新生成补丁' }],
    },
  }
  const input = { toolName: 'apply_patch', args: { path: 'src/app.ts' }, result, status: 'complete' as const }
  const projected = feedback.projectFileChangeFeedback(input)
  assert.equal(projected?.phase, 'failed')
  assert.equal(projected?.errorCode, 'VERSION_CONFLICT')
  assert.deepEqual(projected?.recovery, result.error.recovery)
  assert.deepEqual(projected, feedback.projectFileChangeFeedback(input))
})

test('marks stopped patch output without pretending it was applied', () => {
  const projected = feedback.projectFileChangeFeedback({
    toolName: 'apply_patch', args: { path: 'src/app.ts', patch: '@@\n-old\n+new\n' }, status: 'cancelled',
  })
  assert.equal(projected?.phase, 'cancelled')
  assert.equal(projected?.effects.kind, 'none')
})

test('leaves unrelated or malformed tools to the official fallback', () => {
  assert.equal(feedback.projectFileChangeFeedback({ toolName: 'read_file', args: { path: 'x' }, status: 'complete' }), null)
  assert.equal(feedback.projectFileChangeFeedback({ toolName: 'apply_patch', args: { path: 'x' }, result: { nope: true }, status: 'complete' }), null)
})

test('renders file changes through the official ToolFallback shell with a bounded diff view', async () => {
  const { StructuredToolFallback } = await vite.ssrLoadModule('/src/renderer/src/components/chat/tools/StructuredToolFallback.tsx')
  const result = {
    schemaVersion: 1, toolCallId: 'call-ui', tool: 'apply_patch', ok: true as const,
    summary: '已应用补丁 src/app.ts', durationMs: 1, effects: { kind: 'applied' as const }, truncated: false,
    data: {
      path: 'src/app.ts', beforeHash: 'a'.repeat(64), afterHash: 'b'.repeat(64),
      changes: { addedLines: 1, removedLines: 1 }, diffRef: { id: 'diff-ui', kind: 'unified-diff' },
    },
  }
  const markup = renderToStaticMarkup(React.createElement(StructuredToolFallback, {
    toolName: 'apply_patch', toolCallId: 'call-ui', args: { path: 'src/app.ts', patch: '@@\n-old\n+new\n' },
    argsText: '{"path":"src/app.ts"}', result, status: { type: 'complete' },
    addResult: () => {}, resume: () => {}, respondToApproval: async () => {},
  }))
  assert.match(markup, /data-slot="tool-fallback-root"/)
  assert.match(markup, /data-file-change-phase="applied"/)
  assert.match(markup, /Diff：diff-ui/)
  assert.match(markup, /路径：src\/app\.ts/)
})
