import type { ReactNode } from 'react'
import type { PanelLayoutState } from '@/lib/panels/layout'
import type { PanelRuntimeData } from '@/lib/panels/panelData'
import type { PanelContext, PanelRegistry } from '@/lib/panels/registry'
import { PanelHost } from './PanelHost'
import { PanelTabStrip, panelTabId, panelViewId, type PanelTabItem } from './PanelTabStrip'

export function PanelDock({ layout, registry, context, data, onActivate, onClose, picker }: {
  layout: PanelLayoutState
  registry: PanelRegistry
  context: PanelContext
  data: PanelRuntimeData
  onActivate: (instanceId: string) => void
  onClose: (instanceId: string) => void
  picker?: ReactNode
}) {
  if (!layout.visible || layout.open.length === 0) return null

  const tabs = layout.open.flatMap(instance => {
    const descriptor = registry.get(instance.panelId)
    return descriptor ? [{ instance, descriptor }] : []
  }) satisfies PanelTabItem[]
  if (!tabs.length) return null

  // Layout state is persisted input: an active id that no longer resolves must not blank the dock.
  const activeInstanceId = tabs.some(tab => tab.instance.instanceId === layout.activeInstanceId)
    ? layout.activeInstanceId
    : tabs[0].instance.instanceId

  return <aside className="panel-dock" data-dock="open">
    <PanelTabStrip activeInstanceId={activeInstanceId} onActivate={onActivate} onClose={onClose} picker={picker} tabs={tabs} />
    <div className="panel-host">
      {tabs.map(tab => {
        const active = tab.instance.instanceId === activeInstanceId
        return <div
          aria-labelledby={panelTabId(tab.instance.instanceId)}
          className="panel-host-view"
          data-active={active}
          id={panelViewId(tab.instance.instanceId)}
          key={tab.instance.instanceId}
          role="tabpanel"
        >
          <PanelHost
            context={context}
            data={data}
            descriptor={tab.descriptor}
            instanceId={tab.instance.instanceId}
            panelId={tab.instance.panelId}
            scopeId={tab.instance.scopeId}
          />
        </div>
      })}
    </div>
  </aside>
}
