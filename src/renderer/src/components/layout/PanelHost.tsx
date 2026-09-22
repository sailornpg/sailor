import { Suspense, lazy, type ComponentType, type LazyExoticComponent } from 'react'
import { Skeleton } from '@/components/assistant-ui/elements/skeleton'
import type { PanelRuntimeData } from '@/lib/panels/panelData'
import type { PanelContext, PanelDescriptor, PanelProps } from '@/lib/panels/registry'

const components = new Map<string, LazyExoticComponent<ComponentType<PanelProps>>>()

function panelComponent(descriptor: PanelDescriptor): LazyExoticComponent<ComponentType<PanelProps>> {
  const cached = components.get(descriptor.id)
  if (cached) return cached
  const created = lazy(descriptor.load)
  components.set(descriptor.id, created)
  return created
}

export function PanelHost({ descriptor, context, data, instanceId, panelId, scopeId }: {
  descriptor: PanelDescriptor
  context: PanelContext
  data: PanelRuntimeData
  instanceId: string
  panelId: string
  scopeId: string
}) {
  const Component = panelComponent(descriptor)
  return <Suspense fallback={<div className="panel-loading"><Skeleton className="h-4 w-40" /><Skeleton className="h-4 w-24" /></div>}>
    <Component context={context} data={data} instanceId={instanceId} panelId={panelId} scopeId={scopeId} />
  </Suspense>
}
