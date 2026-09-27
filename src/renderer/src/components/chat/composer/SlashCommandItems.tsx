import { useEffect, useRef } from 'react'
import { ComposerPrimitive, type Unstable_TriggerItem } from '@assistant-ui/react'
import {
  Bot,
  FileCode2,
  Minimize2,
  MessageCircleQuestion,
  Plus,
  Power,
  RefreshCcw,
  Settings2,
  Sparkles,
  type LucideIcon,
} from 'lucide-react'
import type { ComposerSlashCommand } from '@shared/contracts'
import { cn } from '@/lib/utils'

const slashCommandIcons: Record<string, LucideIcon> = {
  Bot,
  FileCode2,
  Minimize2,
  MessageCircleQuestion,
  Plus,
  Power,
  RefreshCcw,
  Settings2,
  Sparkles,
}

export function SlashCommandIcon({
  command,
  className,
}: {
  command?: ComposerSlashCommand
  className?: string
}) {
  const Icon = slashCommandIcons[command?.icon ?? ''] ?? FileCode2
  return <Icon className={cn('size-4 shrink-0 text-foreground/45', className)} aria-hidden />
}

interface SlashCommandItemsProps {
  items: readonly Unstable_TriggerItem[]
  commandMap: ReadonlyMap<string, ComposerSlashCommand>
  isLoading: boolean
}

export function SlashCommandItems({ items, commandMap, isLoading }: SlashCommandItemsProps) {
  const listRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const list = listRef.current
    if (!list) return

    const scrollHighlightedIntoView = () => {
      list.querySelector<HTMLElement>('[data-highlighted]')?.scrollIntoView({
        block: 'nearest',
      })
    }
    const observer = new MutationObserver((mutations) => {
      if (mutations.some((mutation) => mutation.attributeName === 'data-highlighted'))
        scrollHighlightedIntoView()
    })
    observer.observe(list, {
      attributes: true,
      attributeFilter: ['data-highlighted'],
      subtree: true,
    })
    scrollHighlightedIntoView()
    return () => observer.disconnect()
  }, [items])

  return (
    <div
      ref={listRef}
      data-slash-command-list
      className="max-h-80 overflow-y-auto overscroll-contain"
    >
      {items.length === 0 ? (
        <div className="px-2.5 py-3 text-xs text-foreground/45" role="status">
          {isLoading ? '正在读取工作区命令…' : '没有匹配的命令'}
        </div>
      ) : (
        <CommandItems items={items} commandMap={commandMap} />
      )}
    </div>
  )
}

function CommandItems({ items, commandMap }: Pick<SlashCommandItemsProps, 'items' | 'commandMap'>) {
  let previousGroup: ComposerSlashCommand['source'] | undefined
  return (
    <>
      {items.map((item, index) => {
        const command = commandMap.get(item.id)
        const group = command?.source ?? 'pi'
        const showGroup = group !== previousGroup
        previousGroup = group
        const groupLabel = group === 'skill' ? 'Skills' : group === 'sailor' ? 'Sailor' : 'Pi'
        return (
          <div key={item.id}>
            {showGroup && (
              <div className="px-2.5 pb-1 pt-2 text-[10px] font-medium uppercase tracking-[0.08em] text-foreground/35">
                {groupLabel}
              </div>
            )}
            <ComposerPrimitive.Unstable_TriggerPopoverItem
              item={item}
              index={index}
              data-command-id={item.id}
              aria-label={`/${item.label}${command?.description ? `：${command.description}` : ''}`}
              className="group flex w-full items-center gap-2 rounded-[8px] px-2.5 py-2 text-start text-[13px] transition-colors hover:bg-foreground/[0.04] data-[highlighted]:bg-foreground/[0.06] data-[highlighted]:text-foreground"
            >
              <SlashCommandIcon command={command} />
              <span className="min-w-0 flex-1">
                <span className="block truncate font-medium">/{item.label}</span>
                {item.description && (
                  <span className="block truncate text-xs text-foreground/45 group-data-[highlighted]:text-foreground/55">
                    {item.description}
                  </span>
                )}
              </span>
              {command?.argumentHint && (
                <span className="shrink-0 font-mono text-[10px] text-foreground/35">
                  {command.argumentHint}
                </span>
              )}
            </ComposerPrimitive.Unstable_TriggerPopoverItem>
          </div>
        )
      })}
    </>
  )
}
