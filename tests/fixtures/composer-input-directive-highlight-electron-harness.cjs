const { app, BrowserWindow } = require('electron')
const fs = require('node:fs/promises')
const os = require('node:os')
const path = require('node:path')

const reportPath = process.argv[2]
const screenshotPath = process.argv[3]
const screenshotDir = path.dirname(screenshotPath)
const wait = (duration = 100) => new Promise((resolve) => setTimeout(resolve, duration))

app.commandLine.appendSwitch('no-sandbox')
app.disableHardwareAcceleration()
app.setPath(
  'userData',
  require('node:fs').mkdtempSync(path.join(os.tmpdir(), 'sailor-composer-input-userdata-')),
)
if (app.dock) app.dock.hide()

const results = []
const check = (name, ok, detail) => {
  results.push({ name, ok: Boolean(ok), detail: detail ?? null })
  if (!ok) console.error(`FAIL ${name}: ${detail ?? ''}`)
}

async function setInput(window, value) {
  await window.webContents.executeJavaScript(`(() => {
    const input = document.querySelector('#directive-input')
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
  const projectRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'sailor-composer-input-project-'))
  await fs.mkdir(path.join(projectRoot, '.agents/skills/ai-sdk'), { recursive: true })
  await fs.writeFile(
    path.join(projectRoot, '.agents/skills/ai-sdk/SKILL.md'),
    '---\nname: ai-sdk\ndescription: AI SDK guidance\n---\nprivate skill instructions',
  )
  let commands = []
  try {
    await server.listen()
    const address = server.httpServer.address()
    const fixtureUrl = `http://127.0.0.1:${address.port}/tests/fixtures/composer-input-directive-electron.html`
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
    await window.webContents.executeJavaScript("document.documentElement.dataset.accent = 'blue'")
    await wait()

    await setInput(window, '/')
    await window.webContents.executeJavaScript(
      'document.querySelector(\'[data-command-id=\\"skill:ai-sdk\\"]\').click()',
    )
    await wait()
    const selected = await window.webContents.executeJavaScript(`(() => {
      const input = document.querySelector('#directive-input')
      const layer = document.querySelector('[data-composer-directive-layer]')
      const token = document.querySelector('[data-composer-directive-token]')
      const icon = token?.querySelector('svg')
      const label = document.querySelector('[data-composer-directive-label]')
      const inputStyle = getComputedStyle(input)
      const tokenStyle = token ? getComputedStyle(token) : null
      const layerStyle = layer ? getComputedStyle(layer) : null
      return {
        value: input?.value,
        focused: document.activeElement === input,
        selectionStart: input?.selectionStart,
        selectionEnd: input?.selectionEnd,
        token: Boolean(token),
        tokenId: token?.getAttribute('data-composer-directive-id'),
        label: label?.textContent,
        icon: Boolean(icon),
        inputColor: inputStyle?.color,
        textFill: inputStyle?.webkitTextFillColor,
        tokenColor: tokenStyle?.color,
        layerPointerEvents: layerStyle?.pointerEvents,
        caret: Boolean(document.querySelector('[data-composer-directive-caret]')),
        overflow: document.documentElement.scrollWidth > document.documentElement.clientWidth,
      }
    })()`)
    const literal = selected.value
    const literalEnd = typeof literal === 'string' ? literal.length : -1
    check('选择 Skill 后保留 literal 文本', literal === '/skill:ai-sdk ', JSON.stringify(selected))
    check(
      '选择 Skill 后显示 directive token 与图标',
      selected.token &&
        selected.tokenId === 'skill:ai-sdk' &&
        selected.icon &&
        selected.label === 'Ai Sdk',
      JSON.stringify(selected),
    )
    check(
      'token 视觉层使用蓝色 accent 且 textarea 文本透明',
      selected.tokenColor === 'rgb(57, 120, 223)' && selected.textFill.includes('0, 0, 0, 0'),
      JSON.stringify(selected),
    )
    check(
      'token overlay 不拦截输入事件',
      selected.layerPointerEvents === 'none',
      JSON.stringify(selected),
    )
    check(
      '光标位于 token 后且输入框保持焦点',
      selected.focused &&
        selected.selectionStart === literalEnd &&
        selected.selectionEnd === literalEnd &&
        selected.caret,
      JSON.stringify(selected),
    )
    check('token 场景没有横向溢出', !selected.overflow, JSON.stringify(selected))
    await fs.writeFile(
      path.join(screenshotDir, 'composer-input-directive-light.png'),
      (await window.capturePage()).toPNG(),
    )

    await window.webContents.executeJavaScript("document.querySelector('#send-directive').click()")
    await wait()
    const sent = await window.webContents.executeJavaScript('window.__directiveSmoke.sent')
    check('发送仍使用 literal command', sent === '/skill:ai-sdk', JSON.stringify({ sent }))

    await setInput(window, '')
    await setInput(window, '/skill:ai-sdk')
    const typed = await window.webContents.executeJavaScript(`({
      value: document.querySelector('#directive-input').value,
      token: Boolean(document.querySelector('[data-composer-directive-token]')),
      color: getComputedStyle(document.querySelector('#directive-input')).color,
    })`)
    check(
      '普通手输 /skill:* 保持 literal 视觉',
      typed.value === '/skill:ai-sdk' && !typed.token && typed.color !== 'rgba(0, 0, 0, 0)',
      JSON.stringify(typed),
    )

    await setInput(window, '/')
    await window.webContents.executeJavaScript(
      'document.querySelector(\'[data-command-id=\\"skill:ai-sdk\\"]\').click()',
    )
    await wait()
    await setInput(window, 'changed')
    const edited = await window.webContents.executeJavaScript(`({
      value: document.querySelector('#directive-input').value,
      token: Boolean(document.querySelector('[data-composer-directive-token]')),
      color: getComputedStyle(document.querySelector('#directive-input')).color,
    })`)
    check(
      '编辑已选 directive 后回退普通文本',
      edited.value === 'changed' && !edited.token && edited.color !== 'rgba(0, 0, 0, 0)',
      JSON.stringify(edited),
    )

    await setInput(window, '/')
    await window.webContents.executeJavaScript(
      'document.querySelector(\'[data-command-id=\\"skill:ai-sdk\\"]\').click()',
    )
    await wait()
    await window.setSize(420, 520)
    await window.webContents.executeJavaScript("document.documentElement.classList.add('dark')")
    await wait()
    const narrow = await window.webContents.executeJavaScript(`(() => {
      const input = document.querySelector('#directive-input')
      const layer = document.querySelector('[data-composer-directive-layer]')
      const token = document.querySelector('[data-composer-directive-token]')
      const rect = token?.getBoundingClientRect()
      return {
        token: Boolean(token),
        darkColor: token ? getComputedStyle(token).color : null,
        inputRect: input?.getBoundingClientRect().toJSON(),
        tokenRect: rect?.toJSON(),
        overflow: document.documentElement.scrollWidth > document.documentElement.clientWidth,
        inViewport: Boolean(rect && rect.left >= 0 && rect.right <= window.innerWidth),
      }
    })()`)
    check(
      '亮暗主题与窄窗口下 token 保持可见',
      narrow.token && narrow.darkColor && !narrow.overflow && narrow.inViewport,
      JSON.stringify(narrow),
    )
    await fs.writeFile(screenshotPath, (await window.capturePage()).toPNG())
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
