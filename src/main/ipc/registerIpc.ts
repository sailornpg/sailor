import { WorkspaceStore } from '../workspaces/WorkspaceStore.js'
import { WorkspaceService } from '../workspaces/WorkspaceService.js'
import { join } from 'node:path'
import { app, dialog, ipcMain, type BrowserWindow } from 'electron'
import { z } from 'zod'
import { AgentService } from '../agent/AgentService.js'
import { PiStorage } from '../agent/pi/PiStorage.js'
import { ProviderModelCatalog } from '../settings/ProviderModelCatalog.js'
import { safeStorageCipher } from '../settings/SafeStorageCipher.js'
import { SettingsService } from '../settings/SettingsService.js'
import { WorkspaceFilesService } from '../workspaces/WorkspaceFilesService.js'
import { TerminalService } from '../terminal/TerminalService.js'
import { TerminalIpcHandler, type TerminalSender } from '../terminal/TerminalIpcHandler.js'
import { createNodePtyAdapter } from '../terminal/NodePtyAdapter.js'
import {
  IPC,
  type AgentRunRequest,
  type FetchProviderModelsInput,
  type ModelSelection,
  type ProviderInput,
  type WriteApprovalResponse,
  type AskUserInteractionResponse,
} from '@shared/contracts.js'
import { askUserInteractionResponseSchema } from '@shared/askUser.js'

const providerInputSchema = z.object({
  id: z.string(),
  name: z.string(),
  baseUrl: z.string(),
  protocol: z.enum(['openai-completions', 'openai-responses', 'anthropic-messages']),
  apiKey: z.string().optional(),
  models: z.array(
    z.object({
      id: z.string(),
      name: z.string(),
      contextWindow: z.number().int().positive().nullable(),
      maxOutputTokens: z.number().int().positive().nullable(),
      reasoningLevels: z.array(z.string()),
      vision: z.boolean(),
    }),
  ),
})

const modelSelectionSchema = z.object({
  providerId: z.string(),
  modelId: z.string(),
})

const fetchProviderModelsSchema = z.object({
  providerId: z.string(),
  baseUrl: z.string(),
  apiKey: z.string().optional(),
})

const writeApprovalResponseSchema = z.strictObject({
  chatId: z.string().min(1).max(200),
  approvalId: z.string().min(1).max(256),
  toolCallId: z.string().min(1).max(256),
  toolName: z.enum(['write', 'edit', 'bash', 'host_exec']),
  approved: z.boolean(),
  reason: z.string().max(500).optional(),
})

export function registerIpc(window: BrowserWindow): () => void {
  const piStorageDirectory = join(app.getPath('userData'), 'pi-sessions')
  const piStorage = new PiStorage(piStorageDirectory)
  const settings = new SettingsService(
    join(app.getPath('userData'), 'model-providers.json'),
    safeStorageCipher,
  )
  const workspaces = new WorkspaceService(
    new WorkspaceStore(join(app.getPath('userData'), 'workspaces.json')),
    async () => {
      const result = await dialog.showOpenDialog(window, {
        title: '添加工作区',
        properties: ['openDirectory'],
      })
      return result.canceled ? null : (result.filePaths[0] ?? null)
    },
    () => {
      if (!window.isDestroyed()) window.webContents.send(IPC.workspaceChanged)
    },
    (parentId, sideId) => piStorage.fork(parentId, sideId),
  )
  ipcMain.handle(IPC.workspaceManageChat, async (_event, id, input) => {
    const deletedIds = await workspaces.manageChat(id, input)
    const cleanup = await Promise.allSettled(deletedIds.map((chatId) => agent.deleteChat(chatId)))
    const failure = cleanup.find((result) => result.status === 'rejected')
    if (failure?.status === 'rejected')
      throw new Error('会话记录已删除，但 Pi 状态清理失败。', { cause: failure.reason })
  })
  ipcMain.handle(IPC.workspaceRetrySave, (_event, id) => workspaces.retrySave(id))
  ipcMain.handle(IPC.workspaceSnapshot, () => workspaces.snapshot())
  ipcMain.handle(IPC.workspacePick, () => workspaces.pickProject())
  ipcMain.handle(IPC.workspaceCreateChat, (_event, id) => workspaces.createChat(id))
  ipcMain.handle(IPC.workspaceCreateSideChat, (_event, id) => workspaces.createSideChat(id))
  ipcMain.handle(IPC.workspaceGetChat, (_event, id) => workspaces.getChat(id))
  ipcMain.handle(IPC.workspacePermission, (_event, input) =>
    workspaces.setPermission(
      z
        .object({
          projectId: z.string().min(1).max(200),
          mode: z.enum(['allow-reads', 'allow-edits', 'allow-all']),
        })
        .parse(input),
    ),
  )
  ipcMain.handle(IPC.workspacePreferences, (_event, input) => workspaces.setPreferences(input))
  const workspaceFiles = new WorkspaceFilesService((projectId) =>
    workspaces.resolveProjectRoot(projectId),
  )
  const workspaceFilesListSchema = z.object({
    projectId: z.string().min(1).max(200),
    path: z.string().max(1000).optional(),
    cursor: z.string().max(32).optional(),
  })
  const workspaceFilesReadSchema = z.object({
    projectId: z.string().min(1).max(200),
    path: z.string().min(1).max(1000),
  })
  ipcMain.handle(IPC.workspaceFilesList, (_event, input) => {
    const value = workspaceFilesListSchema.parse(input)
    return workspaceFiles.list(value.projectId, value.path, value.cursor)
  })
  ipcMain.handle(IPC.workspaceFilesRead, (_event, input) => {
    const value = workspaceFilesReadSchema.parse(input)
    return workspaceFiles.read(value.projectId, value.path)
  })
  const agent = new AgentService(
    (runId, event) => {
      if (!window.isDestroyed()) window.webContents.send(IPC.agentEvent, { runId, event })
    },
    settings,
    {
      workspace: workspaces,
      piStorageDirectory,
    },
  )
  const modelCatalog = new ProviderModelCatalog(settings)

  const terminals = new TerminalService({
    resolveProjectRoot: (projectId) => workspaces.resolveProjectRoot(projectId),
    adapter: createNodePtyAdapter(),
  })
  const terminalSender = (contents: Electron.WebContents): TerminalSender => ({
    id: contents.id,
    isDestroyed: () => contents.isDestroyed(),
    send: (payload) => {
      if (!contents.isDestroyed()) contents.send(IPC.terminalEvent, payload)
    },
  })
  const terminalIpc = new TerminalIpcHandler({
    service: terminals,
    // Only the window created here may drive a host shell.
    isTrustedSender: (sender) => !window.isDestroyed() && sender.id === window.webContents.id,
  })

  ipcMain.handle(IPC.appVersion, () => app.getVersion())
  ipcMain.handle(IPC.agentStart, async (_event, request: AgentRunRequest) => {
    const valid = z
      .object({
        runId: z.string().min(1),
        chatId: z.string().min(1),
        messages: z.array(z.unknown()),
        thinkingLevel: z
          .enum(['provider-default', 'off', 'minimal', 'low', 'medium', 'high', 'xhigh', 'max'])
          .optional(),
        reasoning: z
          .enum([
            'provider-default',
            'none',
            'off',
            'minimal',
            'low',
            'medium',
            'high',
            'xhigh',
            'max',
          ])
          .optional(),
      })
      .refine((value) => value.thinkingLevel !== undefined || value.reasoning !== undefined)
      .parse(request) as AgentRunRequest
    void agent.start(valid).catch(() => {
      window.webContents.send(IPC.agentEvent, {
        runId: valid.runId,
        event: { type: 'chunk', chunk: { type: 'error', errorText: '会话启动失败。' } },
      })
      window.webContents.send(IPC.agentEvent, { runId: valid.runId, event: { type: 'end' } })
    })
  })
  ipcMain.handle(IPC.agentAbort, (_event, runId: string) => agent.abort(z.string().parse(runId)))
  ipcMain.handle(IPC.agentRespondToApproval, (_event, response: WriteApprovalResponse) =>
    agent.respondToApproval(writeApprovalResponseSchema.parse(response)),
  )
  ipcMain.handle(IPC.agentRespondToAskUser, (_event, response: AskUserInteractionResponse) =>
    agent.respondToAskUser(askUserInteractionResponseSchema.parse(response)),
  )
  ipcMain.handle(IPC.agentRevokeApprovals, (_event, chatId: string) =>
    agent.revokeApprovals(z.string().min(1).max(200).parse(chatId)),
  )
  ipcMain.handle(IPC.settingsProviders, () => settings.getSnapshot())
  ipcMain.handle(IPC.settingsSaveProvider, (_event, input: ProviderInput) =>
    settings.saveProvider(providerInputSchema.parse(input)),
  )
  ipcMain.handle(IPC.settingsDeleteProvider, (_event, providerId: string) =>
    settings.deleteProvider(z.string().parse(providerId)),
  )
  ipcMain.handle(IPC.settingsSetActiveModel, (_event, selection: ModelSelection) =>
    settings.setActiveModel(modelSelectionSchema.parse(selection)),
  )
  ipcMain.handle(IPC.settingsFetchModels, (_event, input: FetchProviderModelsInput) =>
    modelCatalog.fetchModels(fetchProviderModelsSchema.parse(input)),
  )
  ipcMain.handle(IPC.terminalCreate, (event, input: unknown) =>
    terminalIpc.create(terminalSender(event.sender), input),
  )
  ipcMain.handle(IPC.terminalList, (event, input: unknown) =>
    terminalIpc.list(terminalSender(event.sender), input),
  )
  ipcMain.handle(IPC.terminalAttach, (event, input: unknown) =>
    terminalIpc.attach(terminalSender(event.sender), input),
  )
  ipcMain.handle(IPC.terminalDetach, (event, subscriptionId: unknown) =>
    terminalIpc.detach(terminalSender(event.sender), subscriptionId),
  )
  ipcMain.handle(IPC.terminalWrite, (event, input: unknown) =>
    terminalIpc.write(terminalSender(event.sender), input),
  )
  ipcMain.handle(IPC.terminalResize, (event, input: unknown) =>
    terminalIpc.resize(terminalSender(event.sender), input),
  )
  ipcMain.handle(IPC.terminalTerminate, (event, input: unknown) =>
    terminalIpc.terminate(terminalSender(event.sender), input),
  )

  return () => {
    agent.abortAll()
    terminalIpc.dispose()
    void terminals.disposeAll()
    for (const channel of [
      IPC.workspaceManageChat,
      IPC.workspaceRetrySave,
      IPC.workspaceSnapshot,
      IPC.workspacePick,
      IPC.workspaceCreateChat,
      IPC.workspaceCreateSideChat,
      IPC.workspaceGetChat,
      IPC.workspacePermission,
      IPC.workspacePreferences,
      IPC.workspaceFilesList,
      IPC.workspaceFilesRead,
    ])
      ipcMain.removeHandler(channel)
    ipcMain.removeHandler(IPC.appVersion)
    ipcMain.removeHandler(IPC.agentStart)
    ipcMain.removeHandler(IPC.agentAbort)
    ipcMain.removeHandler(IPC.agentRespondToApproval)
    ipcMain.removeHandler(IPC.agentRespondToAskUser)
    ipcMain.removeHandler(IPC.agentRevokeApprovals)
    ipcMain.removeHandler(IPC.settingsProviders)
    ipcMain.removeHandler(IPC.settingsSaveProvider)
    ipcMain.removeHandler(IPC.settingsDeleteProvider)
    ipcMain.removeHandler(IPC.settingsSetActiveModel)
    ipcMain.removeHandler(IPC.settingsFetchModels)
    ipcMain.removeHandler(IPC.terminalCreate)
    ipcMain.removeHandler(IPC.terminalList)
    ipcMain.removeHandler(IPC.terminalAttach)
    ipcMain.removeHandler(IPC.terminalDetach)
    ipcMain.removeHandler(IPC.terminalWrite)
    ipcMain.removeHandler(IPC.terminalResize)
    ipcMain.removeHandler(IPC.terminalTerminate)
  }
}
