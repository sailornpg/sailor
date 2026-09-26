import { field } from '@/components/assistant-ui/elements/surfaces'
import { ScrollArea } from '@/components/ui/scroll-area'
import {
  Collapsible,
  CollapsibleTrigger,
  CollapsibleContent,
} from '@/components/assistant-ui/elements/collapsible'
import type { FormEventHandler } from 'react'
import type { ModelConfig, ProviderProtocol, ProviderSummary } from '@shared/contracts'
import {
  Check,
  ChevronDown,
  ChevronRight,
  Eye,
  KeyRound,
  Plus,
  RefreshCw,
  Search,
  Server,
  Trash2,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { parseOptionalInteger, type ProviderForm } from './providerForm'

interface ModelSettingsPanelProps {
  catalogMessage: string | null
  configuredModels: ModelConfig[]
  editingId: string | null
  error: string | null
  expandedModelId: string | null
  fetchingModels: boolean
  form: ProviderForm
  modelQuery: string
  onEditProvider: (provider: ProviderSummary) => void
  onExpandedModelChange: (modelId: string | null) => void
  onFetchModels: () => void
  onFormChange: (form: ProviderForm) => void
  onModelQueryChange: (query: string) => void
  onRemoveModel: (modelId: string) => void
  onRemoveProvider: () => void
  onStartCustomProvider: () => void
  onSubmit: FormEventHandler<HTMLFormElement>
  onUpdateModel: (modelId: string, update: Partial<ModelConfig>) => void
  providers: ProviderSummary[]
  saving: boolean
  selectedProvider?: ProviderSummary
}

export function ModelSettingsPanel({
  catalogMessage,
  configuredModels,
  editingId,
  error,
  expandedModelId,
  fetchingModels,
  form,
  modelQuery,
  onEditProvider,
  onExpandedModelChange,
  onFetchModels,
  onFormChange,
  onModelQueryChange,
  onRemoveModel,
  onRemoveProvider,
  onStartCustomProvider,
  onSubmit,
  onUpdateModel,
  providers,
  saving,
  selectedProvider,
}: ModelSettingsPanelProps) {
  return (
    <div className="model-settings">
      <ScrollArea className="flex-1 min-h-0">
        <div className="settings-content">
          <div className="settings-heading">
            <div>
              <h2>模型</h2>
              <p>配置模型提供商，并在任务输入区选择要使用的模型。</p>
            </div>
          </div>

          <div className="provider-list" aria-label="已配置的提供商">
            {providers.map((provider) => (
              <Button
                variant="ghost"
                className={provider.id === editingId ? 'provider-row active' : 'provider-row'}
                aria-pressed={provider.id === editingId}
                key={provider.id}
                onClick={() => onEditProvider(provider)}
                type="button"
              >
                <span className="provider-icon">
                  <Server size={16} />
                </span>
                <span className="provider-summary">
                  <strong>{provider.name}</strong>
                  <small>
                    {provider.kind === 'builtin' ? '内置' : '自定义'} · {provider.models.length}{' '}
                    个模型
                  </small>
                </span>
                <span className={provider.hasApiKey ? 'provider-status ready' : 'provider-status'}>
                  {provider.hasApiKey ? <Check size={13} /> : <KeyRound size={13} />}
                  {provider.hasApiKey ? '已就绪' : '添加密钥'}
                </span>
              </Button>
            ))}
            <Button
              variant="ghost"
              className="add-provider-row"
              onClick={onStartCustomProvider}
              type="button"
            >
              <Plus size={16} />
              添加自定义提供商
            </Button>
          </div>

          <form id="provider-settings-form" className="provider-form" onSubmit={onSubmit}>
            <div className="provider-form-heading">
              <div>
                <h3>
                  {editingId === 'new'
                    ? '自定义提供商'
                    : `编辑 ${selectedProvider?.name ?? '提供商'}`}
                </h3>
                <p>支持 OpenAI Completions、Responses 或 Anthropic Messages 接口。</p>
              </div>
              {selectedProvider?.kind === 'custom' && (
                <Button
                  className="text-destructive"
                  onClick={onRemoveProvider}
                  size="sm"
                  type="button"
                  variant="ghost"
                >
                  <Trash2 /> 删除
                </Button>
              )}
            </div>

            <div className="settings-field-grid">
              <label>
                <span>提供商 ID</span>
                <Input
                  disabled={editingId !== 'new'}
                  onChange={(event) => onFormChange({ ...form, id: event.target.value })}
                  placeholder="acme-gateway"
                  value={form.id}
                />
              </label>
              <label>
                <span>显示名称</span>
                <Input
                  onChange={(event) => onFormChange({ ...form, name: event.target.value })}
                  placeholder="示例模型服务"
                  value={form.name}
                />
              </label>
            </div>

            <label>
              <span>API 地址</span>
              <Input
                onChange={(event) => onFormChange({ ...form, baseUrl: event.target.value })}
                placeholder="https://gateway.example/v1"
                type="url"
                value={form.baseUrl}
              />
            </label>

            <div className="settings-field-grid">
              <label>
                <span>API 协议</span>
                <Select
                  onValueChange={(protocol: ProviderProtocol) =>
                    onFormChange({ ...form, protocol })
                  }
                  value={form.protocol}
                >
                  <SelectTrigger className="settings-select">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="openai-completions">
                      OpenAI Completions（兼容接口）
                    </SelectItem>
                    <SelectItem value="openai-responses">OpenAI Responses（官方接口）</SelectItem>
                    <SelectItem value="anthropic-messages">Anthropic Messages</SelectItem>
                  </SelectContent>
                </Select>
              </label>
              <label>
                <span>API 密钥</span>
                <Input
                  autoComplete="off"
                  onChange={(event) => onFormChange({ ...form, apiKey: event.target.value })}
                  placeholder={
                    selectedProvider?.hasApiKey ? '已保存，留空则继续使用' : '输入 API 密钥'
                  }
                  type="password"
                  value={form.apiKey}
                />
              </label>
            </div>

            <section className="model-catalog">
              <div className="model-catalog-heading">
                <div>
                  <h4>模型目录</h4>
                  <p>已选择 {form.models.length} 个模型</p>
                </div>
                <Button
                  disabled={fetchingModels || !form.baseUrl.trim()}
                  onClick={onFetchModels}
                  size="sm"
                  type="button"
                  variant="outline"
                >
                  <RefreshCw className={fetchingModels ? 'spin' : ''} />
                  {fetchingModels ? '正在获取' : '获取可用模型'}
                </Button>
              </div>

              <div className="model-search">
                <Search size={16} />
                <Input
                  className={field}
                  aria-label="搜索模型"
                  onChange={(event) => onModelQueryChange(event.target.value)}
                  placeholder="搜索模型"
                  value={modelQuery}
                />
              </div>

              {catalogMessage && (
                <div role="status" className="catalog-message">
                  {catalogMessage}
                </div>
              )}

              <div className="configured-model-list">
                {configuredModels.map((model) => (
                  <ConfiguredModel
                    expanded={expandedModelId === model.id}
                    key={model.id}
                    model={model}
                    onExpandedChange={onExpandedModelChange}
                    onRemove={onRemoveModel}
                    onUpdate={onUpdateModel}
                  />
                ))}
                {configuredModels.length === 0 && (
                  <div className="model-catalog-empty">
                    {modelQuery.trim()
                      ? '没有匹配的已选模型。'
                      : '请先获取可用模型，再将需要的模型加入目录。'}
                  </div>
                )}
              </div>
            </section>
          </form>
        </div>
      </ScrollArea>
      <div className="provider-form-actions">
        {error && (
          <div role="alert" className="settings-error">
            {error}
          </div>
        )}
        <span>密钥加密保存在本机</span>
        <Button disabled={saving} form="provider-settings-form" type="submit">
          {saving ? '正在保存…' : editingId === 'new' ? '创建提供商' : '保存更改'}
        </Button>
      </div>
    </div>
  )
}

function ConfiguredModel({
  expanded,
  model,
  onExpandedChange,
  onRemove,
  onUpdate,
}: {
  expanded: boolean
  model: ModelConfig
  onExpandedChange: (modelId: string | null) => void
  onRemove: (modelId: string) => void
  onUpdate: (modelId: string, update: Partial<ModelConfig>) => void
}) {
  return (
    <Collapsible
      className="configured-model"
      open={expanded}
      onOpenChange={(open) => onExpandedChange(open ? model.id : null)}
    >
      <div className="configured-model-summary">
        <div className="model-id-block">
          <span>模型 ID</span>
          <code title={model.id}>{model.id}</code>
        </div>
        <label className="model-name-field">
          <span>显示名称</span>
          <Input
            onChange={(event) => onUpdate(model.id, { name: event.target.value })}
            value={model.name}
          />
        </label>
        <label className="vision-toggle">
          <input
            checked={model.vision}
            onChange={(event) => onUpdate(model.id, { vision: event.target.checked })}
            type="checkbox"
          />
          <Eye size={15} />
          视觉
        </label>
        <CollapsibleTrigger asChild>
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label={expanded ? '收起模型配置' : '展开模型配置'}
            aria-expanded={expanded}
            className="expand-model-button"
            type="button"
          >
            {expanded ? <ChevronDown /> : <ChevronRight />}
          </Button>
        </CollapsibleTrigger>
      </div>

      <CollapsibleContent className="model-capabilities">
        <div className="settings-field-grid">
          <label>
            <span>上下文窗口</span>
            <Input
              min={1}
              onChange={(event) =>
                onUpdate(model.id, {
                  contextWindow: parseOptionalInteger(event.target.value),
                })
              }
              placeholder="例如：128000"
              type="number"
              value={model.contextWindow ?? ''}
            />
          </label>
          <label>
            <span>最大输出 token</span>
            <Input
              min={1}
              onChange={(event) =>
                onUpdate(model.id, {
                  maxOutputTokens: parseOptionalInteger(event.target.value),
                })
              }
              placeholder="例如：8192"
              type="number"
              value={model.maxOutputTokens ?? ''}
            />
          </label>
        </div>
      </CollapsibleContent>

      <Button
        variant="ghost"
        size="icon-sm"
        aria-label={`删除模型 ${model.id}`}
        className="remove-model-button"
        onClick={() => onRemove(model.id)}
        type="button"
      >
        <Trash2 />
      </Button>
    </Collapsible>
  )
}
