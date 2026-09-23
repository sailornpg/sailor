import { WorkspaceStore } from '../workspaces/WorkspaceStore.js'
import { WorkspaceService } from '../workspaces/WorkspaceService.js'
import { join } from 'node:path'
import { app, dialog, ipcMain, type BrowserWindow } from 'electron'
import { z } from 'zod'
import { AgentService } from '../agent/AgentService.js'
import { ProviderModelCatalog } from '../settings/ProviderModelCatalog.js'
import { safeStorageCipher } from '../settings/SafeStorageCipher.js'
import { SettingsService } from '../settings/SettingsService.js'
import { WorkspaceFilesService } from '../workspaces/WorkspaceFilesService.js'
import {
  IPC,
  type AgentRunRequest,
  type FetchProviderModelsInput,
  type ModelSelection,
  type ProviderInput,
  type WriteApprovalResponse,
} from '@shared/contracts.js'

const providerInputSchema = z.object({
  id: z.string(),
  name: z.string(),
  baseUrl: z.string(),
  protocol: z.enum(['openai-completions', 'openai-responses', 'anthropic-messages']),
  apiKey: z.string().optional(),
  models: z.array(z.object({
    id: z.string(),
    name: z.string(),
    contextWindow: z.number().int().positive().nullable(),
    maxOutputTokens: z.number().int().positive().nullable(),
    reasoningLevels: z.array(z.string()),
    vision: z.boolean(),
  })),
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
  toolName: z.enum(['write', 'edit', 'bash']),
  approved: z.boolean(),
  reason: z.string().max(500).optional(),
})

export function registerIpc(window: BrowserWindow): () => void {
  const settings = new SettingsService(
    join(app.getPath('userData'), 'model-providers.json'),
    safeStorageCipher,
  )
  const workspaces = new WorkspaceService(new WorkspaceStore(join(app.getPath('userData'), 'workspaces.json')), async () => {
    const result = await dialog.showOpenDialog(window, { title: '添加工作区', properties: ['openDirectory'] })
    return result.canceled ? null : result.filePaths[0] ?? null
  }, () => { if (!window.isDestroyed()) window.webContents.send(IPC.workspaceChanged) })
  ipcMain.handle(IPC.workspaceManageChat, async (_event, id, input) => {
    await workspaces.manageChat(id, input)
    if (input.action === 'delete') await agent.deleteChat(id)
  })
  ipcMain.handle(IPC.workspaceRetrySave, (_event, id) => workspaces.retrySave(id))
  ipcMain.handle(IPC.workspaceSnapshot, () => workspaces.snapshot())
  ipcMain.handle(IPC.workspacePick, () => workspaces.pickProject())
  ipcMain.handle(IPC.workspaceCreateChat, (_event, id) => workspaces.createChat(id))
  ipcMain.handle(IPC.workspaceGetChat, (_event, id) => workspaces.getChat(id))
  ipcMain.handle(IPC.workspacePreferences, (_event, input) => workspaces.setPreferences(input))
  const workspaceFiles = new WorkspaceFilesService(projectId => workspaces.resolveProjectRoot(projectId))
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
  const agent = new AgentService((runId, event) => {
    if (!window.isDestroyed()) window.webContents.send(IPC.agentEvent, { runId, event })
  }, settings, {
    workspace: workspaces,
    piStorageDirectory: join(app.getPath('userData'), 'pi-sessions'),

  })
  const modelCatalog = new ProviderModelCatalog(settings)

  ipcMain.handle(IPC.appVersion, () => app.getVersion())
  ipcMain.handle(IPC.agentStart, async (_event, request: AgentRunRequest) => {
    const valid = z.object({ runId: z.string().min(1), chatId: z.string().min(1), messages: z.array(z.unknown()), reasoning: z.enum(['provider-default', 'none', 'minimal', 'low', 'medium', 'high', 'xhigh']) }).parse(request) as AgentRunRequest
    void agent.start(valid).catch(() => {
      window.webContents.send(IPC.agentEvent, { runId: valid.runId, event: { type: 'chunk', chunk: { type: 'error', errorText: '会话启动失败。' } } })
      window.webContents.send(IPC.agentEvent, { runId: valid.runId, event: { type: 'end' } })
    })
  })
  ipcMain.handle(IPC.agentAbort, (_event, runId: string) => agent.abort(z.string().parse(runId)))
  ipcMain.handle(IPC.agentRespondToApproval, (_event, response: WriteApprovalResponse) =>
    agent.respondToApproval(writeApprovalResponseSchema.parse(response)))
  ipcMain.handle(IPC.agentRevokeApprovals, (_event, chatId: string) =>
    agent.revokeApprovals(z.string().min(1).max(200).parse(chatId)))
  ipcMain.handle(IPC.settingsProviders, () => settings.getSnapshot())
  ipcMain.handle(IPC.settingsSaveProvider, (_event, input: ProviderInput) =>
    settings.saveProvider(providerInputSchema.parse(input)))
  ipcMain.handle(IPC.settingsDeleteProvider, (_event, providerId: string) =>
    settings.deleteProvider(z.string().parse(providerId)))
  ipcMain.handle(IPC.settingsSetActiveModel, (_event, selection: ModelSelection) =>
    settings.setActiveModel(modelSelectionSchema.parse(selection)))
  ipcMain.handle(IPC.settingsFetchModels, (_event, input: FetchProviderModelsInput) =>
    modelCatalog.fetchModels(fetchProviderModelsSchema.parse(input)))

  return () => {
    agent.abortAll()
    for (const channel of [IPC.workspaceManageChat, IPC.workspaceRetrySave, IPC.workspaceSnapshot, IPC.workspacePick, IPC.workspaceCreateChat, IPC.workspaceGetChat, IPC.workspacePreferences, IPC.workspaceFilesList, IPC.workspaceFilesRead]) ipcMain.removeHandler(channel)
    ipcMain.removeHandler(IPC.appVersion)
    ipcMain.removeHandler(IPC.agentStart)
    ipcMain.removeHandler(IPC.agentAbort)
    ipcMain.removeHandler(IPC.agentRespondToApproval)
    ipcMain.removeHandler(IPC.agentRevokeApprovals)
    ipcMain.removeHandler(IPC.settingsProviders)
    ipcMain.removeHandler(IPC.settingsSaveProvider)
    ipcMain.removeHandler(IPC.settingsDeleteProvider)
    ipcMain.removeHandler(IPC.settingsSetActiveModel)
    ipcMain.removeHandler(IPC.settingsFetchModels)
  }
}
