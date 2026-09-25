import assert from 'node:assert/strict'
import { readdir, readFile, stat } from 'node:fs/promises'
import { join } from 'node:path'
import test from 'node:test'

const rendererRoot = 'src/renderer/src'
const assistantElementsRoot = join(rendererRoot, 'components/assistant-ui')
const legacyElementsRoot = join(rendererRoot, 'components/ai-elements')

async function filesUnder(root: string): Promise<string[]> {
  const entries = await readdir(root, { withFileTypes: true })
  const nested = await Promise.all(
    entries.map(async (entry) => {
      const path = join(root, entry.name)
      return entry.isDirectory() ? filesUnder(path) : [path]
    }),
  )
  return nested.flat()
}

test('legacy AI Elements sources and imports are absent', async () => {
  await assert.rejects(stat(legacyElementsRoot), /ENOENT/)
  const files = (await filesUnder(rendererRoot)).filter((file) => /\.(ts|tsx|css)$/.test(file))
  const offenders: string[] = []
  for (const file of files) {
    if ((await readFile(file, 'utf8')).includes('/ai-elements/')) offenders.push(file)
  }
  assert.deepEqual(offenders, [])
})

test('generic assistant-ui elements do not reach into Sailor business boundaries', async () => {
  const files = (await filesUnder(assistantElementsRoot)).filter((file) => /\.(ts|tsx)$/.test(file))
  const forbidden = [
    'window.sailor',
    '@/lib/WorkspaceChats',
    '@shared/',
    'src/main',
    '@/components/chat/',
  ]
  const offenders: string[] = []
  for (const file of files) {
    const source = await readFile(file, 'utf8')
    if (forbidden.some((needle) => source.includes(needle))) offenders.push(file)
  }
  assert.deepEqual(offenders, [])
})

test('Sailor composer uses the standalone elements-composer surface with runtime primitives', async () => {
  const composerPath = join(rendererRoot, 'components/chat/composer/SailorComposer.tsx')
  const stylesPath = join(rendererRoot, 'styles/globals.css')
  const composer = await readFile(composerPath, 'utf8')
  const styles = await readFile(stylesPath, 'utf8')

  assert.match(
    composer,
    /ComposerBar[\s\S]*ComposerModelTrigger[\s\S]*ComposerSend[\s\S]*from ['"]@\/components\/assistant-ui\/elements\/composer['"]/,
  )
  assert.match(composer, /<ComposerPrimitive\.Root/)
  assert.match(composer, /<ComposerBar/)
  assert.match(composer, /<ComposerModelTrigger/)
  assert.match(composer, /<ComposerSend/)
  assert.doesNotMatch(composer, /Composer as AssistantComposer/)
  assert.doesNotMatch(styles, /\.sailor-composer\s*\{/)
  assert.doesNotMatch(styles, /\.sailor-composer-input/)
})
