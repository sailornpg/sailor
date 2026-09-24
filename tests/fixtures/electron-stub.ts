/**
 * Minimal Electron surface for tests that must load preload/main modules without
 * starting the real runtime. It records what preload exposes so tests can assert
 * the renderer-facing API stays narrow.
 */
export interface ExposedBridge {
  key: string
  api: unknown
}

export const exposed: ExposedBridge[] = []

export const contextBridge = {
  exposeInMainWorld(key: string, api: unknown) {
    exposed.push({ key, api })
  },
}

export const ipcRenderer = {
  async invoke(): Promise<unknown> {
    return undefined
  },
  on(): void {
    // no-op: preload tests assert shape, not delivery
  },
  removeListener(): void {
    // no-op
  },
}
