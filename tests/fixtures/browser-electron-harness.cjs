// Real-Electron acceptance for the sidebar browser.
//
// The renderer runs the production BrowserPanel component inside a sandboxed
// BrowserWindow, and main wires the production BrowserRegistry + BrowserIpcHandler
// + ElectronBrowserTabFactory. The local fixture site is a plain http page, so the
// navigation, accessibility snapshot, click and screenshot all hit a real page.
const { app, BrowserWindow, ipcMain } = require('electron')
const { createServer } = require('node:http')
const { mkdtempSync, readFileSync, rmSync, writeFileSync } = require('node:fs')
const { join, resolve } = require('node:path')
const { tmpdir } = require('node:os')

const userData = mkdtempSync(join(tmpdir(), 'sailor-browser-smoke-'))
app.setPath('userData', userData)
app.disableHardwareAcceleration()

const evidenceDir = resolve('.agent-harness/evidence/sidebar-browser')
const results = []
let finished = false

function check(name, ok, detail) {
  results.push({ name, ok: Boolean(ok), detail: detail === undefined ? null : detail })
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${detail ? ` — ${detail}` : ''}`)
}

/**
 * 本地脚本模型：先读页面，然后从工具结果里**自己解析出 ref** 再点击，
 * 最后收尾。这样验证的是"模型决定 → 工具执行 → 结果回到模型"的完整链路。
 */
function startScriptedModel() {
  const transcript = []
  let served = 0
  const server = createServer(async (request, response) => {
    let body = ''
    for await (const chunk of request) body += chunk
    const parsed = JSON.parse(body)
    const seen = JSON.stringify(parsed.messages ?? [])
    transcript.push(seen)
    served += 1
    let delta
    if (served === 1) {
      delta = {
        tool_calls: [
          {
            index: 0,
            id: 'agent-read',
            type: 'function',
            function: {
              name: 'browser_read_page',
              arguments: JSON.stringify({ mode: 'interactive' }),
            },
          },
        ],
      }
    } else if (served === 2) {
      // 像真实模型一样：从上一步的工具结果里读出 ref，再用它点击。
      const buttonRef = /\[(ref_\d+)\] button "点我"/.exec(seen)?.[1]
      delta = {
        tool_calls: [
          {
            index: 0,
            id: 'agent-click',
            type: 'function',
            function: {
              name: 'browser_click',
              arguments: JSON.stringify({ ref: buttonRef ?? 'ref_1' }),
            },
          },
        ],
      }
    } else {
      delta = { content: '页面上的「点我」按钮已经点击完成。' }
    }
    response.writeHead(200, { 'content-type': 'text/event-stream' })
    const send = (choices, usage) =>
      response.write(
        `data: ${JSON.stringify({ id: 'completion', object: 'chat.completion.chunk', created: 1, model: 'fixture', choices, ...(usage ? { usage } : {}) })}\n\n`,
      )
    send([{ index: 0, delta: { role: 'assistant', ...delta }, finish_reason: null }])
    send([{ index: 0, delta: {}, finish_reason: delta.tool_calls ? 'tool_calls' : 'stop' }])
    send([], { prompt_tokens: 20, completion_tokens: 5, total_tokens: 25 })
    response.end('data: [DONE]\n\n')
  })
  return {
    transcript,
    listen: () => new Promise((resolveListen) => server.listen(0, '127.0.0.1', resolveListen)),
    get url() {
      return `http://127.0.0.1:${server.address().port}/v1`
    },
    close: () =>
      new Promise((resolveClose) => {
        server.closeAllConnections()
        server.close(() => resolveClose())
      }),
  }
}

function waitFor(predicate, timeoutMs = 15_000) {
  return new Promise((resolvePromise, reject) => {
    const started = Date.now()
    const tick = () => {
      if (predicate()) return resolvePromise()
      if (Date.now() - started > timeoutMs) return reject(new Error('等待超时'))
      setTimeout(tick, 50)
    }
    tick()
  })
}

function finish(code) {
  if (finished) return
  finished = true
  writeFileSync(join(evidenceDir, 'sidebar-browser-report.json'), JSON.stringify(results, null, 2))
  console.log(`resolved ${results.filter((r) => r.ok).length}/${results.length}`)
  app.exit(code)
}

async function main() {
  const vite = await import('vite')
  const tailwind = (await import('@tailwindcss/vite')).default
  const rendererServer = await vite.createServer({
    configFile: false,
    root: process.cwd(),
    logLevel: 'error',
    plugins: [tailwind()],
    esbuild: { jsx: 'automatic' },
    resolve: { alias: { '@': resolve('src/renderer/src'), '@shared': resolve('src/shared') } },
    server: { host: '127.0.0.1', port: 0 },
  })
  await rendererServer.listen()

  const siteHtml = readFileSync(resolve('tests/fixtures/browser-electron-site.html'), 'utf8')
  const siteServer = createServer((_request, response) => {
    response.writeHead(200, { 'content-type': 'text/html; charset=utf-8' })
    response.end(siteHtml)
  })
  await new Promise((resolvePromise) => siteServer.listen(0, '127.0.0.1', resolvePromise))
  const siteUrl = `http://127.0.0.1:${siteServer.address().port}/`

  // 生产 main 侧模块直接从源码加载，避免 fixture 复制实现。
  // external 让 electron 走真实 require，而不是 Vite 的 CJS named-export 互操作分析。
  const mainServer = await vite.createServer({
    configFile: false,
    root: process.cwd(),
    logLevel: 'error',
    // 两个 Vite 实例共用默认 cacheDir 会互相覆盖预打包结果，这里各用各的。
    cacheDir: join(userData, 'vite-main'),
    optimizeDeps: { noDiscovery: true, include: [] },
    resolve: {
      alias: {
        '@shared': resolve('src/shared'),
        electron: resolve('tests/fixtures/electron-esm-shim.mjs'),
      },
    },
    server: { middlewareMode: true },
  })
  const { BrowserRegistry } = await mainServer.ssrLoadModule('/src/main/browser/BrowserRegistry.ts')
  const { BrowserIpcHandler } = await mainServer.ssrLoadModule(
    '/src/main/browser/BrowserIpcHandler.ts',
  )
  const { BrowserCaptures } = await mainServer.ssrLoadModule('/src/main/browser/BrowserCaptures.ts')
  const { createElectronBrowserTabFactory } = await mainServer.ssrLoadModule(
    '/src/main/browser/ElectronBrowserTabs.ts',
  )
  const { createBrowserTools } = await mainServer.ssrLoadModule('/src/main/browser/browserTools.ts')

  const win = new BrowserWindow({
    show: false,
    width: 1280,
    height: 820,
    webPreferences: {
      preload: resolve('tests/fixtures/browser-electron-preload.cjs'),
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false,
      backgroundThrottling: false,
    },
  })

  const captures = new BrowserCaptures(app.getPath('userData'))
  const reportedBounds = []
  let registry
  registry = new BrowserRegistry(
    {
      createFactory: () => createElectronBrowserTabFactory(win),
      resolveProjectRoot: async (projectId) => {
        if (projectId !== 'project-fixture') throw new Error('工作区不存在。')
        return process.cwd()
      },
      // 与 registerIpc 同一路径：状态变化必须推给面板，否则标题/加载态不会更新。
      onChange: (projectId) => {
        if (!win.isDestroyed()) win.webContents.send('browser:state', registry.snapshot(projectId))
      },
      // 同样与 registerIpc 一致：Agent 一动浏览器就请 renderer 打开侧栏。
      onAgentActivity: (projectId) => {
        if (!win.isDestroyed()) win.webContents.send('browser:reveal', { projectId })
      },
    },
    { save: captures.save.bind(captures), read: captures.read.bind(captures) },
  )
  const handler = new BrowserIpcHandler({
    registry,
    isTrustedSender: (sender) => sender.id === win.webContents.id,
  })
  const sender = {
    id: win.webContents.id,
    isDestroyed: () => win.isDestroyed(),
    send: (payload) => {
      if (!win.isDestroyed()) win.webContents.send('browser:state', payload)
    },
  }
  const invoke = (name, fn) => {
    ipcMain.handle(`browser:${name}`, (event, input) => fn(event.sender, input))
  }
  invoke('attach', (s, i) => handler.attach(s, i))
  invoke('detach', (s, i) => handler.detach(s, i))
  invoke('set-bounds', (s, i) => {
    if (i && typeof i === 'object' && i.bounds !== null && i.bounds !== undefined)
      reportedBounds.push(i.bounds)
    return handler.setBounds(s, i)
  })
  invoke('navigate', (s, i) => handler.navigate(s, i))
  invoke('history', (s, i) => handler.history(s, i))
  invoke('reload', (s, i) => handler.reload(s, i))
  invoke('stop', (s, i) => handler.stop(s, i))
  invoke('new-tab', (s, i) => handler.newTab(s, i))
  invoke('close-tab', (s, i) => handler.closeTab(s, i))
  invoke('activate-tab', (s, i) => handler.activateTab(s, i))
  invoke('read-capture', (s, i) => handler.readCapture(s, i))

  let rendererReady = false
  let rendererRan = false
  const watchdog = setTimeout(() => {
    check('渲染进程在 60s 内发出 ready 信号', false, '面板没有加载出来')
    finish(1)
  }, 60_000)
  ipcMain.on('browser-test:ready', async () => {
    if (rendererReady) return
    clearTimeout(watchdog)
    rendererReady = true
    console.log('[harness] renderer ready')
    try {
      await runAssertions()
    } catch (error) {
      check('冒烟断言执行完成', false, error instanceof Error ? error.message : String(error))
      finish(1)
    }
  })
  ipcMain.on('browser-test:done', (_event, payload) => {
    for (const item of payload) check(item.name, item.ok, item.error)
    finish(results.every((r) => r.ok) ? 0 : 1)
  })

  async function runAssertions() {
    check(
      'side chat 之外的浏览器工具已注册（生产模块可加载）',
      typeof createBrowserTools === 'function',
    )

    // 1) 渲染进程：真实面板的 DOM 与状态投影。
    await win.webContents.executeJavaScript(
      `document.documentElement.setAttribute('data-fixture-ready', '1'); void 0`,
    )
    console.log('[harness] running panel checks')
    const checks = await win.webContents.executeJavaScript('window.__browserPanelChecks()')
    console.log('[harness] panel checks returned', JSON.stringify(checks))
    rendererRan = true
    for (const item of checks) check(item.name, item.ok, item.error)

    // 2) 几何：面板上报的矩形必须与真实 WebContentsView 的 bounds 一致。
    const site = registry.site('project-fixture')
    check('main 侧存在浏览器站点', site !== undefined)
    const views = win.contentView.children
    check('原生浏览器视图已挂到窗口上', views.length >= 1, `children=${views.length}`)
    await waitFor(() => reportedBounds.some((bounds) => bounds && bounds.width > 32))
    const lastBounds = [...reportedBounds].reverse().find((bounds) => bounds && bounds.width > 32)
    const viewBounds = views.length >= 1 ? views[0].getBounds() : null
    check('面板上报了几何', Boolean(lastBounds), JSON.stringify(lastBounds))
    check(
      'WebContentsView 的 bounds 与面板内容区一致',
      Boolean(lastBounds && viewBounds) &&
        viewBounds.width === lastBounds.width &&
        viewBounds.height === lastBounds.height,
      `view=${JSON.stringify(viewBounds)} reported=${JSON.stringify(lastBounds)}`,
    )

    // 3) 真实导航：面板驱动到本地 fixture 页面。
    const tabId = site?.activeTabId
    const pageView = views[0]
    await waitFor(() => pageView.webContents.getURL().startsWith(siteUrl.slice(0, 24)), 15_000)
    check(
      '浏览器视图真的加载了 fixture 页面',
      pageView.webContents.getURL() === siteUrl,
      pageView.webContents.getURL(),
    )
    check(
      '页面标题来自真实渲染',
      pageView.webContents.getTitle() === 'Fixture 首页',
      pageView.webContents.getTitle(),
    )

    // 4) Agent 路径：真实 CDP + 可访问性快照 + 点击 + 截图。
    //    这里刻意不做任何"用户授权"动作：浏览器默认就对 Agent 可用。
    const tools = createBrowserTools({
      access: registry,
      projectId: 'project-fixture',
      chatId: 'chat-fixture',
    })
    const call = async (name, input) =>
      tools[name].execute(input, {
        toolCallId: `call-${name}`,
        messages: [],
        abortSignal: undefined,
      })

    const snapshot = await call('browser_read_page', { mode: 'interactive' })
    const snapshotText = snapshot?.data?.text ?? ''
    check(
      'browser_read_page 读到带 ref 的按钮',
      /\[ref_\d+\] button "点我"/.test(snapshotText),
      snapshotText.slice(0, 200),
    )
    const buttonRef = /\[(ref_\d+)\] button "点我"/.exec(snapshotText)?.[1]
    check('快照给出可用的 ref', typeof buttonRef === 'string', buttonRef)

    const before = await call('browser_read_text', {})
    check('browser_read_text 读到未点击状态', String(before?.data?.text ?? '').includes('尚未点击'))

    const clicked = await call('browser_click', { ref: buttonRef })
    check('browser_click 成功', clicked?.ok === true, clicked?.summary)
    await waitFor(
      () =>
        pageView.webContents
          .executeJavaScript('document.getElementById("result").textContent')
          .then((text) => text === '已点击'),
      8000,
    )
    const clickedState = await pageView.webContents.executeJavaScript(
      'document.getElementById("result").textContent',
    )
    check('点击真的改变了页面状态', clickedState === '已点击', String(clickedState))
    check(
      '点击后页面标题同步更新',
      pageView.webContents.getTitle() === 'Fixture 已点击',
      pageView.webContents.getTitle(),
    )

    const screenshot = await call('browser_screenshot', {})
    check('browser_screenshot 产出截图引用', typeof screenshot?.artifactRefs?.[0]?.id === 'string')
    const dataUrl = await handler.readCapture(sender, {
      chatId: 'chat-fixture',
      captureId: screenshot.artifactRefs[0].id,
    })
    const png = Buffer.from(dataUrl.split(',')[1] ?? '', 'base64')
    check(
      '截图是合法 PNG',
      png.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])),
      `${png.byteLength} bytes`,
    )
    writeFileSync(join(evidenceDir, 'browser-page.png'), png)

    // 5) 默认允许的最强证据：用户把标签页全关掉（甚至关掉面板）之后，
    //    Agent 不需要任何用户动作就能重新拿到浏览器并操作真实页面。
    const openTabs = registry.site('project-fixture').state().tabs
    for (const tab of openTabs)
      await handler.closeTab(sender, { projectId: 'project-fixture', tabId: tab.id })
    await handler.detach(sender, { projectId: 'project-fixture' })
    check(
      '标签页被清空、面板视图被摘掉',
      registry.site('project-fixture').state().tabs.length === 0,
    )
    const revived = await call('browser_navigate', { url: siteUrl })
    check(
      '没有任何用户动作，Agent 自己拿回浏览器',
      revived?.ok === true,
      JSON.stringify(revived?.error ?? revived?.summary),
    )
    const revivedTabId = registry.site('project-fixture').activeTabId
    const revivedView = win.contentView.children[0]
    await waitFor(
      () =>
        revivedView.webContents
          .executeJavaScript('document.getElementById("result") ? 1 : 0')
          .then((v) => v === 1),
      10_000,
    )
    check(
      '自建的标签页真的加载了目标页面',
      revivedView.webContents.getURL() === siteUrl,
      revivedView.webContents.getURL(),
    )
    void revivedTabId

    // 6) 真实 Agent 回合：模型自己决定调用 browser_*，页面因此改变。
    const { PiRunner } = await mainServer.ssrLoadModule('/src/main/agent/pi/PiRunner.ts')
    const { WorkspaceToolScope } = await mainServer.ssrLoadModule(
      '/src/main/workspaces/WorkspaceToolScope.ts',
    )
    const model = startScriptedModel()
    await model.listen()
    const controller = new AbortController()
    const scope = await WorkspaceToolScope.create(process.cwd(), controller.signal)
    const runner = new PiRunner(join(userData, 'pi'), undefined, () => {}, registry)
    // 第 5 步重建过标签页，这里必须重新取当前挂在窗口上的那个视图。
    const liveView = win.contentView.children[0]
    await liveView.webContents.executeJavaScript(
      'document.getElementById("result").textContent = "尚未点击", "ok"',
    )
    const agentChunks = []
    for await (const chunk of runner.run({
      request: {
        runId: 'run-agent',
        turnId: 'turn-agent',
        chatId: 'chat-fixture',
        messages: [
          { id: 'm-1', role: 'user', parts: [{ type: 'text', text: '读一下页面并点击按钮' }] },
        ],
      },
      config: {
        providerId: 'fixture',
        providerName: 'Fixture',
        modelId: 'fixture',
        apiKey: 'fixture-key',
        baseUrl: model.url,
        protocol: 'openai-completions',
        reasoningLevels: [],
        contextWindow: 32768,
        maxOutputTokens: 1024,
      },
      signal: controller.signal,
      context: {
        chatId: 'chat-fixture',
        runId: 'run-agent',
        projectId: 'project-fixture',
        rootPath: process.cwd(),
        scope,
        signal: controller.signal,
        permissionMode: 'allow-all',
      },
    })) {
      agentChunks.push(chunk)
    }
    const agentOutputs = agentChunks.filter((chunk) => chunk.type === 'tool-output-available')
    const agentRead = agentOutputs.find((chunk) => chunk.toolCallId === 'agent-read')
    const agentClick = agentOutputs.find((chunk) => chunk.toolCallId === 'agent-click')
    check(
      'Agent 自己调用了 browser_read_page',
      agentRead !== undefined,
      JSON.stringify(
        agentChunks.filter((c) => c.type === 'tool-input-available').map((c) => c.toolName),
      ),
    )
    check(
      'Agent 从可访问性树里读到真实按钮与 ref',
      /\[ref_\d+\] button "点我"/.test(String(agentRead?.output?.data?.text ?? '')),
      String(agentRead?.output?.data?.text ?? '').slice(0, 120),
    )
    check(
      'Agent 用自己解析出的 ref 完成了点击',
      agentClick?.output?.ok === true,
      JSON.stringify(agentClick?.output?.error ?? agentClick?.output?.summary),
    )
    const agentState = await liveView.webContents.executeJavaScript(
      'document.getElementById("result").textContent',
    )
    check('真实页面因为 Agent 的点击而改变', agentState === '已点击', String(agentState))
    writeFileSync(
      join(evidenceDir, 'agent-tool-calls.json'),
      JSON.stringify(
        agentChunks.filter(
          (chunk) =>
            chunk.type === 'tool-input-available' || chunk.type === 'tool-output-available',
        ),
        null,
        2,
      ),
    )
    await model.close()

    const reveals = await win.webContents.executeJavaScript(
      'JSON.stringify(window.__browserReveals)',
    )
    check(
      'Agent 用浏览器时 main 通知 renderer 打开侧栏',
      JSON.parse(reveals).includes('project-fixture'),
      reveals,
    )
    const revealCount = JSON.parse(reveals).length
    check('每次工具调用都会请求一次展示（幂等）', revealCount >= 5, String(revealCount))

    const windowShot = await win.webContents.capturePage()
    writeFileSync(join(evidenceDir, 'app-window.png'), windowShot.toPNG())

    check('渲染进程断言实际执行过', rendererRan)
    mainServer.close()
    await rendererServer.close()
    await new Promise((resolvePromise) => siteServer.close(resolvePromise))
    win.destroy()
    finish(results.every((r) => r.ok) ? 0 : 1)
  }

  win.webContents.on('console-message', (_event, level, message) => {
    if (level >= 2) console.log(`[renderer] ${message}`)
  })
  win.webContents.on('did-fail-load', (_event, code, description) =>
    console.log(`[harness] renderer did-fail-load ${code} ${description}`),
  )
  const port = rendererServer.httpServer.address().port
  await win.loadURL(
    `http://127.0.0.1:${port}/tests/fixtures/browser-electron.html?fixture=${encodeURIComponent(siteUrl)}`,
  )
}

app
  .whenReady()
  .then(main)
  .catch((error) => {
    console.error(error)
    check('冒烟启动', false, error instanceof Error ? error.message : String(error))
    finish(1)
  })

process.on('exit', () => rmSync(userData, { recursive: true, force: true }))
