import { makeAssistantDataUI, type ToolCallMessagePartProps } from '@assistant-ui/react'
import { Archive, CircleAlert, LoaderCircle, RotateCw } from 'lucide-react'
import { piDisplayEventSchema, type PiDisplayEvent } from '@shared/piDisplayEvent'
import { live } from '@/components/assistant-ui/elements/surfaces'
import { cn } from '@/lib/utils'

function label(event: PiDisplayEvent): string {
  if (event.kind === 'compaction') {
    if (event.phase === 'started') return '正在整理上下文'
    if (event.phase === 'failed') return '上下文压缩失败'
    if (event.phase === 'cancelled') return '上下文压缩已取消'
    return event.trigger === 'manual' ? '上下文已压缩' : '上下文已自动压缩'
  }
  if (event.phase === 'started')
    return `连接中断，正在重试（${event.attempt}/${event.maxAttempts}）`
  if (event.phase === 'failed') return '自动重试失败'
  if (event.phase === 'cancelled') return '自动重试已取消'
  return '连接已恢复'
}

export function PiEventLine({
  event,
  historical = false,
}: {
  event: PiDisplayEvent
  historical?: boolean
}) {
  const running = event.phase === 'started'
  const failed = event.phase === 'failed'
  const Icon = failed
    ? CircleAlert
    : running
      ? LoaderCircle
      : event.kind === 'compaction'
        ? Archive
        : RotateCw
  return (
    <div
      data-slot={historical ? 'pi-event-record' : 'pi-event-status'}
      data-event-kind={event.kind}
      data-event-phase={event.phase}
      role="status"
      aria-live="polite"
      className={cn(
        'flex min-w-0 items-center gap-2 py-1 text-sm',
        running ? live : failed ? 'text-destructive' : 'text-muted-foreground',
      )}
    >
      <Icon
        size={15}
        aria-hidden
        className={cn('shrink-0', running && 'animate-spin motion-reduce:animate-none')}
      />
      <span className="min-w-0 break-words">{label(event)}</span>
    </div>
  )
}

export function PiEventRecord({ data }: { data: unknown }) {
  const parsed = piDisplayEventSchema.safeParse(data)
  if (!parsed.success)
    return <div className="py-1 text-sm text-muted-foreground">Pi 事件记录格式无效</div>
  return <PiEventLine event={parsed.data} historical />
}

export const PiEventDataUI = makeAssistantDataUI({ name: 'pi-event', render: PiEventRecord })

export function PiLegacyCompactionRecord(props: ToolCallMessagePartProps) {
  const input =
    props.args && typeof props.args === 'object' ? (props.args as Record<string, unknown>) : {}
  const event: PiDisplayEvent = {
    id: props.toolCallId,
    kind: 'compaction',
    trigger: input.trigger === 'manual' ? 'manual' : 'threshold',
    phase: props.isError || props.status?.type === 'incomplete' ? 'failed' : 'succeeded',
    at: 0,
  }
  return <PiEventLine event={event} historical />
}
