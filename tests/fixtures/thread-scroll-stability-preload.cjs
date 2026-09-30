const { contextBridge, ipcRenderer } = require('electron')

const piListeners = new Set()
let fileSummary = null

contextBridge.exposeInMainWorld('sailor', {
  agent: {
    subscribe: (listener) => {
      piListeners.add(listener)
      return () => piListeners.delete(listener)
    },
  },
  workspaces: {
    review: {
      subscribe: () => () => {},
      turnSummary: async () => fileSummary,
      detail: async () => null,
      turnDetail: async () => null,
      summary: async () => fileSummary,
    },
  },
})

contextBridge.exposeInMainWorld('scrollTest', {
  // Delivers the same payload shape the main process emits for Pi runtime events.
  emitPiEvent: (event) => {
    const payload = {
      type: 'pi-event',
      event: { chatId: 'fixture', runId: 'run-1', id: event.id, event },
    }
    for (const listener of [...piListeners]) listener('run-1', payload)
  },
  setFileSummary: (summary) => {
    fileSummary = summary
  },
  setEnvironment: (options) => ipcRenderer.invoke('scroll-test:environment', options),
  capture: (name) => ipcRenderer.invoke('scroll-test:capture', name),
  done: (results) => ipcRenderer.send('scroll-test:done', results),
})
