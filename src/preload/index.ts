import { contextBridge, ipcRenderer } from 'electron'
import {
  IPC,
  type AgentRunEvent,
  type AgentRunRequest,
  type FetchProviderModelsInput,
  type ModelSelection,
  type ProviderInput,
  type SailorApi,
  type WriteApprovalResponse,
  type AskUserInteractionResponse,
  type WorkspaceFilesListInput,
  type WorkspaceFilesReadInput,
} from '@shared/contracts.js'
import type {
  TerminalAttachInput,
  TerminalIpcEvent,
  TerminalListInput,
  TerminalOpenInput,
  TerminalResizeInput,
  TerminalSessionInput,
  TerminalWriteInput,
} from '@shared/terminal.js'

const api: SailorApi = {
  app: {
    getVersion: () => ipcRenderer.invoke(IPC.appVersion),
  },
  agent: {
    start: (request: AgentRunRequest) => ipcRenderer.invoke(IPC.agentStart, request),
    abort: (runId: string) => ipcRenderer.invoke(IPC.agentAbort, runId),
    respondToApproval: (response: WriteApprovalResponse) =>
      ipcRenderer.invoke(IPC.agentRespondToApproval, response),
    respondToAskUser: (response: AskUserInteractionResponse) =>
      ipcRenderer.invoke(IPC.agentRespondToAskUser, response),
    revokeApprovals: (chatId: string) => ipcRenderer.invoke(IPC.agentRevokeApprovals, chatId),
    subscribe: (listener) => {
      const handler = (
        _event: Electron.IpcRendererEvent,
        payload: { runId: string; event: AgentRunEvent },
      ) => listener(payload.runId, payload.event)

      ipcRenderer.on(IPC.agentEvent, handler)
      return () => ipcRenderer.removeListener(IPC.agentEvent, handler)
    },
  },
  workspaces: {
    manageChat: (id, input) => ipcRenderer.invoke(IPC.workspaceManageChat, id, input),
    subscribe: (listener) => {
      const handler = () => listener()
      ipcRenderer.on(IPC.workspaceChanged, handler)
      return () => ipcRenderer.removeListener(IPC.workspaceChanged, handler)
    },
    retrySave: (id) => ipcRenderer.invoke(IPC.workspaceRetrySave, id),
    snapshot: () => ipcRenderer.invoke(IPC.workspaceSnapshot),
    pickProject: () => ipcRenderer.invoke(IPC.workspacePick),
    createChat: (id) => ipcRenderer.invoke(IPC.workspaceCreateChat, id),
    createSideChat: (id) => ipcRenderer.invoke(IPC.workspaceCreateSideChat, id),
    getChat: (id) => ipcRenderer.invoke(IPC.workspaceGetChat, id),
    setPermission: (input) => ipcRenderer.invoke(IPC.workspacePermission, input),
    setPreferences: (input) => ipcRenderer.invoke(IPC.workspacePreferences, input),
    files: {
      list: (input: WorkspaceFilesListInput) => ipcRenderer.invoke(IPC.workspaceFilesList, input),
      read: (input: WorkspaceFilesReadInput) => ipcRenderer.invoke(IPC.workspaceFilesRead, input),
    },
  },
  settings: {
    getSnapshot: () => ipcRenderer.invoke(IPC.settingsProviders),
    saveProvider: (input: ProviderInput) => ipcRenderer.invoke(IPC.settingsSaveProvider, input),
    deleteProvider: (providerId: string) =>
      ipcRenderer.invoke(IPC.settingsDeleteProvider, providerId),
    setActiveModel: (selection: ModelSelection) =>
      ipcRenderer.invoke(IPC.settingsSetActiveModel, selection),
    fetchModels: (input: FetchProviderModelsInput) =>
      ipcRenderer.invoke(IPC.settingsFetchModels, input),
  },
  terminal: {
    create: (input: TerminalOpenInput) => ipcRenderer.invoke(IPC.terminalCreate, input),
    list: (input: TerminalListInput) => ipcRenderer.invoke(IPC.terminalList, input),
    attach: (input: TerminalAttachInput) => ipcRenderer.invoke(IPC.terminalAttach, input),
    detach: (subscriptionId: string) => ipcRenderer.invoke(IPC.terminalDetach, subscriptionId),
    write: (input: TerminalWriteInput) => ipcRenderer.invoke(IPC.terminalWrite, input),
    resize: (input: TerminalResizeInput) => ipcRenderer.invoke(IPC.terminalResize, input),
    terminate: (input: TerminalSessionInput) => ipcRenderer.invoke(IPC.terminalTerminate, input),
    subscribe: (listener) => {
      const handler = (_event: Electron.IpcRendererEvent, payload: TerminalIpcEvent) =>
        listener(payload)
      ipcRenderer.on(IPC.terminalEvent, handler)
      return () => ipcRenderer.removeListener(IPC.terminalEvent, handler)
    },
  },
}

contextBridge.exposeInMainWorld('sailor', api)
