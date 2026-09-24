#!/usr/bin/env node
// node-pty publishes its macOS prebuild (`prebuilds/<platform>-<arch>/spawn-helper`)
// without the executable bit and never restores it in its own install script, so
// `pty.fork` fails with "posix_spawnp failed" until the file is chmodded. Restore
// the bit after every install; do nothing when node-pty is absent or the helper
// does not apply (Windows, or a from-source build).
import { chmod, stat } from 'node:fs/promises'
import { createRequire } from 'node:module'
import path from 'node:path'

const require = createRequire(import.meta.url)

let packageRoot
try {
  packageRoot = path.dirname(require.resolve('node-pty/package.json'))
} catch {
  process.exit(0)
}

const helper = path.join(packageRoot, 'prebuilds', `${process.platform}-${process.arch}`, 'spawn-helper')

try {
  const info = await stat(helper)
  if ((info.mode & 0o111) === 0o111) process.exit(0)
  await chmod(helper, 0o755)
  console.log(`[sailor] 已补上 node-pty spawn-helper 的执行权限：${path.relative(process.cwd(), helper)}`)
} catch (error) {
  if (error?.code === 'ENOENT') process.exit(0)
  console.error(`[sailor] 无法设置 node-pty spawn-helper 的执行权限：${error.message}`)
  process.exit(1)
}
