import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import { createServer } from 'vite'

test('directive helpers preserve literal text and invalidate edited commands', async (t) => {
  const vite = await createServer({
    logLevel: 'silent',
    server: { middlewareMode: true },
  })
  t.after(() => vite.close())
  const {
    createComposerDirectiveSelection,
    formatComposerDirectiveLabel,
    getComposerDirectiveParts,
  } = await vite.ssrLoadModule('/src/renderer/src/components/chat/composer/composerDirective.ts')
  const command = {
    id: 'skill:ai-sdk',
    label: 'skill:ai-sdk',
    description: 'AI SDK guidance',
    source: 'skill',
    icon: 'Sparkles',
  } as const
  const selected = createComposerDirectiveSelection(command, '/skill:ai-sdk ')

  assert.equal(selected.literal, '/skill:ai-sdk')
  assert.equal(selected.offset, 0)
  assert.equal(formatComposerDirectiveLabel(command), 'Ai Sdk')
  assert.deepEqual(getComposerDirectiveParts('/skill:ai-sdk with context', selected), {
    before: '',
    directive: '/skill:ai-sdk',
    after: ' with context',
  })
  assert.equal(getComposerDirectiveParts('/skill:ai-sdkx', selected), undefined)
  const pending = createComposerDirectiveSelection(command, '/')
  assert.equal(getComposerDirectiveParts('/skill:ai-sdk ', pending)?.directive, '/skill:ai-sdk')
})

test('Composer keeps the literal command while rendering a selected directive token', async () => {
  const [composer, highlight, styles] = await Promise.all([
    readFile('src/renderer/src/components/chat/composer/SailorComposer.tsx', 'utf8'),
    readFile('src/renderer/src/components/chat/composer/ComposerDirectiveHighlight.tsx', 'utf8'),
    readFile('src/renderer/src/styles/globals.css', 'utf8'),
  ])

  assert.match(composer, /selectedDirective/)
  assert.match(
    composer,
    /<ComposerDirectiveHighlight[\s\S]*selection=\{directiveActive \? selectedDirective/,
  )
  assert.match(composer, /onChange=\{handleComposerInputChange\}/)
  assert.match(composer, /spellCheck=\{false\}/)
  assert.match(composer, /literalSlashCommandFormatter/)
  assert.match(highlight, /getComposerDirectiveParts/)
  assert.match(highlight, /formatComposerDirectiveLabel/)
  assert.match(highlight, /data-composer-directive-layer/)
  assert.match(highlight, /data-composer-directive-token/)
  assert.match(styles, /\.sailor-composer-input-tokenized[\s\S]*color: transparent/)
  assert.match(styles, /\.sailor-composer-directive-token[\s\S]*var\(--appearance-accent\)/)
  assert.match(styles, /\.sailor-composer-directive-token\s*\{[^}]*vertical-align: -2px;/)
})

test('manual edits invalidate the selected token without changing the outgoing literal formatter', async () => {
  const [composer, formatter] = await Promise.all([
    readFile('src/renderer/src/components/chat/composer/SailorComposer.tsx', 'utf8'),
    readFile('src/renderer/src/components/chat/composer/slashCommands.ts', 'utf8'),
  ])

  assert.match(composer, /setSelectedDirective\(undefined\)/)
  assert.match(composer, /const value = input\.value/)
  assert.match(composer, /getComposerDirectiveParts/)
  assert.match(formatter, /serialize: \(item\) => `\/\$\{item\.label\}`/)
})
