import { Plus } from 'lucide-react'
import type { PanelContext, PanelRegistry } from '@/lib/panels/registry'
import type { PanelPlatform } from '@/lib/panels/shortcuts'
import { PanelPickerMenu } from './PanelPickerMenu'

/**
 * The picker is the single entry point for opening panels: the dock tab strip's `+`
 * and the workspace toolbar share this trigger so both stay in sync with the registry.
 */
export function PanelAddButton({ registry, context, platform, onPick, open, onOpenChange }: {
  registry: PanelRegistry
  context: PanelContext
  platform: PanelPlatform
  onPick: (panelId: string) => void
  open?: boolean
  onOpenChange?: (open: boolean) => void
}) {
  return <PanelPickerMenu
    context={context}
    onOpenChange={onOpenChange}
    onPick={onPick}
    open={open}
    platform={platform}
    registry={registry}
    trigger={<button aria-label="添加面板" className="panel-tab-add" type="button"><Plus size={15} /></button>}
  />
}
