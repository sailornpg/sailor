import { PanelRight, PanelRightClose } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'

/**
 * One toggle for the whole right pane: the dock's own function list is the picker, so a
 * second "open panel" menu here only duplicated the entry point.
 */
export function PanelToolbar({ visible, onToggle }: {
  visible: boolean
  onToggle: () => void
}) {
  const toggleLabel = visible ? '隐藏面板' : '显示面板'
  return <Tooltip>
    <TooltipTrigger asChild>
      <Button aria-label={toggleLabel} aria-pressed={visible} className="icon-button" onClick={onToggle} size="icon" type="button" variant="ghost">
        {visible ? <PanelRightClose size={17} /> : <PanelRight size={17} />}
      </Button>
    </TooltipTrigger>
    <TooltipContent>{toggleLabel}</TooltipContent>
  </Tooltip>
}
