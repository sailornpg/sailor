const { app, BrowserWindow, ipcMain } = require('electron')
const fs = require('node:fs/promises')
const nativeFs = require('node:fs')
const path = require('node:path')
const os = require('node:os')

const reportPath = process.argv[2]
const artifactDir = process.argv[3]
const userData = nativeFs.mkdtempSync(path.join(os.tmpdir(), 'sailor-review-electron-'))
app.setPath('userData', userData)
app.commandLine.appendSwitch('no-sandbox')
app.disableHardwareAcceleration()
if (app.dock) app.dock.hide()

const results = []
let delayedTurnSummary = null
const check = (name, ok, detail) => results.push({ name, ok: Boolean(ok), detail: detail ?? null })
const wait = (ms = 75) => new Promise((resolve) => setTimeout(resolve, ms))
let win
let stage = 'startup'

async function state() {
  return win.webContents.executeJavaScript(`({
    active: document.querySelector('[data-active-chat]')?.getAttribute('data-active-chat'),
    turnCards: [...document.querySelectorAll('[data-turn-file-card]')].map((node) => ({
      turnId: node.getAttribute('data-turn-id'),
      text: node.textContent,
    })),
    turnCardRect: (() => {
      const node = document.querySelector('[data-turn-file-card]')
      const composer = document.querySelector('[data-slot="composer"]')
      if (!node || !composer) return null
      const a = node.getBoundingClientRect()
      const b = composer.getBoundingClientRect()
      return {
        bottom: a.bottom,
        composerTop: b.top,
        gap: b.top - a.bottom,
      }
    })(),
    reviewOpen: Boolean(document.querySelector('[data-review-panel]')),
    reviewText: document.querySelector('[data-review-panel]')?.textContent,
    diff: document.querySelector('[data-slot="code-diff"]')?.textContent,
    overflow: document.documentElement.scrollWidth > document.documentElement.clientWidth,
    dark: document.documentElement.classList.contains('dark'),
    background: getComputedStyle(document.documentElement).backgroundColor,
    preload: typeof window.sailor?.workspaces?.review?.summary === 'function',
  })`)
}

async function until(predicate, timeout = 7000) {
  const end = Date.now() + timeout
  while (Date.now() < end) {
    const value = await state()
    if (predicate(value)) return value
    await wait()
  }
  return state()
}

async function shot(name) {
  await fs.writeFile(path.join(artifactDir, name), (await win.capturePage()).toPNG())
}

async function main() {
  const root = process.cwd()
  const project = path.join(artifactDir, 'project')
  await fs.mkdir(project)
  const { createServer } = await import('vite')
  const react = (await import('@vitejs/plugin-react')).default
  const tailwindcss = (await import('@tailwindcss/vite')).default
  const server = await createServer({
    configFile: false,
    root,
    appType: 'mpa',
    logLevel: 'error',
    plugins: [react(), tailwindcss()],
    resolve: {
      alias: { '@': path.join(root, 'src/renderer/src'), '@shared': path.join(root, 'src/shared') },
    },
    server: { host: '127.0.0.1', port: 0, strictPort: true },
  })
  try {
    stage = 'load modules'
    const { ChatFileChangeJournal, createFileChangeTracker } = await server.ssrLoadModule(
      '/src/main/agent/pi/ChatFileChangeJournal.ts',
    )
    const { createWorkspaceFileSystem } = await server.ssrLoadModule(
      '/src/main/agent/pi/WorkspaceFileSystem.ts',
    )
    const { ChatFileReviewService } = await server.ssrLoadModule(
      '/src/main/workspaces/ChatFileReviewService.ts',
    )
    const directory = path.join(artifactDir, 'changes')
    const journal = new ChatFileChangeJournal(directory, project, (chatId) => {
      win?.webContents.send('workspace-review:changed', chatId)
    })
    const review = new ChatFileReviewService({
      resolveChat: async (chatId) => {
        if (!['chat-a', 'chat-b'].includes(chatId)) throw new Error('会话不存在。')
        return { projectId: 'project-1' }
      },
      resolveProjectRoot: async () => project,
      journal: () => journal,
    })
    const fileSystem = createWorkspaceFileSystem(project, {
      tracker: createFileChangeTracker(journal, 'chat-a', 'turn-a-1', 'run-a'),
    })
    ipcMain.handle('workspace:get-chat', (_event, chatId) => ({
      id: chatId,
      messages:
        chatId === 'chat-a'
          ? [
              {
                id: 'user-a-1',
                role: 'user',
                parts: [{ type: 'text', text: 'Write first version' }],
              },
              {
                id: 'assistant-a-1',
                role: 'assistant',
                parts: [{ type: 'text', text: 'First version done' }],
                metadata: { turnId: 'turn-a-1' },
              },
              {
                id: 'user-a-2',
                role: 'user',
                parts: [{ type: 'text', text: 'Write second version' }],
              },
              {
                id: 'assistant-a-2',
                role: 'assistant',
                parts: [{ type: 'text', text: 'Second version done' }],
                metadata: { turnId: 'turn-a-2' },
              },
            ]
          : [],
    }))
    ipcMain.handle('workspace:slash-commands', () => [])
    ipcMain.handle('workspace:preferences', () => undefined)
    ipcMain.handle('workspace-review:summary', (_event, chatId) => review.summary(chatId))
    ipcMain.handle('workspace-review:detail', (_event, input) =>
      review.detail(input.chatId, input.changeId),
    )
    ipcMain.handle('workspace-review:turn-summary', async (_event, input) => {
      if (delayedTurnSummary === input.turnId) await wait(120)
      return review.turnSummary(input.chatId, input.turnId)
    })
    ipcMain.handle('workspace-review:turn-detail', (_event, input) =>
      review.turnDetail(input.chatId, input.turnId, input.changeId),
    )

    stage = 'listen'
    await server.listen()
    const port = server.httpServer.address().port
    stage = 'window'
    win = new BrowserWindow({
      show: true,
      width: 1000,
      height: 720,
      webPreferences: {
        preload: path.join(root, 'out/preload/index.cjs'),
        sandbox: true,
        contextIsolation: true,
        backgroundThrottling: false,
      },
    })
    win.webContents.on('console-message', (_event, _level, message, line, sourceId) => {
      console.error(`renderer console ${sourceId}:${line}: ${message}`)
    })
    stage = 'load URL'
    await win.loadURL(`http://127.0.0.1:${port}/tests/fixtures/chat-file-diff-review-electron.html`)
    stage = 'assertions'
    let value = await until((item) => item.active === 'chat-a' && item.preload)
    check('生产 preload 暴露窄审查接口', value.preload, JSON.stringify(value))
    check('初始不伪造文件变更', value.turnCards.length === 0, JSON.stringify(value))

    await fileSystem.writeFile('sample.txt', 'first\n')
    value = await until((item) => item.turnCards.length === 1)
    check(
      'Pi 文件系统写入后显示本轮产物卡片',
      value.turnCards[0]?.turnId === 'turn-a-1' &&
        value.turnCards[0]?.text.includes('已编辑 1 个文件') &&
        value.turnCards[0]?.text.includes('+1') &&
        value.turnCards[0]?.text.includes('−0'),
      JSON.stringify(value),
    )
    check(
      '本轮产物卡片与 composer 保持底部间距',
      value.turnCardRect && value.turnCardRect.gap >= 12,
      JSON.stringify(value),
    )
    const beforeReview = await fs.readFile(path.join(project, 'sample.txt'), 'utf8')
    const firstTurn = await review.turnSummary('chat-a', 'turn-a-1')
    const firstDetail = await review.turnDetail('chat-a', 'turn-a-1', firstTurn.changes[0].id)
    check(
      '第一轮产物可定位到对应 diff',
      firstDetail.turnId === 'turn-a-1' && firstDetail.lines.some((line) => line.text === 'first'),
      JSON.stringify(firstDetail),
    )
    check(
      '只读审查未改写项目文件',
      beforeReview === (await fs.readFile(path.join(project, 'sample.txt'), 'utf8')),
    )

    const fileSystemTurn2 = createWorkspaceFileSystem(project, {
      tracker: createFileChangeTracker(journal, 'chat-a', 'turn-a-2', 'run-b'),
    })
    delayedTurnSummary = 'turn-a-1'
    await fileSystemTurn2.writeFile('sample.txt', 'second\n')
    await wait(25)
    const duringRefresh = await state()
    check(
      '刷新本轮摘要时保留上一轮产物卡片',
      duringRefresh.turnCards.length === 2,
      JSON.stringify(duringRefresh),
    )
    delayedTurnSummary = null
    value = await until((item) => item.turnCards.length === 2)
    check(
      '新 turn 产生独立的本轮产物卡片',
      value.turnCards[0]?.turnId === 'turn-a-1' && value.turnCards[1]?.turnId === 'turn-a-2',
      JSON.stringify(value),
    )
    stage = `open second turn review, cards=${value.turnCards.length}`
    const secondTurn = await review.turnSummary('chat-a', 'turn-a-2')
    const secondDetail = await review.turnDetail('chat-a', 'turn-a-2', secondTurn.changes[0].id)
    check(
      '第二轮产物可定位到对应 diff',
      secondDetail.turnId === 'turn-a-2' &&
        secondDetail.lines.some((line) => line.kind === 'removed' && line.text === 'first') &&
        secondDetail.lines.some((line) => line.kind === 'added' && line.text === 'second'),
      JSON.stringify(secondDetail),
    )

    await win.webContents.executeJavaScript('window.__reviewSmoke.select("chat-b")')
    value = await until(
      (item) => item.active === 'chat-b' && item.reviewText?.includes('暂无已记录'),
    )
    check('切换会话后审查隔离', value.turnCards.length === 0 && !value.diff, JSON.stringify(value))
    await win.webContents.executeJavaScript('window.__reviewSmoke.select("chat-a")')
    value = await until((item) => item.active === 'chat-a' && item.turnCards.length === 2)
    check('切回会话恢复本轮产物', value.turnCards.length === 2, JSON.stringify(value))

    await journal.markHostExec('chat-a')
    const hostExecSummary = await review.summary('chat-a')
    check(
      'host_exec 覆盖缺口明确可见',
      hostExecSummary.hasUntrackedHostExec === true,
      JSON.stringify(hostExecSummary),
    )

    await win.reload()
    value = await until((item) => item.active === 'chat-a' && item.turnCards.length === 2)
    check('重载后本轮产物卡片恢复', value.turnCards.length === 2, JSON.stringify(value))
    stage = `open restored second turn review, cards=${value.turnCards.length}`
    check(
      '重载后历史 diff 恢复',
      secondDetail.lines.some((line) => line.kind === 'removed' && line.text === 'first') &&
        secondDetail.lines.some((line) => line.kind === 'added' && line.text === 'second'),
      JSON.stringify(secondDetail),
    )

    await win.webContents.executeJavaScript('document.documentElement.classList.add("dark")')
    await wait(150)
    value = await state()
    check(
      '深色主题渲染',
      value.dark && value.background === 'rgb(12, 12, 12)' && !value.overflow,
      JSON.stringify(value),
    )
    win.setSize(680, 640)
    await wait(150)
    value = await state()
    check('窄窗口无横向溢出', !value.overflow, JSON.stringify(value))

    await fs.writeFile(path.join(project, 'sample.txt'), 'external\n')
    await fileSystem.writeFile('sample.txt', 'agent-after-external\n')
    const afterExternal = await review.summary('chat-a')
    const externalDetail = await review.detail('chat-a', afterExternal.changes[0].id)
    check(
      '外部编辑后只展示新连续段',
      externalDetail.lines.some((line) => line.kind === 'removed' && line.text === 'external') &&
        afterExternal.addedLines === null,
      JSON.stringify(externalDetail.lines),
    )

    await fs.writeFile(reportPath, JSON.stringify({ results }, null, 2))
    app.exit(results.every((result) => result.ok) ? 0 : 1)
  } finally {
    await server.close()
  }
}

app
  .whenReady()
  .then(main)
  .catch(async (error) => {
    console.error(error)
    await fs.writeFile(
      reportPath,
      JSON.stringify({
        results: [
          { name: 'harness', ok: false, detail: `${stage}: ${error?.stack ?? String(error)}` },
        ],
      }),
    )
    app.exit(1)
  })
process.on('exit', () => nativeFs.rmSync(userData, { recursive: true, force: true }))
