import { validateUIMessages, isStaticToolUIPart } from 'ai'
import { pi } from '@ai-sdk/harness-pi'

const retiredTools = new Set(['updatePlan', 'list_files', 'search_files', 'read_file', 'write_file', 'apply_patch', 'execute_shell', 'web_search'])

export async function validateChatMessages(input: unknown) {
  const messages = await validateUIMessages({ messages: input })
  // Retired calls remain readable, including interrupted calls, without
  // registering an executable tool or accepting them as current static tools.
  for (const message of messages) {
    message.parts = message.parts.map(part => {
      if (!isStaticToolUIPart(part) || !retiredTools.has(part.type.slice(5))) return part
      return { ...part, type: 'dynamic-tool' as const, toolName: part.type.slice(5) }
    })
  }
  return validateUIMessages({ messages, tools: pi.builtinTools })
}
