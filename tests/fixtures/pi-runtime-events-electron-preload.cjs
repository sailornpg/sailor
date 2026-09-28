const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('sailor', {
  agent: {
    start: (request) => ipcRenderer.invoke('pi-smoke:start', request),
    abort: (runId) => ipcRenderer.invoke('pi-smoke:abort', runId),
    compact: (chatId) => ipcRenderer.invoke('pi-smoke:compact', chatId),
    revokeApprovals: async () => {},
    subscribe: (listener) => {
      const handle = (_event, runId, item) => listener(runId, item)
      ipcRenderer.on('pi-smoke:event', handle)
      return () => ipcRenderer.removeListener('pi-smoke:event', handle)
    },
  },
  workspaces: {
    getChat: (chatId) => ipcRenderer.invoke('pi-smoke:get-chat', chatId),
    setPreferences: async () => {},
  },
  fixture: {
    saveMessages: (chatId, messages) =>
      ipcRenderer.invoke('pi-smoke:save-messages', chatId, messages),
  },
})
