import React from 'react'
import { AssistantRuntimeProvider, useExternalStoreRuntime, type ThreadMessageLike } from '@assistant-ui/react'
import { Thread, type ThreadComponents } from '@/components/assistant-ui/elements/thread.aui'
import { ConversationMapAui } from '@/components/assistant-ui/elements/conversation-map.aui'

const components: ThreadComponents = {
  Composer: () => null,
  ViewportNavigation: () => <ConversationMapAui side="right" />,
}

export function ConversationMapPreview({ messages }: { messages: ThreadMessageLike[] }) {
  const runtime = useExternalStoreRuntime({ messages, convertMessage: (message) => message, onNew: async () => {} })
  return <AssistantRuntimeProvider runtime={runtime}><Thread components={components} /></AssistantRuntimeProvider>
}
