import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import { resolve } from 'node:path'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { createServer } from 'vite'

async function loadModules() {
  const vite = await createServer({
    logLevel: 'silent',
    resolve: {
      alias: {
        '@': resolve(process.cwd(), 'src/renderer/src'),
        '@shared': resolve(process.cwd(), 'src/shared'),
      },
    },
    server: { middlewareMode: true },
  })
  try {
    return {
      contracts: await vite.ssrLoadModule('/src/shared/contracts.ts'),
      transport: await vite.ssrLoadModule('/src/renderer/src/lib/IpcChatTransport.ts'),
    }
  } finally {
    await vite.close()
  }
}

type ThinkingLevel =
  'provider-default' | 'off' | 'minimal' | 'low' | 'medium' | 'high' | 'xhigh' | 'max'

test('exposes the fixed Pi thinking levels in stable UI order', () => {
  return loadModules().then(({ contracts }) => {
    const getAvailableThinkingLevels = Reflect.get(contracts, 'getAvailableThinkingLevels') as
      (() => ThinkingLevel[]) | undefined

    assert.equal(typeof getAvailableThinkingLevels, 'function')
    assert.deepEqual(getAvailableThinkingLevels?.(), [
      'provider-default',
      'off',
      'minimal',
      'low',
      'medium',
      'high',
      'xhigh',
      'max',
    ])
  })
})

test('maps provider-default to omitted Pi thinking level and preserves explicit levels', async () => {
  const { contracts } = await loadModules()
  const toPiThinkingLevel = Reflect.get(contracts, 'toPiThinkingLevel') as
    ((level: ThinkingLevel) => ThinkingLevel | undefined) | undefined

  assert.equal(typeof toPiThinkingLevel, 'function')
  assert.equal(toPiThinkingLevel?.('provider-default'), undefined)
  assert.equal(toPiThinkingLevel?.('off'), 'off')
  assert.equal(toPiThinkingLevel?.('max'), 'max')
})

test('creates an agent request carrying the selected thinking level', async () => {
  const { transport } = await loadModules()
  const createAgentRunRequest = Reflect.get(transport, 'createAgentRunRequest') as
    | ((input: {
        runId: string
        chatId: string
        messages: []
        thinkingLevel: ThinkingLevel
      }) => unknown)
    | undefined

  assert.equal(typeof createAgentRunRequest, 'function')
  assert.deepEqual(
    createAgentRunRequest?.({
      runId: 'run-1',
      chatId: 'chat-1',
      messages: [],
      thinkingLevel: 'high',
    }),
    {
      runId: 'run-1',
      chatId: 'chat-1',
      messages: [],
      thinkingLevel: 'high',
    },
  )
})

test('does not expose legacy reasoning level editing in settings', async () => {
  const source = await readFile(
    'src/renderer/src/components/settings/model/ModelSettingsPanel.tsx',
    'utf8',
  )
  assert.doesNotMatch(source, />推理等级</u)
  assert.doesNotMatch(source, /reasoningLevels: event\.target\.value/)
})

test('composer uses menu controls for thinking and workspace permissions', async () => {
  const source = await readFile(
    'src/renderer/src/components/chat/composer/SailorComposer.tsx',
    'utf8',
  )
  assert.match(source, /ComposerMenuItem/)
  assert.match(source, /thinkingLevel/)
  assert.match(source, /permissionMode/)
  assert.doesNotMatch(source, /<select\b/)
})

test('composer combines thinking level with the model menu and keeps a separate permission trigger', async () => {
  const [composer, slider] = await Promise.all([
    readFile('src/renderer/src/components/chat/composer/SailorComposer.tsx', 'utf8'),
    readFile('src/renderer/src/components/chat/composer/ThinkingLevelSlider.tsx', 'utf8'),
  ])
  const source = `${composer}\n${slider}`
  assert.match(source, /data-thinking-slider/)
  assert.equal((source.match(/<ComposerModelTrigger/g) ?? []).length, 2)
  assert.doesNotMatch(source, /ref=\{thinkingRef\}/)
})

test('composer keeps the thinking footer outside the model list scroll container', async () => {
  const [composer, slider] = await Promise.all([
    readFile('src/renderer/src/components/chat/composer/SailorComposer.tsx', 'utf8'),
    readFile('src/renderer/src/components/chat/composer/ThinkingLevelSlider.tsx', 'utf8'),
  ])
  const source = `${composer}\n${slider}`
  assert.match(source, /data-model-list/)
  assert.match(source, /data-model-list[\s\S]*max-h-[^"']+[^"']*overflow-y-auto/)
  const modelListIndex = source.indexOf('data-model-list')
  const thinkingControlIndex = source.indexOf('data-thinking-control')
  assert.ok(modelListIndex >= 0 && thinkingControlIndex > modelListIndex)
  assert.match(source, /data-thinking-control[\s\S]*data-thinking-slider/)
  assert.match(source, /border-t[\s\S]*data-thinking-control/)
  assert.doesNotMatch(source, /fieldInteractive/)
  assert.doesNotMatch(source, /rounded-xl border border-border\/50/)
  assert.match(source, /py-1\.5.*text-\[13px\]/)
})

test('thinking slider uses the shadcn primitive and renders all eight aligned levels', async () => {
  const composer = await readFile(
    'src/renderer/src/components/chat/composer/SailorComposer.tsx',
    'utf8',
  )
  assert.match(composer, /<ThinkingLevelSlider\b/)

  const [sliderSource, shadcnSlider, styles] = await Promise.all([
    readFile('src/renderer/src/components/chat/composer/ThinkingLevelSlider.tsx', 'utf8'),
    readFile('src/renderer/src/components/ui/slider.tsx', 'utf8'),
    readFile('src/renderer/src/styles/globals.css', 'utf8'),
  ])
  assert.match(sliderSource, /import\s*\{\s*Slider\s*\}\s*from\s*['"]@\/components\/ui\/slider['"]/)
  assert.match(sliderSource, /thinkingLevels\.map/)
  assert.match(sliderSource, /data-thinking-step/)
  assert.match(sliderSource, /index\s*\/\s*\(thinkingLevels\.length\s*-\s*1\)/)
  assert.match(sliderSource, /value=\{\[thinkingIndex\]\}/)
  assert.match(sliderSource, /step=\{1\}/)
  assert.match(sliderSource, /aria-valuetext/)
  assert.match(shadcnSlider, /from ['"]radix-ui['"]/)
  assert.match(shadcnSlider, /data-slot="slider-thumb"/)
  assert.match(shadcnSlider, /size-4/)
  assert.doesNotMatch(styles, /\.thinking-range/)

  const vite = await createServer({
    logLevel: 'silent',
    resolve: {
      alias: {
        '@': resolve(process.cwd(), 'src/renderer/src'),
        '@shared': resolve(process.cwd(), 'src/shared'),
      },
    },
    server: { middlewareMode: true },
  })
  try {
    const { ThinkingLevelSlider } = await vite.ssrLoadModule(
      '/src/renderer/src/components/chat/composer/ThinkingLevelSlider.tsx',
    )
    const markup = renderToStaticMarkup(
      createElement(ThinkingLevelSlider, {
        value: 'high',
        onValueChange: () => undefined,
      }),
    )
    const steps = Array.from(
      markup.matchAll(/data-thinking-step="(\d+)"[^>]*style="left:([\d.]+)%"/g),
      ([, index, position]) => ({ index: Number(index), position: Number(position) }),
    )
    assert.deepEqual(
      steps.map(({ index }) => index),
      [0, 1, 2, 3, 4, 5, 6, 7],
    )
    assert.deepEqual(
      steps.map(({ position }) => position),
      Array.from({ length: 8 }, (_, index) => (index / 7) * 100),
    )
    assert.match(markup, /aria-valuemax="7"/)
    assert.match(markup, /aria-label="思考等级"/)
    assert.match(markup, /aria-valuetext="较高"/)
  } finally {
    await vite.close()
  }
})
