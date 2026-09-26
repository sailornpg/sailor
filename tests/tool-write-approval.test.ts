import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import test from 'node:test'
import { MockLanguageModelV4 } from 'ai/test'
import { simulateReadableStream, tool, ToolLoopAgent, toUIMessageStream } from 'ai'
import { z } from 'zod'
import { createServer } from 'vite'

const input = {
  path: 'src/app.ts',
  mode: 'overwrite',
  expectedHash: 'a'.repeat(64),
  content: 'export const secret = "must-not-appear-in-summary"\n',
}

const toolCall = {
  type: 'tool-call' as const,
  toolCallId: 'call-write-1',
  toolName: 'write_file',
  input,
}

function approvalHistory(approvalId = 'approval-1', approved = true) {
  return [
    {
      role: 'assistant' as const,
      content: [
        toolCall,
        { type: 'tool-approval-request' as const, approvalId, toolCallId: toolCall.toolCallId },
      ],
    },
    {
      role: 'tool' as const,
      content: [{ type: 'tool-approval-response' as const, approvalId, approved }],
    },
  ]
}

async function loadManager(t: test.TestContext) {
  const vite = await createServer({
    logLevel: 'silent',
    resolve: { alias: { '@shared': resolve(process.cwd(), 'src/shared') } },
    server: { middlewareMode: true },
  })
  t.after(() => vite.close())
  return vite.ssrLoadModule('/tests/fixtures/legacy-tools/WorkspaceWriteApproval.ts')
}

function callPolicy(policy: (options: any) => unknown, call = toolCall, messages: unknown[] = []) {
  return policy({
    toolCall: call,
    tools: {},
    toolsContext: {},
    runtimeContext: undefined,
    messages,
  })
}

test('binds a one-shot approval to chat, origin run, resume run, call and exact input', async (t) => {
  const { WorkspaceWriteApproval } = await loadManager(t)
  let now = 1_000
  const approvals = new WorkspaceWriteApproval({ now: () => now, ttlMs: 5_000 })
  const initialPolicy = approvals.createPolicy({ chatId: 'chat-a', runId: 'run-origin' })

  assert.deepEqual(await callPolicy(initialPolicy), {
    type: 'user-approval',
    reason: '请求覆盖工作区文件 src/app.ts；授权仅适用于本次调用。',
  })
  assert.doesNotMatch(((await callPolicy(initialPolicy)) as any).reason, /must-not-appear/)
  assert.equal(approvals.signingSecret.byteLength, 32)

  assert.throws(
    () =>
      approvals.respond({
        chatId: 'chat-b',
        approvalId: 'approval-1',
        toolCallId: 'call-write-1',
        toolName: 'write_file',
        approved: true,
      }),
    /不存在|失效/,
  )

  approvals.respond({
    chatId: 'chat-a',
    approvalId: 'approval-1',
    toolCallId: 'call-write-1',
    toolName: 'write_file',
    approved: true,
  })

  const resumePolicy = approvals.createPolicy({ chatId: 'chat-a', runId: 'run-resume' })
  assert.deepEqual(await callPolicy(resumePolicy, toolCall, approvalHistory()), {
    type: 'user-approval',
    reason: '已验证本次工作区写入授权。',
  })
  assert.equal(
    approvals.consumeGrant({
      chatId: 'chat-a',
      runId: 'run-resume',
      toolCallId: 'call-write-1',
      toolName: 'write_file',
      input,
    }).originRunId,
    'run-origin',
  )
  assert.throws(
    () =>
      approvals.consumeGrant({
        chatId: 'chat-a',
        runId: 'run-resume',
        toolCallId: 'call-write-1',
        toolName: 'write_file',
        input,
      }),
    /已使用|失效/,
  )

  now += 1
})

test('fails closed for tampering, rejection, expiry, duplicate response, revocation and restart replay', async (t) => {
  const { WorkspaceWriteApproval } = await loadManager(t)
  let now = 10_000
  const create = () => new WorkspaceWriteApproval({ now: () => now, ttlMs: 100 })
  const response = {
    chatId: 'chat-a',
    approvalId: 'approval-1',
    toolCallId: 'call-write-1',
    toolName: 'write_file',
    approved: true,
  }

  const tampered = create()
  await callPolicy(tampered.createPolicy({ chatId: 'chat-a', runId: 'run-origin' }))
  tampered.respond(response)
  const changedCall = { ...toolCall, input: { ...input, path: 'src/other.ts' } }
  assert.deepEqual(
    await callPolicy(
      tampered.createPolicy({ chatId: 'chat-a', runId: 'run-resume' }),
      changedCall,
      approvalHistory(),
    ),
    { type: 'denied', reason: '写入授权与当前调用不匹配或已失效。' },
  )
  assert.throws(
    () =>
      tampered.consumeGrant({
        chatId: 'chat-a',
        runId: 'run-resume',
        toolCallId: 'call-write-1',
        toolName: 'write_file',
        input: changedCall.input,
      }),
    /不匹配|失效/,
  )

  const rejected = create()
  await callPolicy(rejected.createPolicy({ chatId: 'chat-a', runId: 'run-reject' }))
  rejected.respond({ ...response, approved: false, reason: '用户拒绝' })
  assert.throws(
    () =>
      rejected.consumeGrant({
        chatId: 'chat-a',
        runId: 'run-reject',
        toolCallId: 'call-write-1',
        toolName: 'write_file',
        input,
      }),
    /拒绝|失效/,
  )

  const expired = create()
  await callPolicy(expired.createPolicy({ chatId: 'chat-a', runId: 'run-expire' }))
  now += 101
  assert.throws(() => expired.respond(response), /过期/)

  const duplicate = create()
  await callPolicy(duplicate.createPolicy({ chatId: 'chat-a', runId: 'run-duplicate' }))
  duplicate.respond(response)
  assert.throws(() => duplicate.respond(response), /已处理|失效/)

  const revoked = create()
  await callPolicy(revoked.createPolicy({ chatId: 'chat-a', runId: 'run-revoke' }))
  revoked.revokeRun('run-revoke')
  assert.throws(() => revoked.respond(response), /已撤销|失效/)

  const beforeRestart = create()
  await callPolicy(beforeRestart.createPolicy({ chatId: 'chat-a', runId: 'run-before-restart' }))
  const afterRestart = create()
  assert.throws(() => afterRestart.respond(response), /不存在|失效/)
  assert.deepEqual(
    await callPolicy(
      afterRestart.createPolicy({ chatId: 'chat-a', runId: 'run-after-restart' }),
      toolCall,
      approvalHistory(),
    ),
    { type: 'denied', reason: '写入授权与当前调用不匹配或已失效。' },
  )
})

test('uses AI SDK toolApproval to pause before any write executor runs', async (t) => {
  const { WorkspaceWriteApproval } = await loadManager(t)
  const approvals = new WorkspaceWriteApproval()
  let writes = 0
  const writeTool = tool({
    inputSchema: z.object({ path: z.string(), content: z.string() }),
    execute: async () => {
      writes += 1
      return { ok: true }
    },
  })
  const model = new MockLanguageModelV4({
    doStream: {
      stream: simulateReadableStream({
        chunks: [
          { type: 'tool-input-start', id: 'call-sdk', toolName: 'write_file' },
          { type: 'tool-input-delta', id: 'call-sdk', delta: '{"path":"a.txt","content":"x"}' },
          { type: 'tool-input-end', id: 'call-sdk' },
          {
            type: 'tool-call',
            toolCallId: 'call-sdk',
            toolName: 'write_file',
            input: '{"path":"a.txt","content":"x"}',
          },
          {
            type: 'finish',
            finishReason: { unified: 'tool-calls', raw: undefined },
            usage: { inputTokens: { total: 1, noCache: 1 }, outputTokens: { total: 1, text: 1 } },
          },
        ] as any,
      }),
    },
  })
  const agent = new ToolLoopAgent({
    model,
    tools: { write_file: writeTool },
    toolApproval: approvals.createPolicy({ chatId: 'chat-sdk', runId: 'run-sdk' }),
    experimental_toolApprovalSecret: approvals.signingSecret,
  })
  const result = await agent.stream({ prompt: [{ role: 'user', content: 'write' }] })
  const chunks = []
  for await (const chunk of toUIMessageStream({ stream: result.stream, tools: agent.tools }))
    chunks.push(chunk)

  assert.equal(writes, 0)
  assert.ok(chunks.some((chunk: any) => chunk.type === 'tool-approval-request'))
  assert.ok(!chunks.some((chunk: any) => chunk.type === 'tool-output-available'))
})

test('wires the main approval channel through existing assistant-ui approval controls', async () => {
  const [contracts, preload, provider, chats, agent] = await Promise.all([
    readFile('src/shared/contracts.ts', 'utf8'),
    readFile('src/preload/index.ts', 'utf8'),
    readFile('src/renderer/src/components/chat/runtime/SailorChatProvider.tsx', 'utf8'),
    readFile('src/renderer/src/lib/WorkspaceChats.ts', 'utf8'),
    readFile('src/main/agent/AgentService.ts', 'utf8'),
  ])
  assert.match(contracts, /respondToApproval/)
  assert.match(contracts, /revokeApprovals/)
  assert.match(preload, /respondToApproval/)
  assert.match(provider, /onRespondToToolApproval/)
  assert.match(provider, /respondViaAISDK/)
  assert.match(chats, /lastAssistantMessageIsCompleteWithApprovalResponses/)
  assert.match(agent, /runner.respondToApproval/)
  assert.match(agent, /runner\?\.revokeApprovals/)
})

test('freezes workspace permission mode and keeps side chat read-only', async () => {
  const source = await readFile('src/main/agent/pi/PiRunner.ts', 'utf8')
  assert.match(source, /permissionMode:/)
  assert.match(source, /options\.isSideChat/)
  assert.match(source, /context\?\.permissionMode/)
  assert.match(source, /activeTools: \[/)
})
