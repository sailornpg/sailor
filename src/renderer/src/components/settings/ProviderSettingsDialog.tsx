import { Button } from '@/components/ui/button'
import { useEffect, useMemo, useState, useSyncExternalStore, type FormEvent } from 'react'
import { IPC, type ModelConfig, type ProviderInput, type ProviderSummary, type SettingsSnapshot } from '@shared/contracts'
import { Database, Palette } from 'lucide-react'
import { AppearanceSettingsPanel } from '@/components/settings/appearance/AppearanceSettingsPanel'
import { ModelPickerDialog } from '@/components/settings/model/ModelPickerDialog'
import { ModelSettingsPanel } from '@/components/settings/model/ModelSettingsPanel'
import {
  createProviderForm,
  createProviderFormFromSummary,
  type ProviderForm,
} from '@/components/settings/model/providerForm'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { getBrowserAppearanceRuntime } from '@/lib/appearanceRuntime'
import type { AppearancePreferences } from '@/lib/appearancePreferences'
import {
  appendSelectedModels,
  filterSelectableModelIds,
  toggleAllVisibleModelIds,
  toggleSelectedModelId,
} from '@/lib/modelCatalogSelection'

interface ProviderSettingsDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  settings: SettingsSnapshot
  onChange: (settings: SettingsSnapshot) => void
}

export function ProviderSettingsDialog({
  open,
  onOpenChange,
  settings,
  onChange,
}: ProviderSettingsDialogProps) {
  const appearanceRuntime = getBrowserAppearanceRuntime()
  const appearance = useSyncExternalStore(
    appearanceRuntime.subscribe,
    appearanceRuntime.getPreferences,
    appearanceRuntime.getPreferences,
  )
  const [activeSection, setActiveSection] = useState<'models' | 'appearance'>('models')
  const [appearanceMessage, setAppearanceMessage] = useState<string | null>(null)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [form, setForm] = useState<ProviderForm>(createProviderForm)
  const [availableModels, setAvailableModels] = useState<string[]>([])
  const [modelQuery, setModelQuery] = useState('')
  const [modelPickerOpen, setModelPickerOpen] = useState(false)
  const [pickerQuery, setPickerQuery] = useState('')
  const [selectedModelIds, setSelectedModelIds] = useState<string[]>([])
  const [expandedModelId, setExpandedModelId] = useState<string | null>(null)
  const [catalogMessage, setCatalogMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [fetchingModels, setFetchingModels] = useState(false)

  useEffect(() => {
    if (!open || editingId) return
    const firstProvider = settings.providers[0]
    if (firstProvider) editProvider(firstProvider)
  }, [open, settings.providers, editingId])

  const resetModelPicker = () => {
    setAvailableModels([])
    setModelQuery('')
    setModelPickerOpen(false)
    setPickerQuery('')
    setSelectedModelIds([])
    setExpandedModelId(null)
    setCatalogMessage(null)
    setError(null)
  }

  const editProvider = (provider: ProviderSummary) => {
    setEditingId(provider.id)
    setForm(createProviderFormFromSummary(provider))
    resetModelPicker()
  }

  const startCustomProvider = () => {
    setEditingId('new')
    setForm(createProviderForm())
    resetModelPicker()
  }

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    setSaving(true)
    setError(null)
    const input: ProviderInput = {
      ...form,
      id: form.id.trim(),
      name: form.name.trim(),
      baseUrl: form.baseUrl.trim(),
      apiKey: form.apiKey,
    }

    try {
      const next = await window.sailor.settings.saveProvider(input)
      onChange(next)
      const savedProvider = next.providers.find(({ id }) => id === input.id)
      if (savedProvider) editProvider(savedProvider)
      setCatalogMessage('提供商设置已保存。')
    } catch (nextError) {
      setError(settingsErrorMessage(nextError, '无法保存此提供商。'))
    } finally {
      setSaving(false)
    }
  }

  const fetchModels = async () => {
    setFetchingModels(true)
    setError(null)
    setCatalogMessage(null)
    try {
      const models = await window.sailor.settings.fetchModels({
        providerId: form.id.trim(),
        baseUrl: form.baseUrl.trim(),
        apiKey: form.apiKey,
      })
      setAvailableModels(models)
      setCatalogMessage(`已获取 ${models.length} 个可用模型。`)
      setPickerQuery('')
      setSelectedModelIds([])
      setModelPickerOpen(true)
    } catch (nextError) {
      setError(settingsErrorMessage(nextError, '无法获取模型目录。'))
    } finally {
      setFetchingModels(false)
    }
  }

  const removeProvider = async () => {
    if (!editingId || editingId === 'new') return
    try {
      const next = await window.sailor.settings.deleteProvider(editingId)
      onChange(next)
      const firstProvider = next.providers[0]
      if (firstProvider) editProvider(firstProvider)
      else startCustomProvider()
    } catch (nextError) {
      setError(settingsErrorMessage(nextError, '无法删除此提供商。'))
    }
  }

  const addSelectedModels = () => {
    if (selectedModelIds.length === 0) return
    setForm((current) => ({
      ...current,
      models: appendSelectedModels(current.models, selectedModelIds),
    }))
    setExpandedModelId(selectedModelIds.at(-1) ?? null)
    setCatalogMessage(`已添加 ${selectedModelIds.length} 个模型，保存后生效。`)
    setModelPickerOpen(false)
    setPickerQuery('')
    setSelectedModelIds([])
  }

  const removeModel = (modelId: string) => {
    setForm((current) => ({
      ...current,
      models: current.models.filter(({ id }) => id !== modelId),
    }))
    if (expandedModelId === modelId) setExpandedModelId(null)
  }

  const updateModel = (modelId: string, update: Partial<ModelConfig>) => {
    setForm((current) => ({
      ...current,
      models: current.models.map((model) =>
        model.id === modelId ? { ...model, ...update } : model),
    }))
  }

  const normalizedQuery = modelQuery.trim().toLocaleLowerCase()
  const configuredModels = useMemo(() => form.models.filter((model) =>
    !normalizedQuery || `${model.id} ${model.name}`.toLocaleLowerCase().includes(normalizedQuery)),
  [form.models, normalizedQuery])
  const selectableModels = useMemo(() => filterSelectableModelIds(
    availableModels,
    form.models.map(({ id }) => id),
    pickerQuery,
  ), [availableModels, form.models, pickerQuery])
  const allVisibleSelected = selectableModels.length > 0 &&
    selectableModels.every((id) => selectedModelIds.includes(id))
  const selectedProvider = settings.providers.find(({ id }) => id === editingId)

  const updateAppearance = (next: AppearancePreferences) => {
    const persisted = appearanceRuntime.setPreferences(next)
    setAppearanceMessage(persisted ? null : '外观已应用，但无法保存到本机。')
  }

  const changeModelPickerOpen = (nextOpen: boolean) => {
    setModelPickerOpen(nextOpen)
    if (!nextOpen) {
      setPickerQuery('')
      setSelectedModelIds([])
    }
  }

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="settings-dialog" showCloseButton>
          <aside className="settings-nav">
            <DialogHeader>
              <DialogTitle>设置</DialogTitle>
              <DialogDescription>应用偏好设置</DialogDescription>
            </DialogHeader>
            <nav className="settings-nav-list" aria-label="设置分类">
              <Button variant="ghost"
                aria-current={activeSection === 'models' ? 'page' : undefined}
                className={activeSection === 'models' ? 'settings-nav-item active' : 'settings-nav-item'}
                onClick={() => setActiveSection('models')}
                type="button"
              >
                <Database size={16} />
                模型
              </Button>
              <Button variant="ghost"
                aria-current={activeSection === 'appearance' ? 'page' : undefined}
                className={activeSection === 'appearance' ? 'settings-nav-item active' : 'settings-nav-item'}
                onClick={() => setActiveSection('appearance')}
                type="button"
              >
                <Palette size={16} />
                外观
              </Button>
            </nav>
          </aside>

          <section className="settings-main">
            {activeSection === 'models' ? (
              <ModelSettingsPanel
                catalogMessage={catalogMessage}
                configuredModels={configuredModels}
                editingId={editingId}
                error={error}
                expandedModelId={expandedModelId}
                fetchingModels={fetchingModels}
                form={form}
                modelQuery={modelQuery}
                onEditProvider={editProvider}
                onExpandedModelChange={setExpandedModelId}
                onFetchModels={() => void fetchModels()}
                onFormChange={setForm}
                onModelQueryChange={setModelQuery}
                onRemoveModel={removeModel}
                onRemoveProvider={() => void removeProvider()}
                onStartCustomProvider={startCustomProvider}
                onSubmit={(event) => void submit(event)}
                onUpdateModel={updateModel}
                providers={settings.providers}
                saving={saving}
                selectedProvider={selectedProvider}
              />
            ) : (
              <AppearanceSettingsPanel
                message={appearanceMessage}
                onChange={updateAppearance}
                onReset={() => {
                  const persisted = appearanceRuntime.reset()
                  setAppearanceMessage(persisted ? '已恢复默认外观。' : '外观已恢复默认，但无法保存到本机。')
                }}
                preferences={appearance}
              />
            )}
          </section>
        </DialogContent>
      </Dialog>

      <ModelPickerDialog
        allVisibleSelected={allVisibleSelected}
        onAdd={addSelectedModels}
        onOpenChange={changeModelPickerOpen}
        onQueryChange={setPickerQuery}
        onToggleAll={() => setSelectedModelIds((current) =>
          toggleAllVisibleModelIds(current, selectableModels))}
        onToggleModel={(modelId) => setSelectedModelIds((current) =>
          toggleSelectedModelId(current, modelId))}
        open={modelPickerOpen}
        query={pickerQuery}
        selectableModels={selectableModels}
        selectedModelIds={selectedModelIds}
      />
    </>
  )
}

function settingsErrorMessage(error: unknown, fallback: string): string {
  if (!(error instanceof Error)) return fallback
  // Electron wraps invoke failures with an internal channel name.
  for (const channel of [IPC.settingsSaveProvider, IPC.settingsFetchModels, IPC.settingsDeleteProvider]) {
    const prefix = `Error invoking remote method '${channel}': Error: `
    if (error.message.startsWith(prefix)) return error.message.slice(prefix.length) || fallback
  }
  return error.message || fallback
}
