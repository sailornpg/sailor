import { isToolUIPart, type UIMessage } from 'ai'

// A transport may finish while the user task is paused for approval. Inspect
// only the latest assistant message so historical approvals cannot keep it open.
export function hasPendingToolApproval(messages: readonly UIMessage[]): boolean {
  const message = messages.at(-1)
  return (
    message?.role === 'assistant' &&
    message.parts.some(
      (part) =>
        isToolUIPart(part) &&
        (part.state === 'approval-requested' || part.state === 'approval-responded'),
    )
  )
}
