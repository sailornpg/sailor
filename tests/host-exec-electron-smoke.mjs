// Real Electron smoke for the Agent host command boundary.
import { spawnSync } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
const root = path.resolve(here, '..')
const electronBinary = path.join(
  root,
  'node_modules',
  'electron',
  'dist',
  'Electron.app',
  'Contents',
  'MacOS',
  'Electron',
)
const env = { ...process.env }
delete env.ELECTRON_RUN_AS_NODE

const result = spawnSync(
  electronBinary,
  [path.join(here, 'fixtures', 'host-exec-electron-harness.cjs')],
  { cwd: root, env, encoding: 'utf8', timeout: 120000 },
)
process.stdout.write(result.stdout ?? '')
process.stderr.write(result.stderr ?? '')
if (result.error) throw result.error
if (result.status !== 0) process.exit(result.status ?? 1)
