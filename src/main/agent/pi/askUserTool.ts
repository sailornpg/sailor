import { tool, type ToolSet } from 'ai'
import { askUserRequestSchema } from '../../../shared/askUser.js'
import type { AskUserInteractionStore } from './AskUserInteraction.js'

export const ASK_USER_TOOL = 'ask_user'

export function createAskUserTool(input: {
  store: AskUserInteractionStore
  chatId: string
  runId: string
}): ToolSet {
  const askUser = tool({
    description:
      'Ask the user one blocking question during a plan execution. Use concise questions and stable option IDs. Continue only after the user answers.',
    inputSchema: askUserRequestSchema,
    execute: async (request, { toolCallId }) => {
      const pending = input.store.create({
        chatId: input.chatId,
        runId: input.runId,
        toolCallId,
        interactionId: toolCallId,
        request,
      })
      return pending.promise
    },
  })
  return { [ASK_USER_TOOL]: askUser } as ToolSet
}
