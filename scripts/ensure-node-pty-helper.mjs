#!/usr/bin/env node
// node-pty publishes its macOS prebuilds (`prebuilds/darwin-*/spawn-helper`) without the
// executable bit and never restores it in its own install script, so `pty.fork` fails with
// "posix_spawnp failed" until the file is chmodded. Restore the bit after every install for
// every darwin prebuild, not just the host architecture, because packaging for another
// architecture reads the same tree. Do nothing when node-pty is absent or no darwin prebuild
// applies (Windows, or a from-source build).
import { chmod, readdir, stat } from 'node:fs/promises'
import { createRequire } from 'node:module'
import path from 'node:path'

const require = createRequire(import.meta.url)

let packageRoot
try {
  packageRoot = path.dirname(require.resolve('node-pty/package.json'))
} catch {
  process.exit(0)
}

const prebuildsDir = path.join(packageRoot, 'prebuilds')

let entries
try {
  entries = await readdir(prebuildsDir, { withFileTypes: true })
} catch (error) {
  if (error?.code === 'ENOENT') process.exit(0)
  console.error(`[sailor] 无法读取 node-pty 的 prebuilds 目录：${error.message}`)
  process.exit(1)
}

const helpers = entries
  .filter((entry) => entry.isDirectory() && entry.name.startsWith('darwin-'))
  .map((entry) => path.join(prebuildsDir, entry.name, 'spawn-helper'))

for (const helper of helpers) {
  try {
    const info = await stat(helper)
    if ((info.mode & 0o111) === 0o111) continue
    await chmod(helper, 0o755)
    console.log(
      `[sailor] 已补上 node-pty spawn-helper 的执行权限：${path.relative(process.cwd(), helper)}`,
    )
  } catch (error) {
    if (error?.code === 'ENOENT') continue
    console.error(`[sailor] 无法设置 node-pty spawn-helper 的执行权限：${error.message}`)
    process.exit(1)
  }
}
