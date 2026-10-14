// Runs the sidebar-browser smoke inside a real Electron main process.
//
// The harness (tests/fixtures/browser-electron-harness.cjs) serves the production
// BrowserPanel component in a sandboxed window, wires the production browser
// service to it, and drives real navigation / accessibility snapshot / click /
// screenshot against a local fixture page.
import { spawn } from 'node:child_process'
import { createRequire } from 'node:module'
import { resolve } from 'node:path'

const require = createRequire(import.meta.url)
const env = { ...process.env }
delete env.ELECTRON_RUN_AS_NODE

const child = spawn(require('electron'), [resolve('tests/fixtures/browser-electron-harness.cjs')], {
  cwd: process.cwd(),
  env,
  stdio: 'inherit',
})

const timeout = setTimeout(() => child.kill('SIGKILL'), 120_000)
child.on('exit', (code) => {
  clearTimeout(timeout)
  process.exitCode = code ?? 1
})
child.on('error', (error) => {
  clearTimeout(timeout)
  console.error(error)
  process.exitCode = 1
})
