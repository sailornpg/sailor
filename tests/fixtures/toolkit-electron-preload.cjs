const { contextBridge, ipcRenderer } = require('electron')
let listener

const chunks = [
  { type: 'start', messageId: 'stream-assistant' },
  { type: 'text-start', id: 'text-1' },
  { type: 'text-delta', id: 'text-1', delta: '流式回答开始。' },
  { type: 'text-end', id: 'text-1' },
  { type: 'reasoning-start', id: 'reason-1' },
  { type: 'reasoning-delta', id: 'reason-1', delta: '正在分析。' },
  { type: 'reasoning-end', id: 'reason-1' },
  { type: 'tool-input-start', toolCallId: 'search-1', toolName: 'web_search' },
  { type: 'tool-input-delta', toolCallId: 'search-1', inputTextDelta: '{"query":"docs"}' },
  {
    type: 'tool-input-available',
    toolCallId: 'search-1',
    toolName: 'web_search',
    input: { query: 'docs' },
  },
  {
    type: 'tool-output-available',
    toolCallId: 'search-1',
    output: {
      query: 'docs',
      sources: [
        {
          sourceId: 'src_0123456789abcdef',
          title: 'Docs',
          url: 'https://example.com',
          snippet: 'docs',
          retrievedAt: '2026-09-25T00:00:00.000Z',
        },
      ],
    },
  },
  { type: 'text-start', id: 'text-2' },
  { type: 'text-delta', id: 'text-2', delta: '回答结束。' },
  { type: 'text-end', id: 'text-2' },
  { type: 'finish', finishReason: 'stop' },
]

contextBridge.exposeInMainWorld('sailor', {
  agent: {
    subscribe: (cb) => {
      listener = cb
      return () => {
        if (listener === cb) listener = undefined
      }
    },
    start: async (request) => {
      for (const chunk of chunks) {
        await new Promise((resolve) => setTimeout(resolve, 40))
        listener?.(request.runId, { type: 'chunk', chunk })
      }
      listener?.(request.runId, { type: 'end' })
    },
    abort: async () => {},
    revokeApprovals: async () => {},
    respondToApproval: async () => {},
    respondToAskUser: async () => {},
  },
})

contextBridge.exposeInMainWorld('toolkitTest', {
  done: (results) => ipcRenderer.send('toolkit-test:done', results),
})
