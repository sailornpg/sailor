const { app, BrowserWindow } = require('electron')
const fs = require('node:fs/promises')
const os = require('node:os')
const path = require('node:path')

const reportPath = process.argv[2]
const screenshotPath = process.argv[3]
const screenshotDir = path.dirname(screenshotPath)
const wait = (duration = 80) => new Promise((resolve) => setTimeout(resolve, duration))

app.commandLine.appendSwitch('no-sandbox')
app.disableHardwareAcceleration()
app.setPath(
  'userData',
  require('node:fs').mkdtempSync(path.join(os.tmpdir(), 'sailor-pi-tui-userdata-')),
)
if (app.dock) app.dock.hide()

const results = []
const check = (name, ok, detail) => {
  results.push({ name, ok: Boolean(ok), detail: detail ?? null })
  if (!ok) console.error(`FAIL ${name}: ${detail ?? ''}`)
}

async function setInput(window, value) {
  await window.webContents.executeJavaScript(`(() => {
    const input = document.querySelector('#slash-input')
    const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set
    setter.call(input, ${JSON.stringify(value)})
    input.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText', data: ${JSON.stringify(value)} }))
    input.focus()
  })()`)
  await wait()
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
    plugins: [react(), tailwindcss()],
    resolve: {
      alias: {
        '@': path.join(root, 'src/renderer/src'),
        '@shared': path.join(root, 'src/shared'),
      },
    },
    server: { host: '127.0.0.1', port: 0, strictPort: true },
  })
  const projectRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'sailor-pi-tui-project-'))
  await fs.mkdir(path.join(projectRoot, '.agents/skills/review'), { recursive: true })
  await fs.writeFile(
    path.join(projectRoot, '.agents/skills/review/SKILL.md'),
    '---\nname: review\ndescription: Review the current change\n---\nprivate instructions',
  )
  let commands = []
  try {
    await server.listen()
    const address = server.httpServer.address()
    const fixtureUrl = `http://127.0.0.1:${address.port}/tests/fixtures/composer-slash-electron.html`
    const { WorkspaceToolScope } = await server.ssrLoadModule(
      '/src/main/workspaces/WorkspaceToolScope.ts',
    )
    const { loadComposerSlashCommands } = await server.ssrLoadModule(
      '/src/main/agent/pi/piSlashCommands.ts',
    )
    const scope = await WorkspaceToolScope.create(projectRoot, new AbortController().signal)
    commands = await loadComposerSlashCommands(scope)
    const window = new BrowserWindow({ show: true, width: 760, height: 520 })
    await window.loadURL(`${fixtureUrl}?commands=${encodeURIComponent(JSON.stringify(commands))}`)
    await wait(300)

    await setInput(window, '/')
    const initial = await window.webContents.executeJavaScript(`({
      listbox: Boolean(document.querySelector('[role="listbox"]')),
      actions: ['settings', 'model', 'new', 'quit', 'reload', 'compact'].every((id) => Boolean(document.querySelector('[data-command-id="' + id + '"]'))),
      skill: Boolean(document.querySelector('[data-command-id="skill:review"]')),
      btw: Boolean(document.querySelector('[data-command-id="btw"]')),
      overflow: document.documentElement.scrollWidth > document.documentElement.clientWidth,
    })`)
    check(
      'slash 弹窗展示 Pi action、Skill 与 /btw',
      initial.listbox && initial.actions && initial.skill && initial.btw,
      JSON.stringify(initial),
    )
    check('action 弹窗没有横向溢出', !initial.overflow, JSON.stringify(initial))
    await fs.writeFile(
      path.join(screenshotDir, 'composer-pi-tui-actions-light.png'),
      (await window.capturePage()).toPNG(),
    )

    for (const action of ['settings', 'model', 'new', 'quit', 'reload', 'compact']) {
      await setInput(window, '')
      await setInput(window, `/${action}`)
      await window.webContents.executeJavaScript(
        `document.querySelector('[data-command-id="${action}"]').click()`,
      )
      await wait()
      const selected = await window.webContents.executeJavaScript(`({
        value: document.querySelector('#slash-input').value,
        closed: !document.querySelector('[role="listbox"]'),
        events: window.__slashSmoke.actionEvents,
      })`)
      check(
        `选择 /${action} 执行 Sailor action 并清空输入`,
        selected.value === '' && selected.closed && selected.events.at(-1) === action,
        JSON.stringify(selected),
      )
    }
    const ipcCalls = await window.webContents.executeJavaScript('window.__slashSmoke.ipcCalls')
    check(
      'quit 与 compact 走独立 action channel',
      ipcCalls.includes('app:quit') && ipcCalls.includes('agent:compact:smoke-chat'),
      JSON.stringify(ipcCalls),
    )

    await setInput(window, '/skill:review')
    await window.webContents.executeJavaScript(
      'document.querySelector(\'[data-command-id="skill:review"]\').click()',
    )
    await wait()
    const skill = await window.webContents.executeJavaScript(
      `({ value: document.querySelector('#slash-input').value, events: window.__slashSmoke.actionEvents })`,
    )
    check(
      'Skill 仍保留 literal command',
      skill.value === '/skill:review ' && !skill.events.includes('skill:review'),
      JSON.stringify(skill),
    )

    await setInput(window, '')
    await setInput(window, '/btw')
    await window.webContents.executeJavaScript(
      'document.querySelector(\'[data-command-id="btw"]\').click()',
    )
    await wait()
    const btw = await window.webContents.executeJavaScript(
      `({ value: document.querySelector('#slash-input').value, events: window.__slashSmoke.actionEvents })`,
    )
    check(
      '/btw 仍保留 literal command',
      btw.value === '/btw ' && !btw.events.includes('btw'),
      JSON.stringify(btw),
    )

    await window.setSize(420, 520)
    await wait()
    await window.webContents.executeJavaScript("document.documentElement.classList.add('dark')")
    await setInput(window, '/')
    const narrow = await window.webContents.executeJavaScript(`(() => {
      const node = document.querySelector('[role="listbox"]')
      const rect = node?.getBoundingClientRect()
      return { overflow: document.documentElement.scrollWidth > document.documentElement.clientWidth, left: rect?.left, right: rect?.right, viewport: window.innerWidth }
    })()`)
    check(
      '暗色窄窗口 action 弹窗保持在视口内',
      !narrow.overflow && narrow.left >= 0 && narrow.right <= narrow.viewport,
      JSON.stringify(narrow),
    )
    await fs.writeFile(
      path.join(screenshotDir, 'composer-pi-tui-actions-dark-narrow.png'),
      (await window.capturePage()).toPNG(),
    )
  } finally {
    await server.close()
    await fs.rm(projectRoot, { recursive: true, force: true })
  }
  await fs.writeFile(reportPath, JSON.stringify({ commands, results }))
  console.log(JSON.stringify({ commands, results }, null, 2))
  if (results.some((result) => !result.ok)) process.exitCode = 1
}

app
  .whenReady()
  .then(() =>
    main().catch((error) => {
      console.error(error)
      process.exitCode = 1
    }),
  )
  .finally(() => {
    setTimeout(() => app.quit(), 100)
  })
