import type { ReactNode } from 'react'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import type { PanelContext, PanelRegistry } from '@/lib/panels/registry'
import { formatShortcut, type PanelPlatform } from '@/lib/panels/shortcuts'

export function PanelPickerMenu({ registry, context, onPick, trigger, platform, open, onOpenChange }: {
  registry: PanelRegistry
  context: PanelContext
  onPick: (panelId: string) => void
  trigger: ReactNode
  platform: PanelPlatform
  open?: boolean
  onOpenChange?: (open: boolean) => void
}) {
  return <DropdownMenu onOpenChange={onOpenChange} open={open}>
    <DropdownMenuTrigger asChild>{trigger}</DropdownMenuTrigger>
    <DropdownMenuContent align="end" className="panel-picker" sideOffset={6}>
      <DropdownMenuLabel className="panel-picker-heading">面板</DropdownMenuLabel>
      <DropdownMenuSeparator />
      {registry.resolve(context).map(entry => {
        const Icon = entry.descriptor.icon
        return <DropdownMenuItem
          className="panel-picker-item"
          disabled={!entry.available}
          key={entry.descriptor.id}
          onSelect={() => onPick(entry.descriptor.id)}
        >
          <Icon size={15} />
          <span className="panel-picker-text">
            <span className="panel-picker-title">{entry.descriptor.title}</span>
            {entry.reason && <span className="panel-picker-reason">{entry.reason}</span>}
          </span>
          <DropdownMenuShortcut>{formatShortcut(entry.descriptor.shortcut, platform)}</DropdownMenuShortcut>
        </DropdownMenuItem>
      })}
    </DropdownMenuContent>
  </DropdownMenu>
}
