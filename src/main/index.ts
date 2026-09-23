import { app, BrowserWindow, nativeImage } from 'electron'
import { join } from 'node:path'
import { createMainWindow } from './window.js'
import { registerIpc } from './ipc/registerIpc.js'

let cleanupIpc: (() => void) | undefined

app.whenReady().then(() => {
  const iconPath = join(app.isPackaged ? process.resourcesPath : app.getAppPath(), 'resources/icon.png')
  if (process.platform === 'darwin') app.dock?.setIcon(nativeImage.createFromPath(iconPath))
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
