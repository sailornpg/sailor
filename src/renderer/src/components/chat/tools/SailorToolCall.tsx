import { useState, type PropsWithChildren } from 'react'
import type { ToolCallMessagePartComponent, ToolCallMessagePartProps } from '@assistant-ui/react'
import { ToolCall } from '@/components/assistant-ui/elements/tool-call'
import { StructuredToolFallback } from './StructuredToolFallback'
import { isPendingApprovalRequest, SailorApprovalCard } from './SailorApprovalCard'

export function formatToolValue(value: unknown): string {
  if (value === undefined) return ''
  return typeof value === 'string' ? value : JSON.stringify(value, null, 2) ?? ''
}

export function toolCallNeedsFallback(props: ToolCallMessagePartProps): boolean {
  return Boolean(props.status?.type === 'requires-action'
    || props.status?.type === 'incomplete'
    || props.isError
    || (props.approval && (props.approval.approved !== true || props.approval.resolution))
    || (typeof props.result === 'object' && props.result !== null && 'ok' in props.result && props.result.ok === false))
}

export const SailorToolCall: ToolCallMessagePartComponent = (props) => {
  const [open, setOpen] = useState(false)
  if (isPendingApprovalRequest(props)) return <SailorApprovalCard key={props.approval?.id ?? props.toolCallId} {...props} />
  // The official ToolCall has only running/success visuals, so actionable and incomplete states use the existing renderer.
  if (toolCallNeedsFallback(props)) {
    const status = props.isError && props.status?.type !== 'incomplete'
      ? { type: 'incomplete' as const, reason: 'error' as const, error: formatToolValue(props.result) }
      : props.status
    return <StructuredToolFallback {...props} status={status} />
  }
  const query = [props.args.file_path, props.args.path, props.args.command, props.args.pattern, props.args.query]
    .find((value): value is string => typeof value === 'string' && value.length > 0) ?? props.toolName
  return (
    <ToolCall
      label={props.toolName}
      activeLabel={props.toolName}
      query={query}
      request={props.argsText || formatToolValue(props.args)}
      result={formatToolValue(props.result)}
      running={props.status?.type === 'running'}
      open={open}
      onOpenChange={setOpen}
    />
  )
}

export function SailorToolCalls({ children }: PropsWithChildren) {
  return <>{children}</>
}
