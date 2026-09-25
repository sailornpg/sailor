import assert from 'node:assert/strict'
import { resolve } from 'node:path'
import test from 'node:test'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { createServer } from 'vite'

async function renderer() {
  return createServer({
    logLevel: 'silent',
    server: { middlewareMode: true },
    resolve: { alias: { '@': resolve('src/renderer/src'), '@shared': resolve('src/shared') } },
  })
}

test('actual Thread renders each tool call once with Pi file paths, without a timeline or extra group', async () => {
  const vite = await renderer()
  try {
    const { ToolCallPreview } = await vite.ssrLoadModule('/tests/fixtures/ToolCallPreview.tsx')
    const markup = renderToStaticMarkup(React.createElement(ToolCallPreview))
    assert.equal((markup.match(/data-slot="tool-call"/g) ?? []).length, 3)
    assert.equal((markup.match(/>thread.tsx</g) ?? []).length, 2)
    assert.match(markup, />composer.tsx</)
    assert.doesNotMatch(
      markup,
      /data-slot="tool-timeline"|data-slot="tool-group-root"|data-slot="tool-fallback-root"/,
    )
  } finally {
    await vite.close()
  }
})

test('approval, cancellation and failures keep an error card instead of a success checkmark', async () => {
  const vite = await renderer()
  try {
    const { toolCallNeedsFallback, SailorToolCall, formatToolValue } = await vite.ssrLoadModule(
      '/src/renderer/src/components/chat/tools/SailorToolCall.tsx',
    )
    const call = {
      toolName: 'read',
      toolCallId: 'one',
      args: { file_path: 'file.ts' },
      argsText: '{"file_path":"file.ts"}',
      result: 'content',
      status: { type: 'complete' },
      addResult() {},
      resume() {},
      respondToApproval: async () => {},
    }
    assert.equal(toolCallNeedsFallback(call), false)
    assert.equal(
      toolCallNeedsFallback({ ...call, status: { type: 'running' }, result: undefined }),
      false,
    )
    for (const changed of [
      { status: { type: 'requires-action' }, approval: { id: 'approval' } },
      { status: { type: 'incomplete', reason: 'cancelled' } },
      { isError: true },
      { result: { ok: false } },
      { approval: { id: 'approval', approved: false } },
      { approval: { id: 'approval', resolution: 'expired' } },
    ])
      assert.equal(toolCallNeedsFallback({ ...call, ...changed }), true)
    const failed = renderToStaticMarkup(
      React.createElement(SailorToolCall, { ...call, isError: true, result: '读取失败' }),
    )
    assert.doesNotMatch(failed, /data-slot="tool-call"/, '不得渲染成成功态的 ToolCall 行')
    assert.match(failed, /data-slot="tool-error"/, '失败态使用官方 ToolError 卡片')
    assert.doesNotMatch(failed, /lucide-check/, '不得出现成功对勾')
    assert.match(failed, /读取失败/)
    assert.doesNotMatch(failed, /&quot;file_path&quot;/, '失败态不得打印原始参数 JSON')
    assert.equal(formatToolValue(undefined), '')
    assert.equal(formatToolValue('第一行\n第二行'), '第一行\n第二行')
    assert.deepEqual(JSON.parse(formatToolValue({ content: [{ text: '文件内容' }] })), {
      content: [{ text: '文件内容' }],
    })
  } finally {
    await vite.close()
  }
})

test('update_plan is represented by the composer TodoList instead of a duplicate tool row', async () => {
  const vite = await renderer()
  try {
    const { ApprovalPreview } = await vite.ssrLoadModule('/tests/fixtures/ToolCallPreview.tsx')
    const call = {
      toolName: 'update_plan',
      toolCallId: 'plan-1',
      args: { revision: 1, steps: [{ id: 'read', title: '阅读代码', status: 'in-progress' }] },
      argsText: '{}',
      result: { revision: 1 },
      status: { type: 'complete' },
    }
    const markup = renderToStaticMarkup(React.createElement(ApprovalPreview, { call: call as any }))
    assert.equal(markup, '')
    const failed = renderToStaticMarkup(
      React.createElement(ApprovalPreview, {
        call: { ...call, isError: true, result: '计划更新失败' } as any,
      }),
    )
    assert.match(failed, /计划更新失败/)
    const legacy = renderToStaticMarkup(
      React.createElement(ApprovalPreview, {
        call: { ...call, toolName: 'updatePlan' } as any,
      }),
    )
    assert.match(legacy, /data-slot="tool-call"/)
    const ask = renderToStaticMarkup(
      React.createElement(ApprovalPreview, {
        call: { ...call, toolName: 'ask_user', args: { question: '继续吗？' } } as any,
      }),
    )
    assert.equal(ask, '')
  } finally {
    await vite.close()
  }
})

test('official expanded ToolCall includes both request and result', async () => {
  const vite = await renderer()
  try {
    const { ToolCall } = await vite.ssrLoadModule(
      '/src/renderer/src/components/assistant-ui/elements/tool-call.tsx',
    )
    const markup = renderToStaticMarkup(
      React.createElement(ToolCall, {
        label: 'read',
        activeLabel: 'read',
        query: 'file.ts',
        request: '{"file_path":"file.ts"}',
        result: '文件内容',
        running: false,
        open: true,
        onOpenChange() {},
      }),
    )
    assert.match(markup, /Request/)
    assert.match(markup, /file_path/)
    assert.match(markup, /Result/)
    assert.match(markup, /文件内容/)
  } finally {
    await vite.close()
  }
})

test('pending edit renders one official approval card with readable changes and only one-time actions', async () => {
  const vite = await renderer()
  try {
    const { SailorToolCall } = await vite.ssrLoadModule(
      '/src/renderer/src/components/chat/tools/SailorToolCall.tsx',
    )
    const { isSimpleApprovalRequest, approvalPreview } = await vite.ssrLoadModule(
      '/src/renderer/src/components/chat/tools/SailorApprovalCard.tsx',
    )
    const call = {
      toolName: 'edit',
      toolCallId: 'edit-approval',
      args: {
        file_path: 'CLAUDE.md',
        old_string: '原来的内容\n第二行',
        new_string: '修改后的内容\n第二行',
      },
      argsText: '{}',
      status: { type: 'requires-action', reason: 'tool-calls' },
      approval: { id: 'approval-1' },
      addResult() {},
      resume() {},
      respondToApproval: async () => {},
    }
    const markup = renderToStaticMarkup(React.createElement(SailorToolCall, call))
    assert.equal((markup.match(/data-slot="approval-card"/g) ?? []).length, 1)
    assert.doesNotMatch(
      markup,
      /data-slot="tool-call"|data-slot="tool-fallback-root"|始终允许|Always allow/,
    )
    assert.match(markup, /允许一次/)
    assert.match(markup, /拒绝/)
    assert.match(markup, /CLAUDE.md/)
    assert.match(markup, /原来的内容/)
    assert.match(markup, /修改后的内容/)
    assert.equal(
      approvalPreview({ toolName: 'bash', args: { command: 'pwd && ls -la' }, argsText: '{}' }),
      'pwd && ls -la',
    )
    assert.equal(isSimpleApprovalRequest(call), true)
    for (const approval of [
      { id: 'approval-1', approved: true },
      { id: 'approval-1', resolution: 'expired' },
      { id: 'approval-1', approved: false },
      { id: 'approval-1', options: [{ id: 'custom' }] },
      { id: 'approval-1', display: 'text' },
    ])
      assert.equal(isSimpleApprovalRequest({ ...call, approval }), false)
    assert.equal(
      isSimpleApprovalRequest({ ...call, status: { type: 'incomplete', reason: 'cancelled' } }),
      false,
    )
    const { ApprovalCard } = await vite.ssrLoadModule(
      '/src/renderer/src/components/assistant-ui/elements/approval-card.tsx',
    )
    const busy = renderToStaticMarkup(
      React.createElement(ApprovalCard, {
        state: 'request',
        command: 'pwd',
        title: '提交中',
        subtitle: '',
        disabled: true,
        onAllowOnce() {},
        onDeny() {},
      }),
    )
    assert.equal((busy.match(/disabled=""/g) ?? []).length, 2)
  } finally {
    await vite.close()
  }
})

test('没有 approval metadata 的 read 权限请求也使用同一种卡片', async () => {
  const vite = await renderer()
  try {
    const { ApprovalPreview } = await vite.ssrLoadModule('/tests/fixtures/ToolCallPreview.tsx')
    const props = {
      toolName: 'read',
      toolCallId: 'read-approval',
      args: { file_path: '.agent-harness/feature_list.json' },
      argsText: '{}',
      status: { type: 'requires-action', reason: 'tool-calls' },
      addResult() {},
      resume() {},
      respondToApproval: async () => {},
    }
    const markup = renderToStaticMarkup(React.createElement(ApprovalPreview, { call: props }))
    assert.equal((markup.match(/data-slot="approval-card"/g) ?? []).length, 1)
    assert.match(markup, /允许一次/)
    assert.match(markup, /拒绝/)
    assert.doesNotMatch(markup, />Allow<|>Deny<|data-slot="tool-fallback-root"/)
  } finally {
    await vite.close()
  }
})

test('统一卡片保留 approval、interrupt、旧式结果的响应协议及失效保护', async () => {
  const vite = await renderer()
  try {
    const { respondToPermission } = await vite.ssrLoadModule(
      '/src/renderer/src/components/chat/tools/SailorApprovalCard.tsx',
    )
    const calls: unknown[] = []
    const base = {
      status: { type: 'requires-action', reason: 'tool-calls' },
      respondToApproval: async (value: unknown) => calls.push(['approval', value]),
      resume: async (value: unknown) => calls.push(['resume', value]),
      addResult: async (value: unknown) => calls.push(['result', value]),
    }
    await respondToPermission({ ...base, approval: { id: 'one' } }, true)
    await respondToPermission({ ...base, interrupt: { payload: {} } }, false)
    await respondToPermission(base, true)
    await respondToPermission(base, false)
    await respondToPermission({ ...base, approval: { id: 'one', resolution: 'expired' } }, true)
    await respondToPermission(
      { ...base, status: { type: 'requires-action', reason: 'interrupt' } },
      true,
    )
    await respondToPermission(
      { ...base, approval: { id: 'one', options: [{ id: 'custom' }] } },
      true,
    )
    assert.deepEqual(calls, [
      ['approval', { approved: true }],
      ['resume', { approved: false }],
      ['result', 'Approved by user'],
      ['result', 'User denied tool execution'],
    ])
  } finally {
    await vite.close()
  }
})

test('自定义审批与问答仍使用同一卡片外壳并保留声明的选项', async () => {
  const vite = await renderer()
  try {
    const { ApprovalPreview } = await vite.ssrLoadModule('/tests/fixtures/ToolCallPreview.tsx')
    for (const approval of [
      { id: 'options', options: [{ id: 'custom', label: '自定义选择' }] },
      { id: 'question', display: 'text', allowFreeform: true, prompt: '请输入原因' },
    ]) {
      const call = {
        toolName: 'read',
        toolCallId: 'one',
        args: { file_path: 'file.ts' },
        argsText: '{}',
        status: { type: 'requires-action', reason: 'tool-calls' },
        approval,
        respondToApproval: async () => {},
        resume() {},
        addResult() {},
      }
      const markup = renderToStaticMarkup(React.createElement(ApprovalPreview, { call }))
      assert.equal((markup.match(/data-slot="approval-card"/g) ?? []).length, 1)
      assert.doesNotMatch(markup, /data-slot="tool-fallback-root"/)
      if (approval.options) assert.match(markup, /自定义选择/)
      else {
        assert.match(markup, /textarea/)
        assert.doesNotMatch(markup, /允许一次/)
      }
    }
  } finally {
    await vite.close()
  }
})
