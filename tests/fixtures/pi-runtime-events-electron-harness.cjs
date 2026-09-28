const { app, BrowserWindow, ipcMain } = require('electron')
const fs = require('node:fs/promises')
const os = require('node:os')
const path = require('node:path')
const { randomUUID } = require('node:crypto')

const reportPath = process.argv[2]
const artifactDir = process.argv[3]
const userData = require('node:fs').mkdtempSync(path.join(os.tmpdir(), 'sailor-pi-event-electron-'))
app.setPath('userData', userData)
app.commandLine.appendSwitch('no-sandbox')
app.disableHardwareAcceleration()
if (app.dock) app.dock.hide()

const wait = (ms = 80) => new Promise((resolve) => setTimeout(resolve, ms))
const chats = new Map([
  ['chat-a', { id: 'chat-a', messages: [] }],
  [
    'chat-b',
    {
      id: 'chat-b',
      messages: [
        {
          id: 'legacy-assistant',
          role: 'assistant',
          metadata: {
            usage: { inputTokens: 52302, outputTokens: 100, totalTokens: 52402 },
            contextUsage: { contextWindow: 1024003 },
          },
          parts: [
            {
              type: 'dynamic-tool',
              toolName: 'compaction',
              toolCallId: 'legacy-compaction',
              state: 'output-available',
              input: { trigger: 'auto' },
              output: { summary: 'old summary' },
            },
          ],
        },
      ],
    },
  ],
])
const results = []
const check = (name, ok, detail) => results.push({ name, ok: Boolean(ok), detail: detail ?? null })
let window

function emit(runId, item) {
  window.webContents.send('pi-smoke:event', runId, item)
}

function display(chatId, runId, event) {
  emit(runId, { type: 'pi-event', event: { chatId, runId, id: event.id, event } })
}

function lastText(request) {
  return (
    request.messages
      .at(-1)
      ?.parts.filter((part) => part.type === 'text')
      .map((part) => part.text)
      .join('') ?? ''
  )
}

ipcMain.handle('pi-smoke:get-chat', (_ipc, chatId) => structuredClone(chats.get(chatId)))
ipcMain.handle('pi-smoke:save-messages', (_ipc, chatId, messages) => {
  chats.get(chatId).messages = structuredClone(messages)
})
ipcMain.handle('pi-smoke:abort', async () => {})
ipcMain.handle('pi-smoke:start', async (_ipc, request) => {
  const scenario = lastText(request)
  const id = randomUUID()
  const isRetry = scenario.startsWith('retry')
  const event = isRetry
    ? { id, kind: 'retry', phase: 'started', attempt: 1, maxAttempts: 2, at: Date.now() }
    : { id, kind: 'compaction', phase: 'started', trigger: 'threshold', at: Date.now() }
  display(request.chatId, request.runId, event)
  emit(request.runId, { type: 'chunk', chunk: { type: 'start', messageId: randomUUID() } })
  await wait(350)
  if (isRetry) display(request.chatId, request.runId, { ...event, attempt: 2, at: Date.now() })
  const final = {
    ...event,
    ...(isRetry ? { attempt: 2 } : {}),
    phase: scenario === 'retry-failed' ? 'failed' : 'succeeded',
    at: Date.now(),
  }
  display(request.chatId, request.runId, final)
  emit(request.runId, { type: 'chunk', chunk: { type: 'text-start', id: 'answer' } })
  emit(request.runId, { type: 'chunk', chunk: { type: 'text-delta', id: 'answer', delta: '完成' } })
  emit(request.runId, { type: 'chunk', chunk: { type: 'text-end', id: 'answer' } })
  emit(request.runId, { type: 'chunk', chunk: { type: 'data-pi-event', data: final } })
  emit(request.runId, { type: 'chunk', chunk: { type: 'finish' } })
  emit(request.runId, { type: 'end' })
})
ipcMain.handle('pi-smoke:compact', async (_ipc, chatId) => {
  const runId = randomUUID()
  const id = randomUUID()
  const start = { id, kind: 'compaction', phase: 'started', trigger: 'manual', at: Date.now() }
  display(chatId, runId, start)
  await wait(100)
  const final = { ...start, phase: 'succeeded', at: Date.now() }
  const saved = chats.get(chatId)
  const messages = structuredClone(saved.messages)
  const index = messages.findLastIndex((message) => message.role === 'assistant')
  const part = { type: 'data-pi-event', data: final }
  if (index >= 0) messages[index].parts.push(part)
  else messages.push({ id: randomUUID(), role: 'assistant', parts: [part] })
  saved.messages = structuredClone(messages)
  display(chatId, runId, final)
  return messages
})

async function snapshot() {
  return window.webContents.executeJavaScript(`({
    active: document.querySelector('[data-active-chat]')?.getAttribute('data-active-chat'),
    running: [...document.querySelectorAll('[data-slot="pi-event-status"]')].map((node) => node.textContent),
    runningInConversation: [...document.querySelectorAll('[data-slot="pi-event-status"]')].every((node) => Boolean(node.closest('[data-slot="aui_message-group"]'))),
    records: [...document.querySelectorAll('[data-slot="pi-event-record"]')].map((node) => ({ text: node.textContent, kind: node.getAttribute('data-event-kind'), phase: node.getAttribute('data-event-phase') })),
    errorNotice: Boolean(document.querySelector('.runtime-error-notice')),
    closeErrorButton: Boolean(document.querySelector('button[aria-label="关闭错误提示"]')),
    contextLabel: document.querySelector('[data-slot="composer-context"] button')?.getAttribute('aria-label'),
    contextPopover: document.querySelector('[data-slot="composer-context"] > div')?.textContent,
    overflow: document.documentElement.scrollWidth > document.documentElement.clientWidth,
  })`)
}

async function until(predicate, timeoutMs = 6000) {
  const end = Date.now() + timeoutMs
  while (Date.now() < end) {
    const value = await snapshot()
    if (predicate(value)) return value
    await wait(60)
  }
  return snapshot()
}

async function shot(name) {
  await fs.writeFile(path.join(artifactDir, name), (await window.capturePage()).toPNG())
}

async function main() {
  const root = process.cwd()
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
    await server.listen()
    const port = server.httpServer.address().port
    window = new BrowserWindow({
      show: true,
      width: 940,
      height: 680,
      webPreferences: {
        preload: path.join(root, 'tests/fixtures/pi-runtime-events-electron-preload.cjs'),
        sandbox: true,
        contextIsolation: true,
        backgroundThrottling: false,
      },
    })
    await window.loadURL(`http://127.0.0.1:${port}/tests/fixtures/pi-runtime-events-electron.html`)
    await window.webContents.executeJavaScript(
      'new Promise((resolve) => { const timer = setInterval(() => { if (window.__piSmoke?.chatId === "chat-a") { clearInterval(timer); resolve() } }, 25) })',
    )

    await window.webContents.executeJavaScript('void window.__piSmoke.run("auto"); true')
    let state = await until((value) => value.running.some((line) => line.includes('正在整理')))
    check(
      '自动压缩运行态位于会话消息流',
      state.running.some((line) => line.includes('正在整理')) && state.runningInConversation,
      JSON.stringify(state),
    )
    await shot('pi-events-running.png')
    state = await until((value) => value.records.some((line) => line.text.includes('自动压缩')))
    check(
      '自动压缩唯一终态',
      state.records.filter((line) => line.text.includes('自动压缩')).length === 1 &&
        state.running.length === 0,
      JSON.stringify(state),
    )
    await shot('pi-events-light.png')

    await window.webContents.executeJavaScript('void window.__piSmoke.select("chat-b"); true')
    state = await until((value) => value.active === 'chat-b')
    check(
      '会话切换隔离',
      state.active === 'chat-b' && state.running.length === 0,
      JSON.stringify(state),
    )
    check('压缩前显示最近一次真实用量', state.contextLabel?.includes('5%'), JSON.stringify(state))
    check(
      '旧 compaction 历史兼容',
      state.records.some((line) => line.text.includes('自动压缩')),
      JSON.stringify(state),
    )

    await window.webContents.executeJavaScript('void window.__piSmoke.run("retry-success"); true')
    state = await until((value) => value.running.some((line) => line.includes('正在重试')))
    check(
      '自动重试运行态位于会话消息流',
      state.running.some((line) => line.includes('正在重试')) && state.runningInConversation,
      JSON.stringify(state),
    )
    state = await until((value) => value.records.some((line) => line.text.includes('连接已恢复')))
    check(
      '自动重试成功终态',
      state.records.filter((line) => line.text.includes('连接已恢复')).length === 1,
      JSON.stringify(state),
    )

    await window.webContents.executeJavaScript('void window.__piSmoke.run("retry-failed"); true')
    state = await until((value) => value.records.some((line) => line.text.includes('自动重试失败')))
    check(
      '自动重试失败终态',
      state.records.filter((line) => line.text.includes('自动重试失败')).length === 1,
      JSON.stringify(state),
    )

    await window.webContents.executeJavaScript('window.__piSmoke.compact()')
    state = await until((value) => value.records.some((line) => line.text.includes('上下文已压缩')))
    check(
      '手动压缩同步终态',
      state.records.filter((line) => line.text.includes('上下文已压缩')).length === 1,
      JSON.stringify(state),
    )
    state = await until((value) => value.contextLabel?.includes('压缩后用量'))
    check(
      '压缩后不再显示旧用量',
      state.contextLabel?.includes('压缩后用量将在下次调用后更新') &&
        state.contextPopover?.includes('压缩后用量将在下次调用后更新') &&
        !state.contextPopover?.includes('52,302'),
      JSON.stringify(state),
    )
    const contextPoint = await window.webContents.executeJavaScript(`(() => {
      const rect = document.querySelector('[data-slot="composer-context"] button').getBoundingClientRect()
      return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 }
    })()`)
    window.webContents.sendInputEvent({ type: 'mouseMove', ...contextPoint })
    await wait(150)
    await shot('pi-context-pending.png')
    await window.webContents.executeJavaScript('document.documentElement.classList.add("dark")')
    await wait(80)
    await shot('pi-events-dark.png')
    window.setSize(430, 600)
    await wait(120)
    state = await snapshot()
    check('窄窗口无横向溢出', !state.overflow, JSON.stringify(state))
    await shot('pi-events-narrow.png')

    await window.webContents.executeJavaScript('window.__piSmoke.showError(); true')
    state = await until((value) => value.errorNotice)
    check('错误提示可手动关闭', state.errorNotice && state.closeErrorButton, JSON.stringify(state))
    await shot('pi-events-error.png')
    await window.webContents.executeJavaScript(
      'document.querySelector("button[aria-label=\\"关闭错误提示\\"]").click()',
    )
    state = await until((value) => !value.errorNotice)
    check('手动关闭后提示消失', !state.errorNotice, JSON.stringify(state))
    await window.webContents.executeJavaScript('window.__piSmoke.showError(); true')
    state = await until((value) => value.errorNotice)
    state = await until((value) => !value.errorNotice, 9500)
    check('错误提示自动消退', !state.errorNotice, JSON.stringify(state))

    await window.reload()
    await window.webContents.executeJavaScript(
      'new Promise((resolve) => { const timer = setInterval(() => { if (window.__piSmoke?.chatId === "chat-a") { clearInterval(timer); resolve() } }, 25) })',
    )
    await window.webContents.executeJavaScript('void window.__piSmoke.select("chat-b"); true')
    state = await until((value) => value.active === 'chat-b' && value.records.length >= 4)
    check(
      '重启恢复压缩与重试历史',
      state.records.some((line) => line.text.includes('连接已恢复')) &&
        state.records.some((line) => line.text.includes('自动重试失败')) &&
        state.records.some((line) => line.text.includes('上下文已压缩')),
      JSON.stringify(state),
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
      JSON.stringify({ results: [{ name: 'harness', ok: false, detail: String(error) }] }),
    )
    app.exit(1)
  })
process.on('exit', () => require('node:fs').rmSync(userData, { recursive: true, force: true }))
