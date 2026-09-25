import type { SailorAskUserCardProps } from '../tools/SailorAskUserCard'
import type { RunStatus } from '@shared/workspaces'

interface PendingAskUserPart {
  type?: string
  toolName?: string
  toolCallId?: string
  args?: unknown
  result?: unknown
  isError?: boolean
  status?: { type?: string }
}

interface PendingAskUserMessage {
  role?: string
  content?: readonly PendingAskUserPart[]
}

export function pendingAskUserKey(pending: SailorAskUserCardProps | undefined): string {
  if (!pending) return ''
  return JSON.stringify({
    toolCallId: pending.toolCallId,
    args: pending.args,
    result: pending.result,
    status: pending.status?.type,
  })
}

/**
 * ask_user pauses inside a normal tool execution, so its assistant message is
 * still streaming rather than marked as an approval request. Only project a
 * live run and ignore terminal tool parts from restored history.
 */
export function findPendingAskUser(
  messages: readonly PendingAskUserMessage[],
  runStatus: RunStatus | undefined,
): SailorAskUserCardProps | undefined {
  if (runStatus !== 'running') return undefined
  for (let messageIndex = messages.length - 1; messageIndex >= 0; messageIndex -= 1) {
    const message = messages[messageIndex]
    if (message.role !== 'assistant') continue
    for (let partIndex = (message.content?.length ?? 0) - 1; partIndex >= 0; partIndex -= 1) {
      const part = message.content?.[partIndex]
      if (
        part?.type !== 'tool-call' ||
        part.toolName !== 'ask_user' ||
        !part.toolCallId ||
        part.args === undefined ||
        part.result !== undefined ||
        part.isError ||
        part.status?.type === 'complete' ||
        part.status?.type === 'incomplete'
      )
        continue
      return { toolCallId: part.toolCallId, args: part.args }
    }
  }
  return undefined
}
