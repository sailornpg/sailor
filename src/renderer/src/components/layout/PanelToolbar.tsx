import { PanelRight, PanelRightClose } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import type { PanelContext, PanelRegistry } from '@/lib/panels/registry'
import type { PanelPlatform } from '@/lib/panels/shortcuts'
import { PanelPickerMenu } from './PanelPickerMenu'

export function PanelToolbar({ registry, context, platform, visible, onPick, onToggle }: {
  registry: PanelRegistry
  context: PanelContext
  platform: PanelPlatform
  visible: boolean
  onPick: (panelId: string) => void
  onToggle: () => void
}) {
  const toggleLabel = visible ? '隐藏面板' : '显示面板'
  return <>
    <PanelPickerMenu
      context={context}
      onPick={onPick}
      platform={platform}
      registry={registry}
      trigger={<Button aria-label="打开面板" className="icon-button" size="icon" type="button" variant="ghost"><PanelRight size={17} /></Button>}
    />
    <Tooltip>
      <TooltipTrigger asChild>
        <Button aria-label={toggleLabel} className="icon-button" onClick={onToggle} size="icon" type="button" variant="ghost">
          {visible ? <PanelRightClose size={17} /> : <PanelRight size={17} />}
        </Button>
      </TooltipTrigger>
      <TooltipContent>{toggleLabel}</TooltipContent>
    </Tooltip>
  </>
}
