// Fixture preload: exposes exactly the browser surface the real preload exposes,
// but backed by an injected Transport so the harness can assert on the wire.
const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('sailor', {
  browser: {
    attach: (input) => ipcRenderer.invoke('browser:attach', input),
    detach: (input) => ipcRenderer.invoke('browser:detach', input),
    setBounds: (input) => ipcRenderer.invoke('browser:set-bounds', input),
    navigate: (input) => ipcRenderer.invoke('browser:navigate', input),
    history: (input) => ipcRenderer.invoke('browser:history', input),
    reload: (input) => ipcRenderer.invoke('browser:reload', input),
    stop: (input) => ipcRenderer.invoke('browser:stop', input),
    newTab: (input) => ipcRenderer.invoke('browser:new-tab', input),
    closeTab: (input) => ipcRenderer.invoke('browser:close-tab', input),
    activateTab: (input) => ipcRenderer.invoke('browser:activate-tab', input),
    setAgentAccess: (input) => ipcRenderer.invoke('browser:set-agent-access', input),
    readCapture: (input) => ipcRenderer.invoke('browser:read-capture', input),
    subscribe: (listener) => {
      const handler = (_event, state) => listener(state)
      ipcRenderer.on('browser:state', handler)
      return () => ipcRenderer.removeListener('browser:state', handler)
    },
    onReveal: (listener) => {
      const handler = (_event, payload) => listener(payload)
      ipcRenderer.on('browser:reveal', handler)
      return () => ipcRenderer.removeListener('browser:reveal', handler)
    },
  },
})

contextBridge.exposeInMainWorld('browserTest', {
  ready: () => ipcRenderer.send('browser-test:ready'),
  done: (results) => ipcRenderer.send('browser-test:done', results),
})
