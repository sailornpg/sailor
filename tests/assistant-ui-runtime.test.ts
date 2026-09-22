import assert from 'node:assert/strict'
import { resolve } from 'node:path'
import test from 'node:test'
import React from 'react'
import { renderToString } from 'react-dom/server'
import { createServer } from 'vite'

async function loadRendererModule(path: string) {
  const vite = await createServer({
    logLevel: 'silent',
    server: { middlewareMode: true },
    resolve: { alias: { '@shared': resolve('src/shared'), '@': resolve('src/renderer/src') } },
  })
  try {
    return await vite.ssrLoadModule(path)
  } finally {
    await vite.close()
  }
}

test('composer policy blocks invalid submissions and clears a recoverable error', async () => {
  const policy = await loadRendererModule('/src/renderer/src/components/chat/composer/composerPolicy.ts').catch(() => ({}))
  assert.equal(typeof policy.createComposerSubmission, 'function')

  assert.equal(policy.createComposerSubmission({ text: '   ', fileCount: 0, isGenerating: false, persistedRunStatus: 'idle' }), null)
  assert.equal(policy.createComposerSubmission({ text: '继续', fileCount: 0, isGenerating: true, persistedRunStatus: 'idle' }), null)
  assert.equal(policy.createComposerSubmission({ text: '继续', fileCount: 0, isGenerating: false, persistedRunStatus: 'running' }), null)
  assert.equal(policy.createComposerSubmission({ text: '继续', fileCount: 0, isGenerating: false, persistedRunStatus: 'idle', saveError: 'disk full' }), null)
  assert.deepEqual(
    policy.createComposerSubmission({ text: '  继续  ', fileCount: 0, isGenerating: false, persistedRunStatus: 'idle', runtimeError: true }),
    { clearRuntimeError: true, text: '  继续  ' },
  )
})

test('model selector slots a custom trigger when its built-in chevron is hidden', async () => {
  const modelSelector = await loadRendererModule(
    '/src/renderer/src/components/assistant-ui/elements/model-selector.tsx',
  )
  const trigger = React.createElement(
    modelSelector.ModelSelectorTrigger,
    { asChild: true, showChevron: false },
    React.createElement('button', { type: 'button' }, 'Model A'),
  )
  const tree = React.createElement(
    modelSelector.ModelSelectorRoot,
    { models: [{ id: 'model-a', name: 'Model A' }], value: 'model-a' },
    trigger,
  )

  assert.doesNotThrow(() => renderToString(tree))
})

test('stop targets the persisted run and otherwise delegates to the active chat', async () => {
  const policy = await loadRendererModule('/src/renderer/src/components/chat/composer/composerPolicy.ts').catch(() => ({}))
  assert.equal(typeof policy.stopChatRun, 'function')
  const calls: string[] = []
  await policy.stopChatRun('run-a', async (runId: string) => { calls.push(`abort:${runId}`) }, async () => { calls.push('stop') })
  await policy.stopChatRun(undefined, async (runId: string) => { calls.push(`abort:${runId}`) }, async () => { calls.push('stop') })
  assert.deepEqual(calls, ['abort:run-a', 'stop', 'stop'])
})

test('workspace registry keeps stable isolated Chat instances while selection changes', async () => {
  const { WorkspaceChats } = await loadRendererModule('/src/renderer/src/lib/WorkspaceChats.ts')
  const api = {
    getChat: async (id: string) => ({ id, messages: [] }),
    setPreferences: async () => {},
  }
  const registry = new WorkspaceChats(api)
  const first = await registry.get('first')
  const second = await registry.get('second')
  await registry.select('second')
  assert.equal(await registry.get('first'), first)
  assert.equal(await registry.get('second'), second)
  assert.notEqual(first, second)
  assert.equal(registry.activeId, 'second')
})
