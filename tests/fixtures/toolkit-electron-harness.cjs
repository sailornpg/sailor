const { app, BrowserWindow, ipcMain } = require('electron')
const { mkdtempSync, rmSync } = require('node:fs')
const { join, resolve } = require('node:path')
const { tmpdir } = require('node:os')

const userData = mkdtempSync(join(tmpdir(), 'sailor-toolkit-ui-'))
app.setPath('userData', userData)
app.disableHardwareAcceleration()
let server
let win
let finished = false

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
        preload: resolve('tests/fixtures/toolkit-electron-preload.cjs'),
        sandbox: true,
        contextIsolation: true,
        backgroundThrottling: false,
      },
    })
    ipcMain.on('toolkit-test:done', async (_event, results) => {
      finished = true
      for (const result of results)
        console.log(
          `${result.ok ? 'PASS' : 'FAIL'} ${result.name}${result.error ? `: ${result.error}` : ''}`,
        )
      win.destroy()
      await server.close()
      app.exit(results.every((result) => result.ok) ? 0 : 1)
    })
    const port = server.httpServer.address().port
    await win.loadURL(`http://127.0.0.1:${port}/tests/fixtures/toolkit-electron.html`)
  })
  .catch((error) => {
    if (finished) return
    console.error(error)
    app.exit(1)
  })

process.on('exit', () => rmSync(userData, { recursive: true, force: true }))
