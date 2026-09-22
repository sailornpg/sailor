import { createMCPClient } from '@ai-sdk/mcp'
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js'
import type { ToolSet } from 'ai'

/** Connects to the local, zero-key search service in the privileged process. */
export async function connectWebSearchMcp(): Promise<{
  client: { close(): Promise<void> }
  tools: ToolSet
}> {
  const client = await createMCPClient({
    transport: new StdioClientTransport({
      command: 'npx',
      args: ['-y', 'ai-search-mcp@0.4.1'],
      env: {
        ...process.env,
        SEARCH_ENGINE: process.env.SEARCH_ENGINE ?? 'auto',
        SEARCH_REGION: process.env.SEARCH_REGION ?? 'cn-zh',
        SEARCH_LOG_LEVEL: 'error',
      },
    }),
  })
  const tools = (await client.tools()) as ToolSet
  // Keep Sailor's stable public tool name while using the MCP server's concise
  // `search` name internally.
  return {
    client,
    tools: {
      ...(tools.search ? { web_search: tools.search } : {}),
      ...(tools.fetch_page ? { fetch_page: tools.fetch_page } : {}),
      ...(tools.research ? { research: tools.research } : {}),
    } as ToolSet,
  }
}
