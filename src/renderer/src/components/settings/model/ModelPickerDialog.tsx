import { Input } from '@/components/ui/input'
import { field } from '@/components/assistant-ui/elements/surfaces'
import { Search } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'

interface ModelPickerDialogProps {
  allVisibleSelected: boolean
  onAdd: () => void
  onOpenChange: (open: boolean) => void
  onQueryChange: (query: string) => void
  onToggleAll: () => void
  onToggleModel: (modelId: string) => void
  open: boolean
  query: string
  selectableModels: string[]
  selectedModelIds: string[]
}

export function ModelPickerDialog({
  allVisibleSelected,
  onAdd,
  onOpenChange,
  onQueryChange,
  onToggleAll,
  onToggleModel,
  open,
  query,
  selectableModels,
  selectedModelIds,
}: ModelPickerDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="model-picker-dialog" showCloseButton>
        <DialogHeader>
          <DialogTitle>选择要添加的模型</DialogTitle>
          <DialogDescription>
            以下是模型提供商的可用模型，勾选要添加的模型。
          </DialogDescription>
        </DialogHeader>

        <div className="model-picker-toolbar">
          <div className="model-picker-search">
            <Search size={16} />
            <Input
              className={field}
              aria-label="搜索可用模型"
              autoFocus
              onChange={(event) => onQueryChange(event.target.value)}
              placeholder="搜索模型"
              value={query}
            />
          </div>
          <Button
            disabled={selectableModels.length === 0}
            onClick={onToggleAll}
            size="sm"
            type="button"
            variant="ghost"
          >
            {allVisibleSelected ? '取消全选' : '全选'}
          </Button>
        </div>

        <div className="model-picker-list" aria-label="提供商可用模型">
          {selectableModels.map((modelId) => (
            <label className="model-picker-option" key={modelId}>
              <input
                checked={selectedModelIds.includes(modelId)}
                onChange={() => onToggleModel(modelId)}
                type="checkbox"
              />
              <code>{modelId}</code>
            </label>
          ))}
          {selectableModels.length === 0 && (
            <div className="model-picker-empty">
              {query.trim() ? '没有匹配的可用模型。' : '当前没有可添加的新模型。'}
            </div>
          )}
        </div>

        <DialogFooter className="model-picker-footer">
          <span>{selectedModelIds.length > 0 ? `已选择 ${selectedModelIds.length} 个模型` : '尚未选择模型'}</span>
          <div>
            <Button onClick={() => onOpenChange(false)} type="button" variant="outline">
              取消
            </Button>
            <Button disabled={selectedModelIds.length === 0} onClick={onAdd} type="button">
              添加所选{selectedModelIds.length > 0 ? `（${selectedModelIds.length}）` : ''}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
