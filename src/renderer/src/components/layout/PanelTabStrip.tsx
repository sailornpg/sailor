import { useEffect, useRef, type KeyboardEvent, type ReactNode } from 'react'
import { X } from 'lucide-react'
import type { PanelInstance } from '@/lib/panels/layout'
import type { PanelDescriptor } from '@/lib/panels/registry'

export interface PanelTabItem {
  instance: PanelInstance
  descriptor: PanelDescriptor
}

export function panelTabId(instanceId: string): string {
  return `panel-tab-${instanceId}`
}

export function panelViewId(instanceId: string): string {
  return `panel-view-${instanceId}`
}

export function PanelTabStrip({ tabs, activeInstanceId, onActivate, onClose, picker }: {
  tabs: readonly PanelTabItem[]
  activeInstanceId: string | null
  onActivate: (instanceId: string) => void
  onClose: (instanceId: string) => void
  picker?: ReactNode
}) {
  const buttons = useRef(new Map<string, HTMLButtonElement>())
  const focusAfterClose = useRef(false)

  useEffect(() => {
    if (!focusAfterClose.current) return
    focusAfterClose.current = false
    if (activeInstanceId) buttons.current.get(activeInstanceId)?.focus()
  }, [activeInstanceId, tabs])

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (!tabs.length) return
    const ids = tabs.map(tab => tab.instance.instanceId)
    const index = Math.max(0, ids.indexOf(activeInstanceId ?? ''))
    let target: string | undefined
    if (event.key === 'ArrowRight') target = ids[(index + 1) % ids.length]
    else if (event.key === 'ArrowLeft') target = ids[(index - 1 + ids.length) % ids.length]
    else if (event.key === 'Home') target = ids[0]
    else if (event.key === 'End') target = ids[ids.length - 1]
    if (!target) return
    event.preventDefault()
    onActivate(target)
    buttons.current.get(target)?.focus()
  }

  const closeTab = (instanceId: string) => {
    focusAfterClose.current = true
    onClose(instanceId)
  }

    // The top band doubles as the window drag region, so it needs no separate empty strip above it.
  return <div aria-label="面板" className="panel-tabstrip window-drag" onKeyDown={handleKeyDown} role="tablist">
    <div className="panel-tabstrip-tabs no-drag">
      {tabs.map(tab => {
        const instanceId = tab.instance.instanceId
        const selected = instanceId === activeInstanceId
        const Icon = tab.descriptor.icon
        return <div className="panel-tab" data-active={selected} key={instanceId} role="presentation">
          <button
            aria-controls={panelViewId(instanceId)}
            aria-selected={selected}
            className="panel-tab-trigger no-drag"
            id={panelTabId(instanceId)}
            onClick={() => onActivate(instanceId)}
            onKeyDown={event => {
              if (event.key !== 'Delete' && event.key !== 'Backspace') return
              event.preventDefault()
              closeTab(instanceId)
            }}
            ref={node => {
              if (node) buttons.current.set(instanceId, node)
              else buttons.current.delete(instanceId)
            }}
            role="tab"
            tabIndex={selected ? 0 : -1}
            type="button"
          >
            <Icon size={14} />
            <span className="panel-tab-title">{tab.descriptor.title}</span>
          </button>
          <button aria-label={`关闭${tab.descriptor.title}面板`} className="panel-tab-close" onClick={() => closeTab(instanceId)} tabIndex={-1} type="button"><X size={12} /></button>
        </div>
      })}
    </div>
    <div className="panel-tabstrip-actions no-drag">{picker}</div>
  </div>
}
