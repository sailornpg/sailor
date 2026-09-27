import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
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

test('host_exec 复用现有审批卡片、命令预览和工具注册', async () => {
  const vite = await renderer()
  try {
    const { SailorToolCall } = await vite.ssrLoadModule(
      '/src/renderer/src/components/chat/tools/SailorToolCall.tsx',
    )
    const { approvalPreview } = await vite.ssrLoadModule(
      '/src/renderer/src/components/chat/tools/SailorApprovalCard.tsx',
    )
    const { toolRendererFor } = await vite.ssrLoadModule(
      '/src/renderer/src/components/chat/tools/sailorToolkit.tsx',
    )
    const props = {
      toolName: 'host_exec',
      toolCallId: 'host-approval',
      args: { command: 'npm test', cwd: 'packages/app' },
      argsText: '{}',
      status: { type: 'requires-action', reason: 'tool-calls' },
      approval: { id: 'approval-host' },
      addResult() {},
      resume() {},
      respondToApproval: async () => {},
    }
    assert.equal(
      approvalPreview({ toolName: 'host_exec', args: props.args, argsText: '{}' }),
      'npm test\n\n工作目录：packages/app',
    )
    const markup = renderToStaticMarkup(React.createElement(SailorToolCall, props))
    assert.equal((markup.match(/data-slot="approval-card"/g) ?? []).length, 1)
    assert.match(markup, /npm test/)
    assert.match(markup, /packages\/app/)
    assert.equal(typeof toolRendererFor('host_exec'), 'function')
  } finally {
    await vite.close()
  }
})

test('main IPC 允许 host_exec 使用现有审批响应契约', async () => {
  const source = await readFile(resolve('src/main/ipc/registerIpc.ts'), 'utf8')
  assert.match(source, /z\.enum\(\['write', 'edit', 'bash', 'host_exec'\]\)/)
})
