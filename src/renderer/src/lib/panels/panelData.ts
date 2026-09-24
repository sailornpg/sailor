export interface WebPreviewState {
  url: string
  content: string
  title: string
}

export interface PanelRuntimeData {
  file?: { projectId: string; path: string; nonce: string }
  preview?: WebPreviewState
  sideChat?: { chatId: string; parentChatId: string }
}

export interface PanelOpenRequest {
  panelId: string
  data?: PanelRuntimeData
}

const listeners = new Set<(request: PanelOpenRequest) => void>()

/** Tool output is untrusted: only structurally valid requests reach the dock. */
export function parsePanelOpenRequest(value: unknown): PanelOpenRequest | null {
  if (!value || typeof value !== 'object') return null
  const candidate = value as Record<string, unknown>
  if (typeof candidate.panelId !== 'string' || !candidate.panelId) return null
  const data =
    candidate.data && typeof candidate.data === 'object'
      ? (candidate.data as PanelRuntimeData)
      : undefined
  if (
    data?.preview &&
    (typeof data.preview.url !== 'string' || typeof data.preview.content !== 'string')
  )
    return null
  if (
    data?.file &&
    (typeof data.file.projectId !== 'string' ||
      typeof data.file.path !== 'string' ||
      typeof data.file.nonce !== 'string')
  )
    return null
  if (
    data?.sideChat &&
    (typeof data.sideChat.chatId !== 'string' || typeof data.sideChat.parentChatId !== 'string')
  )
    return null
  return { panelId: candidate.panelId, data }
}

export function requestPanelOpen(request: PanelOpenRequest): void {
  const parsed = parsePanelOpenRequest(request)
  if (!parsed) return
  for (const listener of listeners) listener(parsed)
}

export function subscribePanelRequests(listener: (request: PanelOpenRequest) => void): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}
