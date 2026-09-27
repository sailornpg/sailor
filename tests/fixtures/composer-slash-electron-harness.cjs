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
  require('node:fs').mkdtempSync(path.join(os.tmpdir(), 'sailor-slash-userdata-')),
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
  const projectRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'sailor-slash-project-'))
  let commands = []
  await fs.mkdir(path.join(projectRoot, '.agents/skills/review'), { recursive: true })
  await fs.writeFile(
    path.join(projectRoot, '.agents/skills/review/SKILL.md'),
    '---\nname: review\ndescription: Review the current change\n---\nsecret skill instructions',
  )

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
    const fixtureCommands = [
      ...commands,
      ...Array.from({ length: 24 }, (_, index) => {
        const name = `example-${String(index + 1).padStart(2, '0')}`
        return {
          id: `skill:${name}`,
          label: `skill:${name}`,
          description: '用于视觉验收的长列表 Skill',
          source: 'skill',
          icon: 'Sparkles',
          argumentHint: '[参数]',
        }
      }),
    ]
    const window = new BrowserWindow({ show: true, width: 760, height: 520 })
    await window.loadURL(
      `${fixtureUrl}?commands=${encodeURIComponent(JSON.stringify(fixtureCommands))}`,
    )
    await wait(300)

    await setInput(window, '/')
    await fs.writeFile(
      path.join(screenshotDir, 'composer-slash-popup-light.png'),
      (await window.capturePage()).toPNG(),
    )
    const initial = await window.webContents.executeJavaScript(`({
      listbox: Boolean(document.querySelector('[role="listbox"]')),
      review: Boolean(document.querySelector('[data-command-id="skill:review"]')),
      btw: Boolean(document.querySelector('[data-command-id="btw"]')),
      longList: Boolean(document.querySelector('[data-command-id="skill:example-24"]')),
      focused: document.activeElement?.id === 'slash-input',
      overflow: document.documentElement.scrollWidth > document.documentElement.clientWidth,
    })`)
    check('输入 / 打开官方 slash listbox', initial.listbox, JSON.stringify(initial))
    check('真实工作区 Skill 出现在弹窗', initial.review, JSON.stringify(initial))
    check('/btw 出现在 Sailor 命令组', initial.btw, JSON.stringify(initial))
    check('长 Skill 列表仍渲染到弹窗内', initial.longList, JSON.stringify(initial))
    check('打开弹窗后输入框保持焦点', initial.focused, JSON.stringify(initial))
    check('弹窗没有制造横向溢出', !initial.overflow, JSON.stringify(initial))

    window.webContents.debugger.attach('1.3')
    const dispatchKey = async (key, code, keyCode) => {
      await window.webContents.debugger.sendCommand('Input.dispatchKeyEvent', {
        type: 'keyDown',
        key,
        code,
        windowsVirtualKeyCode: keyCode,
        nativeVirtualKeyCode: keyCode,
      })
      await window.webContents.debugger.sendCommand('Input.dispatchKeyEvent', {
        type: 'keyUp',
        key,
        code,
        windowsVirtualKeyCode: keyCode,
        nativeVirtualKeyCode: keyCode,
      })
    }
    for (let index = 0; index < 14; index += 1) {
      await dispatchKey('ArrowDown', 'ArrowDown', 40)
    }
    await wait()
    const navigatedDown = await window.webContents.executeJavaScript(`(() => {
      const list = document.querySelector('[role="listbox"]')
      const highlighted = list?.querySelector('[data-highlighted]')
      if (!list || !highlighted) return null
      const listRect = list.getBoundingClientRect()
      const itemRect = highlighted.getBoundingClientRect()
      return {
        scrollTop: list.scrollTop,
        highlighted: highlighted.getAttribute('data-command-id'),
        visible: itemRect.top >= listRect.top && itemRect.bottom <= listRect.bottom,
      }
    })()`)
    check(
      'ArrowDown 后列表自动滚动到当前高亮项',
      Boolean(navigatedDown && navigatedDown.scrollTop > 0 && navigatedDown.visible),
      JSON.stringify(navigatedDown),
    )
    for (let index = 0; index < 14; index += 1) {
      await dispatchKey('ArrowUp', 'ArrowUp', 38)
    }
    await wait()
    const navigatedUp = await window.webContents.executeJavaScript(`(() => {
      const list = document.querySelector('[role="listbox"]')
      const highlighted = list?.querySelector('[data-highlighted]')
      if (!list || !highlighted) return null
      const listRect = list.getBoundingClientRect()
      const itemRect = highlighted.getBoundingClientRect()
      return {
        scrollTop: list.scrollTop,
        highlighted: highlighted.getAttribute('data-command-id'),
        visible: itemRect.top >= listRect.top && itemRect.bottom <= listRect.bottom,
      }
    })()`)
    check(
      'ArrowUp 后列表回滚并保持当前高亮项可见',
      Boolean(
        navigatedUp &&
        navigatedDown &&
        navigatedUp.scrollTop < navigatedDown.scrollTop &&
        navigatedUp.visible,
      ),
      JSON.stringify({ down: navigatedDown, up: navigatedUp }),
    )

    await window.setSize(420, 520)
    await wait()
    const narrow = await window.webContents.executeJavaScript(`({
      overflow: document.documentElement.scrollWidth > document.documentElement.clientWidth,
      popover: (() => {
        const node = document.querySelector('[role="listbox"]')
        if (!node) return null
        const rect = node.getBoundingClientRect()
        return { left: rect.left, right: rect.right, viewport: window.innerWidth }
      })(),
    })`)
    await fs.writeFile(
      path.join(screenshotDir, 'composer-slash-popup-narrow-light.png'),
      (await window.capturePage()).toPNG(),
    )
    check(
      '窄窗口弹窗保持在视口内且无横向溢出',
      !narrow.overflow &&
        Boolean(narrow.popover) &&
        narrow.popover.left >= 0 &&
        narrow.popover.right <= narrow.popover.viewport,
      JSON.stringify(narrow),
    )

    await window.webContents.debugger.sendCommand('Input.dispatchKeyEvent', {
      type: 'keyDown',
      key: 'Escape',
      code: 'Escape',
      windowsVirtualKeyCode: 27,
      nativeVirtualKeyCode: 27,
    })
    await window.webContents.debugger.sendCommand('Input.dispatchKeyEvent', {
      type: 'keyUp',
      key: 'Escape',
      code: 'Escape',
      windowsVirtualKeyCode: 27,
      nativeVirtualKeyCode: 27,
    })
    await wait()
    const escaped = await window.webContents.executeJavaScript(`({
      closed: !document.querySelector('[role="listbox"]'),
      focused: document.activeElement?.id === 'slash-input',
    })`)
    check(
      'Escape 关闭弹窗并恢复输入焦点',
      escaped.closed && escaped.focused,
      JSON.stringify(escaped),
    )

    await window.setSize(760, 520)
    await wait()
    await setInput(window, '')
    await setInput(window, '/')

    await window.webContents.executeJavaScript(
      `document.querySelector('[data-command-id="skill:review"]').click()`,
    )
    await wait()
    const skillSelection = await window.webContents.executeJavaScript(`({
      value: document.querySelector('#slash-input').value,
      listboxClosed: !document.querySelector('[role="listbox"]'),
    })`)
    check(
      '选择 Skill 后保留 literal /skill:review 输入',
      skillSelection.value === '/skill:review ',
      JSON.stringify(skillSelection),
    )
    check('选择 Skill 后关闭弹窗', skillSelection.listboxClosed, JSON.stringify(skillSelection))

    await window.webContents.executeJavaScript("document.querySelector('#clear').click()")
    await setInput(window, '/btw')
    await window.webContents.executeJavaScript(
      `document.querySelector("[data-command-id='btw']").click()`,
    )
    await wait()
    const btwSelection = await window.webContents.executeJavaScript(`({
      value: document.querySelector('#slash-input').value,
      listboxClosed: !document.querySelector('[role="listbox"]'),
    })`)
    check(
      '选择 /btw 后保留 literal 命令',
      btwSelection.value === '/btw ',
      JSON.stringify(btwSelection),
    )
    await window.webContents.executeJavaScript("document.querySelector('#send').click()")
    await wait()
    const sideChat = await window.webContents.executeJavaScript(`({
      sent: window.__slashSmoke.sent,
      opened: window.__slashSmoke.sideChatOpened === true,
      label: document.querySelector('#side-chat-state').textContent,
    })`)
    check(
      '发送 /btw 进入只读侧聊入口',
      sideChat.opened && sideChat.sent === '/btw',
      JSON.stringify(sideChat),
    )

    await window.webContents.executeJavaScript(`document.documentElement.classList.add('dark')`)
    await wait()
    await setInput(window, '/')
    await fs.writeFile(
      path.join(screenshotDir, 'composer-slash-popup-dark.png'),
      (await window.capturePage()).toPNG(),
    )
    await window.webContents.executeJavaScript("document.querySelector('#clear').click()")
    await setInput(window, '/btw')
    await window.webContents.executeJavaScript("document.querySelector('#send').click()")
    await wait()
    await fs.writeFile(screenshotPath, (await window.capturePage()).toPNG())
    if (process.env.SAILOR_KEEP_SMOKE_ARTIFACTS === '1') {
      console.log(`Electron visual evidence: ${screenshotDir}`)
    }
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
