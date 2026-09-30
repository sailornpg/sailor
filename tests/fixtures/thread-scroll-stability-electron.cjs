// Renders the real Thread in an offscreen Electron window and drives scripted
// streaming runs while measuring viewport follow arbitration and tail geometry.
const { app, BrowserWindow, ipcMain, nativeTheme } = require('electron')
const { mkdtempSync, mkdirSync, rmSync, writeFileSync } = require('node:fs')
const { join, resolve } = require('node:path')
const { tmpdir } = require('node:os')

const userData = mkdtempSync(join(tmpdir(), 'sailor-scroll-ui-'))
app.setPath('userData', userData)
app.disableHardwareAcceleration()
app.commandLine.appendSwitch('no-sandbox')

let server
let win

app
  .whenReady()
  .then(async () => {
    const { createServer } = await import('vite')
    const tailwindcss = (await import('@tailwindcss/vite')).default
    server = await createServer({
      configFile: false,
      root: process.cwd(),
      logLevel: 'error',
      plugins: [tailwindcss()],
      esbuild: { jsx: 'automatic' },
      resolve: { alias: { '@': resolve('src/renderer/src'), '@shared': resolve('src/shared') } },
      server: { host: '127.0.0.1', port: 0 },
    })
    await server.listen()
    win = new BrowserWindow({
      show: false,
      width: 1100,
      height: 760,
      webPreferences: {
        preload: resolve('tests/fixtures/thread-scroll-stability-preload.cjs'),
        sandbox: true,
        contextIsolation: true,
        // The window stays hidden; without this the page stops painting and no
        // animation frame the measurement relies on would ever run.
        backgroundThrottling: false,
      },
    })
    ipcMain.handle('scroll-test:environment', async (_event, options) => {
      nativeTheme.themeSource = options?.dark ? 'dark' : 'light'
      win.setContentSize(options?.narrow ? 480 : 1100, 760)
    })
    ipcMain.handle('scroll-test:capture', async (_event, name) => {
      const directory = resolve('.agent-harness/evidence/thread-scroll-stability')
      mkdirSync(directory, { recursive: true })
      writeFileSync(join(directory, `${name}.png`), (await win.webContents.capturePage()).toPNG())
    })
    ipcMain.on('scroll-test:done', async (_event, results) => {
      for (const result of results)
        console.log(
          `${result.ok ? 'PASS' : 'FAIL'} ${result.name}${result.error ? `: ${result.error}` : ''}`,
        )
      await server.close()
      win.destroy()
      app.exit(results.length > 0 && results.every((result) => result.ok) ? 0 : 1)
    })
    const port = server.httpServer.address().port
    await win.loadURL(`http://127.0.0.1:${port}/tests/fixtures/thread-scroll-stability.html`)
  })
  .catch((error) => {
    console.error(error)
    app.exit(1)
  })

process.on('exit', () => rmSync(userData, { recursive: true, force: true }))
