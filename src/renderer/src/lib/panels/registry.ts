import type { ComponentType } from 'react'
import type { PanelRuntimeData } from './panelData'
import { shortcutSignature, type PanelShortcut, type PanelShortcutCandidate } from './shortcuts'

export type PanelScope = 'chat' | 'project' | 'global'
export type PanelMultiplicity = 'single' | 'multi'

export interface PanelContext {
  chatId: string | null
  projectId: string | null
}

export type PanelAvailability = { available: true } | { available: false; reason: string }

export interface PanelProps {
  instanceId: string
  panelId: string
  scopeId: string
  context: PanelContext
  data: PanelRuntimeData
}

export interface PanelDescriptor {
  id: string
  title: string
  icon: ComponentType<{ size?: number | string; className?: string }>
  shortcut: PanelShortcut
  /** Which context the panel binds to; this is the only axis of context rebinding. */
  scope: PanelScope
  multiplicity: PanelMultiplicity
  availability(context: PanelContext): PanelAvailability
  load(): Promise<{ default: ComponentType<PanelProps> }>
}

export interface ResolvedPanel {
  descriptor: PanelDescriptor
  scopeId: string
  available: boolean
  reason: string | null
}

export interface PanelRegistry {
  all(): readonly PanelDescriptor[]
  get(panelId: string): PanelDescriptor | undefined
  isKnown(panelId: string): boolean
  resolve(context: PanelContext): ResolvedPanel[]
  find(panelId: string, context: PanelContext): ResolvedPanel | undefined
  shortcutCandidates(context: PanelContext): PanelShortcutCandidate[]
}

export function panelScopeId(descriptor: Pick<PanelDescriptor, 'scope'>, context: PanelContext): string {
  if (descriptor.scope === 'chat') return context.chatId ?? ''
  if (descriptor.scope === 'project') return context.projectId ?? ''
  return ''
}

export function resolvePanel(descriptor: PanelDescriptor, context: PanelContext): ResolvedPanel {
  const availability = descriptor.availability(context)
  return {
    descriptor,
    scopeId: panelScopeId(descriptor, context),
    available: availability.available,
    reason: availability.available ? null : availability.reason,
  }
}

export function createPanelRegistry(descriptors: readonly PanelDescriptor[]): PanelRegistry {
  const byId = new Map(descriptors.map(descriptor => [descriptor.id, descriptor]))
  const resolve = (context: PanelContext) => descriptors.map(descriptor => resolvePanel(descriptor, context))
  return {
    all: () => descriptors,
    get: panelId => byId.get(panelId),
    isKnown: panelId => byId.has(panelId),
    resolve,
    find: (panelId, context) => {
      const descriptor = byId.get(panelId)
      return descriptor ? resolvePanel(descriptor, context) : undefined
    },
    shortcutCandidates: context => resolve(context).map(entry => ({
      id: entry.descriptor.id,
      shortcut: entry.descriptor.shortcut,
      available: entry.available,
    })),
  }
}

/** Registration-time invariants. Returns human-readable problems; empty means the set is usable. */
export function validatePanelDescriptors(descriptors: readonly PanelDescriptor[]): string[] {
  const problems: string[] = []
  const ids = new Set<string>()
  const shortcuts = new Map<string, string>()
  for (const descriptor of descriptors) {
    if (!descriptor.id) problems.push('panel descriptor without id')
    if (!descriptor.title) problems.push(`${descriptor.id}: empty title`)
    if (ids.has(descriptor.id)) problems.push(`duplicate panel id: ${descriptor.id}`)
    ids.add(descriptor.id)
    const signature = shortcutSignature(descriptor.shortcut)
    const owner = shortcuts.get(signature)
    if (owner) problems.push(`duplicate shortcut ${signature}: ${owner} and ${descriptor.id}`)
    shortcuts.set(signature, descriptor.id)
  }
  return problems
}
