// Drives scripted streaming runs through the real main-process AgentService,
// WorkspaceService and WorkspaceStore inside Electron. It proves that a long
// answer is persisted (and the renderer is poked) a bounded number of times
// instead of once per streamed chunk, and that the stored history stays complete.
const { app } = require('electron')
const fs = require('node:fs/promises')
const os = require('node:os')
const path = require('node:path')
const { randomUUID } = require('node:crypto')

app.commandLine.appendSwitch('no-sandbox')
app.disableHardwareAcceleration()
app.setPath(
  'userData',
  require('node:fs').mkdtempSync(path.join(os.tmpdir(), 'sailor-stream-userdata-')),
)
if (app.dock) app.dock.hide()

const results = []
function check(name, ok, detail) {
  results.push({ name, ok: Boolean(ok), detail: detail ?? null })
  if (!ok) console.error(`FAIL ${name}: ${detail ?? ''}`)
}

/** Yields one text delta per segment, paced like a real provider stream. */
function createRunner(segments, chunkDelayMs) {
  const messageId = randomUUID()
  const deltas = Array.from({ length: segments }, (_, index) => `第${index}段。`)
  return {
    async *run() {
      yield { type: 'start', messageId }
      yield { type: 'start-step' }
      yield { type: 'text-start', id: 'text-1' }
      for (const delta of deltas) {
        yield { type: 'text-delta', id: 'text-1', delta }
        // Without a pause the whole stream drains in one microtask chain, which
        // would hide an unthrottled per-chunk write behind the timer queue.
        await new Promise((done) => setTimeout(done, chunkDelayMs))
      }
      yield { type: 'text-end', id: 'text-1' }
      yield { type: 'finish-step' }
      yield { type: 'finish', finishReason: 'stop' }
    },
    text: deltas.join(''),
  }
}

const resolvedModel = {
  providerId: 'test',
  providerName: 'Test',
  baseUrl: 'http://127.0.0.1:1',
  protocol: 'openai-completions',
  apiKey: 'test-key',
  modelId: 'test-model',
  reasoningLevels: [],
  maxOutputTokens: 256,
}

async function main() {
  const { createServer } = await import('vite')
  const root = process.cwd()
  const server = await createServer({
    logLevel: 'silent',
    server: { middlewareMode: true },
    resolve: { alias: { '@shared': path.resolve(root, 'src/shared') } },
  })
  try {
    const { AgentService } = await server.ssrLoadModule('/src/main/agent/AgentService.ts')
    const { WorkspaceStore } = await server.ssrLoadModule('/src/main/workspaces/WorkspaceStore.ts')
    const { WorkspaceService } = await server.ssrLoadModule(
      '/src/main/workspaces/WorkspaceService.ts',
    )
    const workRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'sailor-stream-project-'))
    const projectRoot = path.join(workRoot, 'project')
    const stateFile = path.join(workRoot, 'state.json')
    await fs.mkdir(projectRoot)

    let writes = 0
    let notifications = 0
    const store = new WorkspaceStore(stateFile)
    const updateChat = store.updateChat.bind(store)
    store.updateChat = async (...args) => {
      writes += 1
      return updateChat(...args)
    }
    const workspace = new WorkspaceService(
      store,
      async () => projectRoot,
      () => {
        notifications += 1
      },
    )
    const project = await workspace.pickProject()

    const runOnce = async (segments, chunkDelayMs) => {
      const chat = await workspace.createChat(project.id)
      const runner = createRunner(segments, chunkDelayMs)
      const emitted = []
      const service = new AgentService(
        (_runId, event) => {
          if (event.type === 'chunk') emitted.push(event.chunk)
        },
        { resolveActiveModel: async () => resolvedModel },
        { runner, workspace },
      )
      const before = { writes, notifications }
      await service.start({
        runId: randomUUID(),
        chatId: chat.id,
        reasoning: 'provider-default',
        messages: [{ id: randomUUID(), role: 'user', parts: [{ type: 'text', text: '写个排序' }] }],
      })
      // Coalesced notifications are trailing, so settle one window before counting.
      await new Promise((done) => setTimeout(done, 200))
      return {
        chatId: chat.id,
        text: runner.text,
        writes: writes - before.writes,
        notifications: notifications - before.notifications,
        deltas: emitted.filter((chunk) => chunk.type === 'text-delta').length,
      }
    }

    // Same stream duration, five times the chunk count: persistence must not
    // follow the chunk count, only the clock.
    const short = await runOnce(40, 5)
    const long = await runOnce(200, 1)

    check(
      '每轮流式运行的持久化写入次数有上限',
      short.writes <= 6 && long.writes <= 6,
      `writes: 40 chunks -> ${short.writes}, 200 chunks -> ${long.writes}`,
    )
    check(
      '相同生成时长下写入次数不随 chunk 数增长',
      long.writes <= short.writes + 2 && long.writes * 5 <= 200,
      `writes: 40 chunks -> ${short.writes}, 200 chunks -> ${long.writes}`,
    )
    check(
      '每轮运行的 workspaceChanged 广播次数有上限',
      short.notifications <= 6 &&
        long.notifications <= 6 &&
        long.notifications <= short.notifications + 2,
      `notifications: 40 chunks -> ${short.notifications}, 200 chunks -> ${long.notifications}`,
    )
    check(
      'UI 仍然逐 chunk 收到流式文本',
      short.deltas === 40 && long.deltas === 200,
      `deltas: 40 chunks -> ${short.deltas}, 200 chunks -> ${long.deltas}`,
    )

    const snapshot = await workspace.snapshot()
    check(
      'run 终态写入工作区快照',
      snapshot.chats.every((chat) => chat.status === 'completed'),
      snapshot.chats.map((chat) => `${chat.id}:${chat.status}`).join(', '),
    )

    // A fresh instance over the same file is what a restart reads.
    const restarted = new WorkspaceStore(stateFile)
    const stored = await restarted.getChat(long.chatId)
    const assistant = stored.messages.filter((message) => message.role === 'assistant')
    const text = assistant
      .flatMap((message) => message.parts)
      .filter((part) => part.type === 'text')
      .map((part) => part.text)
      .join('')
    check(
      '重启后历史包含完整回答',
      text === long.text,
      `stored ${text.length} chars, expected ${long.text.length}`,
    )
    check(
      '重启后历史保留用户提问',
      stored.messages.some((message) => message.role === 'user'),
      `roles: ${stored.messages.map((message) => message.role).join(',')}`,
    )

    await fs.rm(workRoot, { recursive: true, force: true })
  } finally {
    await server.close()
  }
}

app
  .whenReady()
  .then(main)
  .then(() => {
    console.log(JSON.stringify({ checks: results }, null, 2))
    // `app.quit()` alone reports 0, which would make this gate always pass.
    app.exit(results.every((result) => result.ok) ? 0 : 1)
  })
  .catch((error) => {
    console.error(error)
    app.exit(1)
  })
