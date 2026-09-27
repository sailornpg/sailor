import assert from 'node:assert/strict'
import test from 'node:test'
import { createServer } from 'vite'

test('Pi TUI commands expose explicit Sailor actions while Skills stay literal', async (t) => {
  const vite = await createServer({ logLevel: 'silent', server: { middlewareMode: true } })
  t.after(() => vite.close())
  const { SAILOR_COMPOSER_SLASH_COMMANDS } = await vite.ssrLoadModule(
    '/src/main/agent/pi/piSlashCommands.ts',
  )

  assert.deepEqual(
    SAILOR_COMPOSER_SLASH_COMMANDS.map(({ id, source, action }) => ({ id, source, action })),
    [
      { id: 'btw', source: 'sailor', action: undefined },
      { id: 'settings', source: 'sailor', action: 'settings' },
      { id: 'model', source: 'sailor', action: 'model' },
      { id: 'new', source: 'sailor', action: 'new' },
      { id: 'quit', source: 'sailor', action: 'quit' },
      { id: 'reload', source: 'sailor', action: 'reload' },
      { id: 'compact', source: 'sailor', action: 'compact' },
    ],
  )
  assert.equal(SAILOR_COMPOSER_SLASH_COMMANDS.find((item) => item.id === 'btw')?.action, undefined)
})
