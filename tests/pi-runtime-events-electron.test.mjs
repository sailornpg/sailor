import assert from 'node:assert/strict'
import { execFile } from 'node:child_process'
import { createRequire } from 'node:module'
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'

const require = createRequire(import.meta.url)
const electron = require('electron')
const executeFile = promisify(execFile)
const root = fileURLToPath(new URL('..', import.meta.url))
const harness = join(root, 'tests/fixtures/pi-runtime-events-electron-harness.cjs')
const temp = mkdtempSync(join(tmpdir(), 'sailor-pi-runtime-events-'))
const reportPath = join(temp, 'report.json')

try {
  assert.ok(existsSync(harness), 'Pi runtime Electron harness must exist')
  const env = { ...process.env, ELECTRON_DISABLE_SECURITY_WARNINGS: '1' }
  delete env.ELECTRON_RUN_AS_NODE
  await executeFile(electron, [harness, reportPath, temp], {
    cwd: root,
    env,
    encoding: 'utf8',
    timeout: 120000,
    maxBuffer: 2 * 1024 * 1024,
  })
  const report = JSON.parse(readFileSync(reportPath, 'utf8'))
  assert.ok(
    report.results.every((result) => result.ok),
    JSON.stringify(report.results),
  )
  console.log('PASS Pi runtime events Electron smoke')
  if (process.env.SAILOR_KEEP_SMOKE_ARTIFACTS === '1') console.log(`Electron screenshots: ${temp}`)
} finally {
  if (process.env.SAILOR_KEEP_SMOKE_ARTIFACTS !== '1')
    rmSync(temp, { recursive: true, force: true })
}
