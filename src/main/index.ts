import { app, BrowserWindow, nativeImage } from 'electron'
import { join } from 'node:path'
import { createMainWindow, loadMainWindow } from './window.js'
import { registerIpc } from './ipc/registerIpc.js'

const hasSingleInstanceLock = app.requestSingleInstanceLock()

if (!hasSingleInstanceLock) {
  app.quit()
} else {
  let cleanupIpc: (() => void) | undefined

  const focusMainWindow = () => {
    const window = BrowserWindow.getAllWindows()[0]
    if (!window || window.isDestroyed()) return
    if (window.isMinimized()) window.restore()
    window.focus()
  }

  app.on('second-instance', focusMainWindow)

  app.whenReady().then(() => {
    const iconPath = join(
      app.isPackaged ? process.resourcesPath : app.getAppPath(),
      'resources/icon.png',
    )
    if (process.platform === 'darwin') app.dock?.setIcon(nativeImage.createFromPath(iconPath))
    const window = createMainWindow()
    cleanupIpc = registerIpc(window)
    loadMainWindow(window)

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) {
        const nextWindow = createMainWindow()
        cleanupIpc?.()
        cleanupIpc = registerIpc(nextWindow)
        loadMainWindow(nextWindow)
      }
    })
  })

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit()
  })

  app.on('before-quit', () => cleanupIpc?.())
}
