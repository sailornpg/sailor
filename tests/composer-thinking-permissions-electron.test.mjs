import assert from 'node:assert/strict'
import { execFile } from 'node:child_process'
import { createRequire } from 'node:module'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { createServer } from 'vite'

const require = createRequire(import.meta.url)
const electron = require('electron')
const executeFile = promisify(execFile)
const root = fileURLToPath(new URL('..', import.meta.url))
const harness = join(root, 'tests/fixtures/thinking-slider-electron-harness.cjs')
const temp = mkdtempSync(join(tmpdir(), 'sailor-composer-smoke-'))
const reportPath = join(temp, 'report.json')
const screenshotPath = join(temp, 'thinking-slider.png')

const composer = readFileSync(
  join(root, 'src/renderer/src/components/chat/composer/SailorComposer.tsx'),
  'utf8',
)
const slider = readFileSync(
  join(root, 'src/renderer/src/components/chat/composer/ThinkingLevelSlider.tsx'),
  'utf8',
)
const shadcnSlider = readFileSync(join(root, 'src/renderer/src/components/ui/slider.tsx'), 'utf8')
assert.match(composer, /<ThinkingLevelSlider\b/)
assert.match(slider, /thinkingLevels\.map/)
assert.match(slider, /data-thinking-step/)
assert.ok(shadcnSlider.includes("from 'radix-ui'") || shadcnSlider.includes('from "radix-ui"'))

const vite = await createServer({
  configFile: false,
  root,
  appType: 'mpa',
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@': join(root, 'src/renderer/src'),
      '@shared': join(root, 'src/shared'),
    },
  },
  server: { host: '127.0.0.1', port: 0, strictPort: true },
})

try {
  await vite.listen()
  const address = vite.httpServer?.address()
  assert.ok(address && typeof address === 'object')
  const fixtureUrl = `http://127.0.0.1:${address.port}/tests/fixtures/thinking-slider-electron.html`
  const env = { ...process.env, ELECTRON_DISABLE_SECURITY_WARNINGS: '1' }
  delete env.ELECTRON_RUN_AS_NODE
  try {
    await executeFile(electron, [harness, reportPath, fixtureUrl, screenshotPath], {
      cwd: root,
      env,
      encoding: 'utf8',
      timeout: 60000,
      maxBuffer: 1024 * 1024,
    })
  } catch (error) {
    throw new Error(error.stderr || error.stdout || error.message)
  }
  const report = JSON.parse(readFileSync(reportPath, 'utf8'))
  assert.ok(report.sliderGeometry, JSON.stringify(report))
  assert.equal(report.sliderGeometry.markerCount, 8)
  assert.ok(
    report.sliderGeometry.maxAlignmentError < 1,
    `every tick should align with thumb travel positions: ${JSON.stringify(report.sliderGeometry)}`,
  )
  assert.equal(report.sliderGeometry.rootHeight, '20px')
  assert.equal(report.sliderGeometry.railHeight, '6px')
  assert.equal(report.sliderGeometry.railBorder, '0px')
  assert.equal(report.sliderGeometry.thumbWidth, 16)
  assert.equal(report.sliderGeometry.thumbHeight, 16)
  assert.equal(report.sliderGeometry.thumbBorder, '0px')
  assert.equal(report.sliderGeometry.markerInset, '8px')
  assert.ok(report.modelListScrollable)
  assert.ok(
    report.draggedValue > 0,
    `dragging should change the thinking level: ${JSON.stringify(report)}`,
  )
  assert.ok(report.draggedValues.length > 0)
  assert.equal(report.draggedValues.at(-1), report.draggedLevel)
  assert.equal(report.keyboardValue, report.draggedValue + 1)
  assert.equal(report.keyboardFocusVisible, true)
  assert.notEqual(report.themeColors.light, report.themeColors.dark)
  assert.equal(report.retainedAfterReopen, true)
  assert.equal(report.thinkingPersisted, true)
  assert.deepEqual(report.request, {
    thinkingLevel: report.keyboardLevel,
    permissionMode: 'allow-all',
  })
  assert.deepEqual(report.resumed, {
    thinkingLevel: report.keyboardLevel,
    permissionMode: 'allow-all',
  })
  assert.equal(report.persisted, true)
  assert.equal(report.unifiedMenu, true)
  assert.equal(report.footerOutsideModelList, true)
  assert.equal(report.status, 'approval-pending')
  console.log('PASS composer thinking/permission Electron smoke')
  if (process.env.SAILOR_KEEP_SMOKE_ARTIFACTS === '1') {
    console.log(`Electron screenshot: ${screenshotPath}`)
  }
} finally {
  await vite.close()
  if (process.env.SAILOR_KEEP_SMOKE_ARTIFACTS !== '1') {
    rmSync(temp, { recursive: true, force: true })
  }
}
