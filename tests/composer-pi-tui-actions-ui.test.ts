import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

test('Composer dispatches Pi TUI actions and keeps prompt commands literal', async () => {
  const [composer, adapter, thread] = await Promise.all([
    readFile('src/renderer/src/components/chat/composer/SailorComposer.tsx', 'utf8'),
    readFile('src/renderer/src/components/chat/composer/slashCommands.ts', 'utf8'),
    readFile('src/renderer/src/components/chat/thread/SailorThread.tsx', 'utf8'),
  ])

  for (const action of ['settings', 'model', 'new', 'quit', 'reload', 'compact'])
    assert.match(composer, new RegExp(`command\.action === ['"]${action}['"]`))
  assert.match(composer, /aui\.composer\.setText\(['"]['"]\)/)
  assert.match(composer, /window\.sailor\.app\.quit\(\)/)
  assert.match(composer, /window\.location\.reload\(\)/)
  assert.match(composer, /onNewChat\(\)/)
  assert.match(composer, /onCompact\(\)/)
  assert.match(composer, /removeOnExecute=\{false\}/)
  assert.match(adapter, /onExecute\?: \(command: ComposerSlashCommand\) => void/)
  assert.match(adapter, /execute: \(\) => onExecute\?\.\(command\)/)
  assert.match(thread, /onNewChat: \(\) => Promise<void>/)
  assert.match(thread, /onCompact: \(\) => Promise<void>/)
  assert.doesNotMatch(composer, /respondToApproval|respondToAskUser/)
})
