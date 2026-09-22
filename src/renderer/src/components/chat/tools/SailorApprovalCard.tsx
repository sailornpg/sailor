import { useRef, useState } from 'react'
import type { ToolCallMessagePartProps } from '@assistant-ui/react'
import { ToolFallback } from '@/components/assistant-ui/elements/tool-fallback.aui'
import { ApprovalCard } from '@/components/assistant-ui/elements/approval-card'

export function isPendingApprovalRequest(props: ToolCallMessagePartProps): boolean {
  return props.status?.type === 'requires-action'
    && props.approval?.approved === undefined
    && props.approval?.resolution === undefined
    && (props.status.reason !== 'interrupt' || props.approval !== undefined || props.interrupt !== undefined)
}

export function isSimpleApprovalRequest(props: ToolCallMessagePartProps): boolean {
  return isPendingApprovalRequest(props)
    && !props.approval?.options
    && !props.approval?.display
    && !props.approval?.allowFreeform
}

export async function respondToPermission(props: ToolCallMessagePartProps, approved: boolean) {
  if (!isSimpleApprovalRequest(props)) return
  if (props.approval) await props.respondToApproval({ approved })
  else if (props.interrupt) await props.resume({ approved })
  else await props.addResult(approved ? 'Approved by user' : 'User denied tool execution')
}

export function approvalPreview(props: Pick<ToolCallMessagePartProps, 'toolName' | 'args' | 'argsText'>): string {
  const path = props.args.file_path ?? props.args.path
  if (props.toolName === 'bash' && typeof props.args.command === 'string') return props.args.command
  if (props.toolName === 'edit' && typeof path === 'string'
    && typeof props.args.old_string === 'string' && typeof props.args.new_string === 'string') {
    return `${path}\n\n原内容\n${props.args.old_string}\n\n替换为\n${props.args.new_string}`
  }
  if (props.toolName === 'write' && typeof path === 'string' && typeof props.args.content === 'string') {
    return `${path}\n\n${props.args.content}`
  }
  return JSON.stringify(props.args, null, 2) ?? props.argsText
}

export function SailorApprovalCard(props: ToolCallMessagePartProps) {
  const locked = useRef(false)
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const answer = async (approved: boolean) => {
    if (locked.current || !isSimpleApprovalRequest(props)) return
    locked.current = true
    setPending(true)
    setError(null)
    try {
      await respondToPermission(props, approved)
    } catch (failure) {
      locked.current = false
      setPending(false)
      setError(failure instanceof Error ? failure.message : String(failure))
    }
  }
  return (
    <div className="my-2 w-full max-w-sm">
      <ApprovalCard
        state="request"
        command={approvalPreview(props)}
        title={props.approval?.prompt ?? `批准 ${props.toolName} 操作？`}
        subtitle={pending ? '正在提交决定…' : '此操作需要你的确认'}
        disabled={pending}
        aria-busy={pending}
        actions={!isSimpleApprovalRequest(props) ? <ToolFallback.Approval approval={props.approval} interrupt={props.interrupt} status={props.status} addResult={props.addResult} resume={props.resume} respondToApproval={props.respondToApproval} className="[&_button]:rounded-full [&_.aui-tool-fallback-approval-prompt]:hidden" /> : undefined}
        onAllowOnce={() => { void answer(true) }}
        onDeny={() => { void answer(false) }}
      />
      {error && <p role="alert" className="mt-2 text-xs text-destructive">{error}</p>}
    </div>
  )
}
