import { createModelRunner } from './helpers/model-runner.ts'
import assert from 'node:assert/strict'
import { mkdtemp, mkdir, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import test from 'node:test'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { MockLanguageModelV4 } from 'ai/test'
import { simulateReadableStream, type LanguageModel } from 'ai'
import { createServer } from 'vite'
import type { AgentRunEvent, ResolvedModel } from '../src/shared/contracts.ts'

const resolvedModel: ResolvedModel = {
  providerId: 'test', providerName: 'Test', baseUrl: 'http://127.0.0.1:1',
  protocol: 'openai-completions', apiKey: 'fixture', modelId: 'test-model', reasoningLevels: [],
}
const usage = { inputTokens: { total: 1, noCache: 1 }, outputTokens: { total: 1, text: 1 } }
const finish = (reason: 'stop' | 'tool-calls') => ({
  type: 'finish' as const,
  finishReason: { unified: reason, raw: undefined },
  usage,
})

async function fixture(t: test.TestContext) {
  const directory = await mkdtemp(join(tmpdir(), 'sailor-tool-feedback-'))
  const root = join(directory, 'workspace')
  await mkdir(root)
  t.after(() => rm(directory, { recursive: true, force: true }))
  const vite = await createServer({
    logLevel: 'silent',
    resolve: {
      alias: {
        '@shared': resolve(process.cwd(), 'src/shared'),
        '@': resolve(process.cwd(), 'src/renderer/src'),
      },
    },
    server: { middlewareMode: true },
  })
  t.after(() => vite.close())
  const { WorkspaceStore } = await vite.ssrLoadModule('/src/main/workspaces/WorkspaceStore.ts')
  const { WorkspaceService } = await vite.ssrLoadModule('/src/main/workspaces/WorkspaceService.ts')
  const { AgentService } = await vite.ssrLoadModule('/src/main/agent/AgentService.ts')
  const store = new WorkspaceStore(join(directory, 'state.json'))
  const project = await store.addProject(root)
  const chat = await store.createChat(project.id)
  const workspace = new WorkspaceService(store, async () => null)
  return { vite, root, chat, store, workspace, AgentService }
}

test('AgentService exposes read tools through its runner, returns structured failure and lets the model recover', async t => {
  const { chat, workspace, AgentService } = await fixture(t)
  const model = new MockLanguageModelV4({
    doStream: [
      { stream: simulateReadableStream({ chunks: [
        { type: 'tool-input-start', id: 'stable-call', toolName: 'read_file' },
        { type: 'tool-input-delta', id: 'stable-call', delta: '{"path":"missing.txt"}' },
        { type: 'tool-input-end', id: 'stable-call' },
        { type: 'tool-call', toolCallId: 'stable-call', toolName: 'read_file', input: '{"path":"missing.txt"}' },
        finish('tool-calls'),
      ] as any }) },
      { stream: simulateReadableStream({ chunks: [
        { type: 'text-start', id: 'answer' },
        { type: 'text-delta', id: 'answer', delta: '文件不存在，我会先列出目录。' },
        { type: 'text-end', id: 'answer' },
        finish('stop'),
      ] as any }) },
    ],
  })
  const events: AgentRunEvent[] = []
  const agent = new AgentService(
    (_runId: string, event: AgentRunEvent) => events.push(event),
    { resolveActiveModel: async () => resolvedModel },
    { workspace, runner: createModelRunner(() => model as LanguageModel) },
  )
  await agent.start({
    chatId: chat.id,
    runId: 'run-1',
    reasoning: 'provider-default',
    messages: [{ id: 'user-1', role: 'user', parts: [{ type: 'text', text: '读取缺失文件' }] }],
  })

  assert.equal(model.doStreamCalls.length, 2, JSON.stringify(events))
  assert.deepEqual(model.doStreamCalls[0].tools?.map(tool => tool.name).sort(), ['list_files', 'read_file', 'search_files'])
  assert.doesNotMatch(JSON.stringify(model.doStreamCalls[0].tools), /updatePlan/)
  const followupPrompt = JSON.stringify(model.doStreamCalls[1].prompt)
  assert.match(followupPrompt, /NOT_FOUND/)
  assert.match(followupPrompt, /list_files/)

  const chunks = events.flatMap(event => event.type === 'chunk' ? [event.chunk] : []) as any[]
  const toolChunks = chunks.filter(chunk => chunk.toolCallId === 'stable-call')
  assert.ok(toolChunks.some(chunk => chunk.type === 'tool-input-available'))
  assert.ok(toolChunks.some(chunk => chunk.type === 'tool-output-available' && chunk.output?.ok === false))
  assert.ok(toolChunks.every(chunk => chunk.toolCallId === 'stable-call'))
  assert.ok(chunks.some(chunk => chunk.type === 'text-delta'))

  const restored = await workspace.getChat(chat.id)
  const toolPart: any = restored.messages.flatMap((message: any) => message.parts)
    .find((part: any) => part.type === 'dynamic-tool' && part.toolName === 'read_file')
  assert.equal(toolPart.toolCallId, 'stable-call')
  assert.equal(toolPart.output.error.code, 'NOT_FOUND')
})


test('tool registry preserves call ids, cancellation and error-json model output', async t => {
  const { chat, workspace, vite } = await fixture(t)
  const controller = new AbortController()
  const context = await workspace.resolveToolContext(chat.id, controller.signal)
  const { createAgentTools } = await vite.ssrLoadModule('/tests/fixtures/legacy-tools/index.ts')
  const tools = createAgentTools(context)
  controller.abort()

  const output: any = await tools.list_files.execute(
    { path: '.', depth: 1, cursor: 0, limit: 200 },
    { toolCallId: 'cancel-call', abortSignal: controller.signal, messages: [] } as any,
  )
  assert.equal(output.toolCallId, 'cancel-call')
  assert.equal(output.ok, false)
  assert.equal(output.error.code, 'CANCELLED')
  const modelOutput: any = await tools.list_files.toModelOutput({
    toolCallId: 'cancel-call', input: { path: '.' }, output,
  })
  assert.equal(modelOutput.type, 'error-json')
  assert.equal(modelOutput.value.error.code, 'CANCELLED')
  assert.ok(modelOutput.value.error.recovery.length > 0)
})

test('structured tool fallback renders failures as the official ToolError card with recovery', async t => {
  const { vite } = await fixture(t)
  const { StructuredToolFallback } = await vite.ssrLoadModule('/src/renderer/src/components/chat/tools/StructuredToolFallback.tsx')
  const source = await readSource('src/renderer/src/components/chat/tools/StructuredToolFallback.tsx')
  assert.match(source, /<ToolError/, '失败态必须使用官方 ToolError 元素')
  assert.doesNotMatch(
    source,
    /if \(!parsed\.success \|\| parsed\.data\.ok\) return <ToolFallback/,
    '不得回退到会打印原始参数 JSON 的通用卡片',
  )

  const result = {
    schemaVersion: 1, toolCallId: 'call-ui', tool: 'read_file', ok: false,
    summary: '未读取 missing.txt', durationMs: 3, effects: { kind: 'none' }, truncated: false,
    error: {
      code: 'NOT_FOUND', message: '文件不存在。', retryable: true,
      recovery: [{ action: 'list_files', reason: '确认文件名' }],
    },
  }
  const markup = renderToStaticMarkup(React.createElement(StructuredToolFallback, {
    toolName: 'read_file', toolCallId: 'call-ui', args: { path: 'missing.txt' },
    argsText: '{"path":"missing.txt"}', result, status: { type: 'complete' },
    addResult: () => {}, resume: () => {}, respondToApproval: async () => {},
  }))
  assert.match(markup, /data-slot="tool-error"/)
  assert.match(markup, /NOT_FOUND/)
  assert.match(markup, /文件不存在/)
  assert.match(markup, /list_files/, '恢复建议必须保留')
  assert.match(markup, /确认文件名/)
  assert.match(markup, /missing\.txt/, '目标应显示为可读路径')
  assert.doesNotMatch(markup, /&quot;path&quot;/, '不得打印原始参数 JSON')
})

async function readSource(path: string): Promise<string> {
  return (await import('node:fs/promises')).readFile(path, 'utf8')
}
