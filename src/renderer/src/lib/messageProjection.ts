import type { UIMessage } from 'ai'

type MessagePart = UIMessage['parts'][number]

export interface ReasoningProjection {
  text: string
  isStreaming: boolean
}

export function projectReasoning(
  parts: MessagePart[],
  isMessageStreaming: boolean,
): ReasoningProjection | null {
  const reasoningText = parts
    .filter((part) => part.type === 'reasoning')
    .map(({ text }) => text)
    .join('\n\n')

  if (!reasoningText) return null

  return {
    text: reasoningText,
    isStreaming: isMessageStreaming && parts.at(-1)?.type === 'reasoning',
  }
}
