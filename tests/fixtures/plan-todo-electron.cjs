const { app, BrowserWindow, ipcMain, nativeTheme } = require('electron')
const { mkdtempSync, rmSync, mkdirSync, writeFileSync } = require('node:fs')
const { join, resolve } = require('node:path')
const { tmpdir } = require('node:os')
const userData = mkdtempSync(join(tmpdir(), 'sailor-plan-ui-'))
app.setPath('userData', userData)
app.disableHardwareAcceleration()
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
        preload: resolve('tests/fixtures/plan-todo-preload.cjs'),
        sandbox: true,
        contextIsolation: true,
        backgroundThrottling: false,
      },
    })
    ipcMain.handle('plan-test:capture', async (_event, name, dark, narrow) => {
      nativeTheme.themeSource = dark ? 'dark' : 'light'
      win.setContentSize(narrow ? 480 : 1100, 760)
      const directory = resolve('.agent-harness/evidence/todo-approval-lifecycle')
      mkdirSync(directory, { recursive: true })
      writeFileSync(join(directory, `${name}.png`), (await win.webContents.capturePage()).toPNG())
    })
    ipcMain.on('plan-test:done', async (_event, results) => {
      for (const result of results)
        console.log(
          `${result.ok ? 'PASS' : 'FAIL'} ${result.name}${result.error ? `: ${result.error}` : ''}`,
        )
      await server.close()
      win.destroy()
      app.exit(results.every((result) => result.ok) ? 0 : 1)
    })
    const port = server.httpServer.address().port
    await win.loadURL(`http://127.0.0.1:${port}/tests/fixtures/plan-todo.html`)
  })
  .catch((error) => {
    console.error(error)
    app.exit(1)
  })
process.on('exit', () => rmSync(userData, { recursive: true, force: true }))
