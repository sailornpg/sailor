import { workspaceContextSchema } from '../../shared/workspaceContext.js'
import { validateUIMessages, isStaticToolUIPart } from 'ai'
import { pi } from '@ai-sdk/harness-pi'
import { piDisplayEventSchema } from '../../shared/piDisplayEvent.js'

// Host tools are registered per Pi run, so they are not present in the
// built-in tool schema used to validate persisted history. Keep both spellings
// of update_plan readable because older sessions used camelCase.
const retiredTools = new Set([
  'update_plan',
  'updatePlan',
  'ask_user',
  'list_files',
  'search_files',
  'read_file',
  'write_file',
  'apply_patch',
  'execute_shell',
  'web_search',
])

export async function validateChatMessages(input: unknown) {
  const messages = await validateUIMessages({
    messages: input,
    dataSchemas: { 'workspace-context': workspaceContextSchema, 'pi-event': piDisplayEventSchema },
  })
  // Retired calls remain readable, including interrupted calls, without
  // registering an executable tool or accepting them as current static tools.
  for (const message of messages) {
    message.parts = message.parts.map((part) => {
      if (!isStaticToolUIPart(part) || !retiredTools.has(part.type.slice(5))) return part
      return { ...part, type: 'dynamic-tool' as const, toolName: part.type.slice(5) }
    })
  }
  return validateUIMessages({
    messages,
    dataSchemas: { 'workspace-context': workspaceContextSchema, 'pi-event': piDisplayEventSchema },
    tools: pi.builtinTools,
  })
}
