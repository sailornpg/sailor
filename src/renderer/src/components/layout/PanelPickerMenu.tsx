import { useEffect, useRef, useState, type ReactNode } from 'react'
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
import { PICKER_GAP, pickerSideOffset } from '@/lib/panels/browserSurface'
import { formatShortcut, type PanelPlatform } from '@/lib/panels/shortcuts'

export function PanelPickerMenu({
  registry,
  context,
  onPick,
  trigger,
  platform,
  open,
  onOpenChange,
}: {
  registry: PanelRegistry
  context: PanelContext
  onPick: (panelId: string) => void
  trigger: ReactNode
  platform: PanelPlatform
  open?: boolean
  onOpenChange?: (open: boolean) => void
}) {
  const triggerRef = useRef<HTMLButtonElement | null>(null)
  const [sideOffset, setSideOffset] = useState(PICKER_GAP)

  // dock 的内容区被原生 WebContentsView 占着：菜单压上去就得把视图摘掉，浏览器页面会整块消失。
  // 所以把菜单摆到 dock 左侧的对话区上空（普通 DOM），页面全程可见。偏移随 dock 宽度变化。
  useEffect(() => {
    const trigger = triggerRef.current
    const dock = trigger?.closest('.panel-dock') ?? null
    if (trigger === null || dock === null) return
    const measure = () =>
      setSideOffset(pickerSideOffset(trigger.getBoundingClientRect(), dock.getBoundingClientRect()))
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(dock)
    return () => observer.disconnect()
  }, [])

  return (
    <DropdownMenu onOpenChange={onOpenChange} open={open}>
      <DropdownMenuTrigger asChild ref={triggerRef}>
        {trigger}
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="start"
        className="panel-picker"
        side="left"
        sideOffset={sideOffset}
      >
        <DropdownMenuLabel className="panel-picker-heading">面板</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {registry.resolve(context).map((entry) => {
          const Icon = entry.descriptor.icon
          return (
            <DropdownMenuItem
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
              <DropdownMenuShortcut>
                {formatShortcut(entry.descriptor.shortcut, platform)}
              </DropdownMenuShortcut>
            </DropdownMenuItem>
          )
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
