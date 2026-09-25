const { contextBridge, ipcRenderer } = require('electron')
contextBridge.exposeInMainWorld('planTest', {
  done: (results) => ipcRenderer.send('plan-test:done', results),
  capture: (name, dark, narrow) => ipcRenderer.invoke('plan-test:capture', name, dark, narrow),
})
