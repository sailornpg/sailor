import assert from 'node:assert/strict'
import { resolve } from 'node:path'
import test from 'node:test'
import { createServer, type ViteDevServer } from 'vite'

let vite: ViteDevServer
let contract: typeof import('../src/shared/toolFeedback.ts')

test.before(async () => {
  vite = await createServer({
    logLevel: 'silent',
    resolve: { alias: { '@shared': resolve(process.cwd(), 'src/shared') } },
    server: { middlewareMode: true },
  })
  contract = await vite.ssrLoadModule('/src/shared/toolFeedback.ts') as typeof contract
})

test.after(async () => {
  await vite?.close()
})

test('validates a strict discriminated tool result contract', () => {
  const success = contract.createToolSuccess({
    toolCallId: 'call-1',
    tool: 'read_file',
    summary: '已读取 src/app.ts',
    durationMs: 12,
    data: { path: 'src/app.ts', content: 'hello' },
  })
  assert.equal(contract.toolResultSchema.parse(success).ok, true)
  assert.deepEqual(success.effects, { kind: 'none' })
  assert.equal(success.truncated, false)

  const failure = contract.createToolFailure({
    toolCallId: 'call-2',
    tool: 'read_file',
    summary: '无法读取 src/missing.ts',
    durationMs: 3,
    code: 'NOT_FOUND',
    message: '文件不存在。',
    retryable: false,
    recovery: [{ action: 'list_files', path: 'src', reason: '确认可用文件名' }],
  })
  assert.equal(contract.toolResultSchema.parse(failure).ok, false)
  assert.deepEqual(failure.effects, { kind: 'none' })
  assert.throws(() => contract.toolResultSchema.parse({ ...failure, ok: true }), /invalid|expected/i)
  assert.throws(() => contract.toolResultSchema.parse({ ...failure, durationMs: -1 }))
  assert.throws(() => contract.toolResultSchema.parse({ ...failure, unexpected: true }))
})

test('maps invalid input and unknown exceptions to safe failures', () => {
  const invalid = contract.createInvalidArgumentFailure({
    toolCallId: 'call-invalid',
    tool: 'read_file',
    issues: [{ path: 'path', message: '必须是相对路径' }],
  })
  assert.equal(invalid.ok, false)
  assert.equal(invalid.error.code, 'INVALID_ARGUMENT')
  assert.equal(invalid.effects.kind, 'none')
  assert.match(invalid.error.recovery[0].reason, /参数/)

  const secret = '/Users/example/private-token.txt'
  const unknown = contract.createUnexpectedToolFailure({
    toolCallId: 'call-unknown',
    tool: 'read_file',
    error: new Error(`disk exploded at ${secret}`),
  })
  assert.equal(unknown.ok, false)
  assert.equal(unknown.error.code, 'INTERNAL_ERROR')
  assert.equal(unknown.effects.kind, 'unknown')
  assert.doesNotMatch(JSON.stringify(unknown), /private-token|disk exploded|Users/)
})

test('keeps failure state and summary aligned for UI and model output', () => {
  const failure = contract.createToolFailure({
    toolCallId: 'call-3',
    tool: 'search_files',
    summary: '搜索失败：工作区不可用',
    durationMs: 1,
    code: 'WORKSPACE_UNAVAILABLE',
    message: '工作区目录已失效。',
    retryable: true,
    recovery: [{ action: 'ask_user', reason: '请重新选择工作区' }],
  })
  const ui = contract.projectToolResult(failure)
  const model = contract.toToolModelOutput(failure)

  assert.deepEqual(ui, {
    status: 'error',
    summary: failure.summary,
    errorCode: 'WORKSPACE_UNAVAILABLE',
  })
  assert.equal(model.ok, false)
  assert.equal(model.summary, ui.summary)
  assert.equal(model.error?.code, ui.errorCode)
  assert.deepEqual(model.error?.recovery, failure.error.recovery)
  assert.deepEqual(model.effects, failure.effects)
})

test('centralizes read budgets and reports truncation explicitly', () => {
  assert.deepEqual(contract.TOOL_BUDGETS, {
    readFileBytes: 64 * 1024,
    readFileLines: 500,
    searchMatches: 100,
    listFilesPageSize: 200,
    writeFileBytes: 1024 * 1024,
    modelOutputBytes: 32 * 1024,
  })
  assert.deepEqual(contract.limitToolText('abcdef', 4), {
    text: 'abcd',
    originalLength: 6,
    truncated: true,
  })
  assert.deepEqual(contract.limitToolText('abc', 4), {
    text: 'abc',
    originalLength: 3,
    truncated: false,
  })

  const large = contract.createToolSuccess({
    toolCallId: 'call-large',
    tool: 'read_file',
    summary: '已读取大文件',
    durationMs: 2,
    data: { content: 'x'.repeat(contract.TOOL_BUDGETS.modelOutputBytes * 2) },
  })
  const model = contract.toToolModelOutput(large)
  assert.equal(model.truncated, true)
  assert.ok(new TextEncoder().encode(JSON.stringify(model)).byteLength <= contract.TOOL_BUDGETS.modelOutputBytes)
})
