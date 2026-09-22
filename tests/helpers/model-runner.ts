import { createServer } from "vite"
import { randomBytes, randomUUID } from 'node:crypto'
import { ToolLoopAgent, convertToModelMessages, toUIMessageStream, smoothStream, type LanguageModel } from 'ai'
import type { AgentRunner, PiRunOptions } from '../../src/main/agent/pi/PiRunner.ts'

// Deterministic transport/lifecycle tests inject this runner. Pi integration
// tests use the production runner against a local HTTP fixture instead.
export function createModelRunner(createModel: (config: PiRunOptions['config']) => LanguageModel): AgentRunner {
  const secret = randomBytes(32)
  return {
    async *run({ request, config, context, signal }) {
      const vite = await createServer({ logLevel: "silent", server: { middlewareMode: true } })
      try {
      const { createAgentTools } = await vite.ssrLoadModule("/tests/fixtures/legacy-tools/index.ts")
      const { WorkspaceToolScope } = await vite.ssrLoadModule("/src/main/workspaces/WorkspaceToolScope.ts")
      const tools = context ? createAgentTools({ ...context, scope: await WorkspaceToolScope.create(context.rootPath, signal) }) : {}
      const agent = new ToolLoopAgent({ model: createModel(config), tools, experimental_toolApprovalSecret: secret })
      const prompt = await convertToModelMessages(request.messages, { tools, ignoreIncompleteToolCalls: true })
      const result = await agent.stream({ prompt, abortSignal: signal, experimental_transform: smoothStream({ chunking: new Intl.Segmenter('zh-CN', { granularity: 'word' }), delayInMs: 10 }) })
      yield* toUIMessageStream({ stream: result.stream, tools, originalMessages: request.messages, generateMessageId: randomUUID, sendReasoning: true })
      } finally { await vite.close() }
    },
  }
}
