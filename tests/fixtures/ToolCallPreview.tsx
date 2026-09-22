import React from 'react'
import { AssistantRuntimeProvider, useExternalStoreRuntime } from '@assistant-ui/react'
import { Thread, type ThreadComponents } from '@/components/assistant-ui/elements/thread.aui'
import { SailorToolCall, SailorToolCalls } from '@/components/chat/tools/SailorToolCall'

const components: ThreadComponents = {
  ToolFallback: SailorToolCall,
  ToolGroup: SailorToolCalls,
  Composer: () => null,
}

const messages = [{
  id: 'tool-call-preview', role: 'assistant' as const,
  content: [
    { type: 'reasoning' as const, text: '规划修改' },
    { type: 'tool-call' as const, toolCallId: 'read-1', toolName: 'read', args: { file_path: 'thread.tsx' }, argsText: '{"file_path":"thread.tsx"}', result: 'file content' },
    { type: 'tool-call' as const, toolCallId: 'read-2', toolName: 'read', args: { file_path: 'thread.tsx' }, argsText: '{"file_path":"thread.tsx"}', result: 'file content' },
    { type: 'tool-call' as const, toolCallId: 'edit-1', toolName: 'edit', args: { file_path: 'composer.tsx', old_string: 'old', new_string: 'new' }, argsText: '{}', result: 'edited' },
  ],
}]

export function ToolCallPreview() {
  const runtime = useExternalStoreRuntime({ messages, convertMessage: (message) => message, onNew: async () => {} })
  return <AssistantRuntimeProvider runtime={runtime}><Thread components={components} /></AssistantRuntimeProvider>
}

export function ApprovalPreview({ call }: { call: React.ComponentProps<typeof SailorToolCall> }) {
  const runtime = useExternalStoreRuntime({ messages: [], onNew: async () => {} })
  return <AssistantRuntimeProvider runtime={runtime}><SailorToolCall {...call} /></AssistantRuntimeProvider>
}
