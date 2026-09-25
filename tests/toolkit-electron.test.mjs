import { spawn } from 'node:child_process'
import { createRequire } from 'node:module'
import { resolve } from 'node:path'

const require = createRequire(import.meta.url)
const env = { ...process.env }
delete env.ELECTRON_RUN_AS_NODE
const child = spawn(require('electron'), [resolve('tests/fixtures/toolkit-electron-harness.cjs')], {
  cwd: process.cwd(),
  env,
  stdio: 'inherit',
})
const timeout = setTimeout(() => child.kill('SIGKILL'), 60000)
child.on('exit', (code) => {
  clearTimeout(timeout)
  process.exitCode = code ?? 1
})
child.on('error', (error) => {
  clearTimeout(timeout)
  console.error(error)
  process.exitCode = 1
})
