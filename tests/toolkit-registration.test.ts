import assert from 'node:assert/strict'
import test from 'node:test'
import { resolve } from 'node:path'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
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

test('sailor toolkit exposes stable backend UI renderers for the known tool names', async () => {
  const module = await loadRendererModule(
    '/src/renderer/src/components/chat/tools/sailorToolkit.tsx',
  )
  assert.ok(module.sailorToolkit)
  assert.deepEqual(Object.keys(module.sailorToolkit), [
    'read_document',
    'write',
    'edit',
    'bash',
    'web_search',
    'fetch_page',
    'ask_user',
    'update_plan',
  ])
  for (const [toolName, entry] of Object.entries(module.sailorToolkit) as [
    string,
    Record<string, unknown>,
  ][]) {
    assert.equal(entry.type, 'backend', `${toolName} must remain UI-only backend registration`)
    assert.equal(typeof entry.render, 'function', `${toolName} must have a renderer`)
    assert.equal('execute' in entry, false, `${toolName} must not define a frontend executor`)
  }
  assert.equal(module.sailorToolkit.read_document.render, module.SailorToolCall)
})

test('toolkit fallback resolves registered renderers and keeps hidden tools out of the message list', async () => {
  const module = await loadRendererModule(
    '/src/renderer/src/components/chat/tools/sailorToolkit.tsx',
  )
  assert.equal(module.toolRendererFor('web_search'), module.sailorToolkit.web_search.render)
  assert.equal(module.toolRendererFor('fetch_page'), module.sailorToolkit.fetch_page.render)
  assert.equal(module.toolRendererFor('ask_user'), module.sailorToolkit.ask_user.render)
  assert.equal(module.toolRendererFor('update_plan'), module.sailorToolkit.update_plan.render)
  assert.equal(module.toolRendererFor('constructor'), undefined)
  assert.equal(module.toolRendererFor('unknown_tool'), undefined)
})

test('backend toolkit entries do not expose model parameters or execute callbacks', async () => {
  const module = await loadRendererModule(
    '/src/renderer/src/components/chat/tools/sailorToolkit.tsx',
  )
  for (const entry of Object.values(module.sailorToolkit) as Record<string, unknown>[]) {
    assert.equal('parameters' in entry, false)
    assert.equal('execute' in entry, false)
  }
})

test('invalid web page URLs and incomplete results safely fall back without throwing', async () => {
  const { StructuredToolFallback } = await loadRendererModule(
    '/src/renderer/src/components/chat/tools/StructuredToolFallback.tsx',
  )
  assert.doesNotThrow(() =>
    renderToStaticMarkup(
      React.createElement(StructuredToolFallback, {
        toolName: 'fetch_page',
        toolCallId: 'fetch-invalid',
        args: { url: 'not a URL' },
        argsText: '{}',
        result: { url: 'not a URL', mainText: 'untrusted content' },
        status: { type: 'complete' },
      }),
    ),
  )
  assert.doesNotThrow(() =>
    renderToStaticMarkup(
      React.createElement(StructuredToolFallback, {
        toolName: 'web_search',
        toolCallId: 'search-empty',
        args: {},
        argsText: '{}',
        result: { unexpected: true },
        status: { type: 'complete' },
      }),
    ),
  )
})
