// Vite's SSR module runner refuses named imports from the CommonJS `electron`
// module. Production builds externalize electron, so this shim only exists to
// give the smoke harness the same named exports at fixture load time.
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const electron = require('electron')

export const { session, WebContentsView, BrowserWindow, app, ipcMain } = electron
export default electron
