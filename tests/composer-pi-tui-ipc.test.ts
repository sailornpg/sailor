import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

test('Pi TUI actions use narrow app/agent IPC without approval plumbing', async () => {
  const [contracts, preload, main, agent, runner] = await Promise.all([
    readFile('src/shared/contracts.ts', 'utf8'),
    readFile('src/preload/index.ts', 'utf8'),
    readFile('src/main/ipc/registerIpc.ts', 'utf8'),
    readFile('src/main/agent/AgentService.ts', 'utf8'),
    readFile('src/main/agent/pi/PiRunner.ts', 'utf8'),
  ])

  assert.match(contracts, /appQuit: ['"]app:quit['"]/)
  assert.match(contracts, /agentCompact: ['"]agent:compact['"]/)
  assert.match(contracts, /quit\(\): Promise<void>/)
  assert.match(contracts, /compact\(chatId: ChatId\): Promise<void>/)
  assert.match(preload, /quit: \(\) => ipcRenderer\.invoke\(IPC\.appQuit\)/)
  assert.match(
    preload,
    /compact: \(chatId: string\) => ipcRenderer\.invoke\(IPC\.agentCompact, chatId\)/,
  )
  assert.match(main, /ipcMain\.handle\(IPC\.appQuit[\s\S]*app\.quit\(\)/)
  assert.match(main, /ipcMain\.handle\(IPC\.agentCompact[\s\S]*agent\.compact\(/)
  assert.match(main, /ipcMain\.removeHandler\(IPC\.appQuit\)/)
  assert.match(main, /ipcMain\.removeHandler\(IPC\.agentCompact\)/)
  assert.match(agent, /async compact\(chatId: string\)/)
  assert.match(agent, /this\.runner\.compact\(/)
  assert.match(agent, /this\.compactions/)
  assert.match(runner, /async compact\(options: PiCompactOptions\)/)
  assert.match(runner, /await session\.compact\(\)/)
  assert.doesNotMatch(
    runner.slice(runner.indexOf('async compact(')),
    /respondToApproval|approvalId/,
  )
})
