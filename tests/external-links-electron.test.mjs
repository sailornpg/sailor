import { execFile } from 'node:child_process'
import { createRequire } from 'node:module'
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'
import { build } from 'vite'

const require = createRequire(import.meta.url)
const root = fileURLToPath(new URL('..', import.meta.url))
const temp = await mkdtemp(join(tmpdir(), 'sailor-external-links-'))
try {
  await mkdir(join(temp, 'preload'))
  await writeFile(join(temp, 'preload/index.cjs'), '')
  await build({
    configFile: false,
    logLevel: 'error',
    build: {
      ssr: join(root, 'src/main/window.ts'),
      outDir: join(temp, 'main'),
      rollupOptions: {
        external: ['electron', 'node:path'],
        output: { format: 'cjs', entryFileNames: 'window.cjs' },
      },
    },
  })
  const env = { ...process.env, ELECTRON_DISABLE_SECURITY_WARNINGS: '1' }
  delete env.ELECTRON_RUN_AS_NODE
  const { stdout } = await promisify(execFile)(
    require('electron'),
    [join(root, 'tests/fixtures/external-links-electron-harness.cjs'), temp],
    { cwd: root, env, timeout: 30000, maxBuffer: 1024 * 1024 },
  )
  console.log(stdout.trim())
} finally {
  await rm(temp, { recursive: true, force: true })
}
