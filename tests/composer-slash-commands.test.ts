import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

test('Composer uses the official assistant-ui slash trigger primitives', async () => {
  const source = await readFile(
    'src/renderer/src/components/chat/composer/SailorComposer.tsx',
    'utf8',
  )
  const items = await readFile(
    'src/renderer/src/components/chat/composer/SlashCommandItems.tsx',
    'utf8',
  )
  const formatter = await readFile(
    'src/renderer/src/components/chat/composer/slashCommands.ts',
    'utf8',
  )

  assert.match(source, /unstable_useSlashCommandAdapter/)
  assert.match(source, /<ComposerPrimitive\.Unstable_TriggerPopoverRoot>/)
  assert.match(
    source,
    /<ComposerPrimitive\.Unstable_TriggerPopover[\s\S]*char="\/"[\s\S]*adapter=\{slash\.adapter\}/,
  )
  assert.match(
    source,
    /<ComposerPrimitive\.Unstable_TriggerPopover\.Action[\s\S]*removeOnExecute=\{false\}/,
  )
  assert.match(source, /<ComposerPrimitive\.Unstable_TriggerPopoverItems/)
  assert.match(items, /<ComposerPrimitive\.Unstable_TriggerPopoverItem[\s\S]*data-\[highlighted\]/)
  assert.match(items, /data-slash-command-list/)
  assert.match(items, /scrollIntoView\(\{[\s\S]*block: 'nearest'/)
  assert.match(source, /literalSlashCommandFormatter/)
  assert.match(formatter, /serialize: \(item\) => `\/\$\{item\.label\}`/)
  assert.match(formatter, /label: command\.label/)
  assert.match(source, /slashCommands\(chatId\)/)
  assert.match(
    source,
    /toSlashCommandDefinitions\(availableSlashCommands[\s\S]*executeSlashCommand\)/,
  )
  assert.match(source, /btwMatch/)
})
