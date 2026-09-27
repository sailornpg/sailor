import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

test('slash command IPC remains a narrow metadata-only contract', async () => {
  const contracts = await readFile('src/shared/contracts.ts', 'utf8')
  const main = await readFile('src/main/ipc/registerIpc.ts', 'utf8')
  const preload = await readFile('src/preload/index.ts', 'utf8')

  assert.match(contracts, /workspaceSlashCommands: ['"]workspace:slash-commands['"]/)
  assert.match(contracts, /slashCommands\(chatId: ChatId\): Promise<ComposerSlashCommand\[\]>/)
  assert.match(
    main,
    /ipcMain\.handle\(IPC\.workspaceSlashCommands[\s\S]*resolveToolContext\(id, signal\)/,
  )
  assert.match(main, /loadComposerSlashCommands\(context\.scope\)/)
  assert.match(main, /IPC\.workspaceSlashCommands,/)
  assert.match(
    preload,
    /slashCommands: \(chatId: string\): Promise<ComposerSlashCommand\[\]>[\s\S]*IPC\.workspaceSlashCommands/,
  )
})
