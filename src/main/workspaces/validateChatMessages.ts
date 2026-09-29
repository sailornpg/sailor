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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function normalizeLegacyTerminalTools(input: unknown): unknown {
  if (!Array.isArray(input)) return input
  return input.map((message) => {
    if (!isRecord(message) || !Array.isArray(message.parts)) return message
    const parts = message.parts.map((part) => {
      if (
        !isRecord(part) ||
        part.type !== 'dynamic-tool' ||
        part.state !== 'output-available' ||
        'input' in part
      )
        return part
      // Older terminal calls could be persisted after output arrived before
      // input streaming completed. Keep the output readable with an explicit
      // unknown input instead of rejecting the whole chat history.
      return { ...part, input: {} }
    })
    return { ...message, parts }
  })
}

export async function validateChatMessages(input: unknown) {
  const messages = await validateUIMessages({
    messages: normalizeLegacyTerminalTools(input),
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
