import { app, BrowserWindow } from 'electron'
import { createMainWindow } from './window.js'
import { registerIpc } from './ipc/registerIpc.js'

let cleanupIpc: (() => void) | undefined

app.whenReady().then(() => {
  const window = createMainWindow()
  cleanupIpc = registerIpc(window)

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      const nextWindow = createMainWindow()
      cleanupIpc?.()
      cleanupIpc = registerIpc(nextWindow)
    }
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

app.on('before-quit', () => cleanupIpc?.())
