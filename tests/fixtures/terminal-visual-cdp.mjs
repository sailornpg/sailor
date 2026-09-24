// CDP driver for the real packaged app: opens the terminal panel through the actual
// renderer/preload/IPC path, drives real input, and captures acceptance screenshots.
import { execFileSync } from 'node:child_process'
import fs from 'node:fs'

export const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

export async function connectToApp(port, timeoutMs = 45000) {
  const deadline = Date.now() + timeoutMs
  let page = null
  while (Date.now() < deadline) {
    try {
      const targets = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json()
      page = targets.find((target) => target.type === 'page' && typeof target.webSocketDebuggerUrl === 'string')
      if (page) break
    } catch {
      // The app is still starting.
    }
    await sleep(400)
  }
  if (!page) throw new Error(`CDP 页面在 ${timeoutMs}ms 内没有就绪`)
  return { ...(await connectToUrl(page.webSocketDebuggerUrl)), page }
}

export async function connectToUrl(wsUrl) {
  const socket = new WebSocket(wsUrl)
  await new Promise((resolve, reject) => {
    socket.onopen = resolve
    socket.onerror = () => reject(new Error('CDP WebSocket 连接失败'))
  })

  let nextId = 0
  const pending = new Map()
  socket.onmessage = (event) => {
    const message = JSON.parse(event.data)
    const entry = message.id ? pending.get(message.id) : undefined
    if (!entry) return
    pending.delete(message.id)
    if (message.error) entry.reject(new Error(message.error.message))
    else entry.resolve(message.result)
  }

  const send = (method, params = {}) =>
    new Promise((resolve, reject) => {
      const id = ++nextId
      pending.set(id, { resolve, reject })
      socket.send(JSON.stringify({ id, method, params }))
    })

  return { send, close: () => socket.close() }
}

export function createClient(cdp) {
  const evaluate = async (expression) => {
    const result = await cdp.send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true })
    if (result.exceptionDetails) throw new Error(result.exceptionDetails.text ?? 'renderer 求值失败')
    return result.result?.value
  }

  const waitFor = async (expression, label, timeoutMs = 30000) => {
    const deadline = Date.now() + timeoutMs
    while (Date.now() < deadline) {
      try {
        if (await evaluate(expression)) return true
      } catch {
        // Navigation can briefly invalidate the context.
      }
      await sleep(250)
    }
    throw new Error(`等待超时：${label}`)
  }

  const screenshot = async (file) => {
    const result = await cdp.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false })
    fs.writeFileSync(file, Buffer.from(result.data, 'base64'))
    return file
  }

  /** Clicks the first element whose text contains the given label. */
  const clickText = async (selector, text) => {
    const clicked = await evaluate(`(() => {
      const nodes = [...document.querySelectorAll(${JSON.stringify(selector)})];
      const node = nodes.find((candidate) => (candidate.textContent || '').includes(${JSON.stringify(text)}));
      if (!node) return false;
      node.click();
      return true;
    })()`)
    if (!clicked) throw new Error(`找不到包含「${text}」的 ${selector}`)
    await sleep(300)
  }

  const typeText = async (text) => {
    await cdp.send('Input.insertText', { text })
    await sleep(120)
  }

  const pressKey = async (key, code, modifiers = 0, extra = {}) => {
    const base = { key, code, modifiers, windowsVirtualKeyCode: extra.keyCode, nativeVirtualKeyCode: extra.keyCode }
    await cdp.send('Input.dispatchKeyEvent', { type: 'keyDown', ...base, text: extra.text })
    await cdp.send('Input.dispatchKeyEvent', { type: 'keyUp', ...base })
    await sleep(extra.settleMs ?? 120)
  }

  const pressEnter = () => pressKey('Enter', 'Enter', 0, { keyCode: 13 })
  const pressCtrlC = () => pressKey('c', 'KeyC', 2, { keyCode: 67, text: '\u0003' })
  // Chromium only routes clipboard shortcuts to the page when the command is requested
  // explicitly, so `commands` is what makes Cmd+V/Cmd+C behave like a real keystroke.
  const pressMetaCommand = async (letter, keyCode, command) => {
    const base = { key: letter, code: `Key${letter.toUpperCase()}`, modifiers: 4, windowsVirtualKeyCode: keyCode, nativeVirtualKeyCode: keyCode }
    await cdp.send('Input.dispatchKeyEvent', { type: 'rawKeyDown', ...base, commands: [command] })
    await cdp.send('Input.dispatchKeyEvent', { type: 'keyUp', ...base })
    await sleep(400)
  }
  const paste = () => pressMetaCommand('v', 86, 'paste')
  const copy = () => pressMetaCommand('c', 67, 'copy')

  const ACTIVE_SURFACE = '.panel-terminal-surface[data-active="true"]'
  const termRows = () => evaluate(`(() => { const rows = document.querySelector('${ACTIVE_SURFACE} .xterm-rows'); return rows ? rows.innerText : '' })()`)
  const termSize = () =>
    evaluate(`(() => {
      const surface = document.querySelector('${ACTIVE_SURFACE}');
      const screen = surface && surface.querySelector('.xterm-screen');
      const rows = surface && surface.querySelector('.xterm-rows');
      if (!surface || !screen || !rows) return null;
      const rect = screen.getBoundingClientRect();
      return {
        width: Math.round(rect.width),
        height: Math.round(rect.height),
        lines: rows.children.length,
        surface: surface ? surface.clientWidth : null,
      };
    })()`)

  const focusTerminal = async () => {
    await evaluate(`(() => {
      const textarea = document.querySelector('${ACTIVE_SURFACE} .xterm-helper-textarea') || document.querySelector('.xterm-helper-textarea');
      if (textarea) textarea.focus();
      return Boolean(textarea);
    })()`)
    await sleep(150)
  }

  const clickSelector = async (selector) => {
    const clicked = await evaluate(`(() => { const node = document.querySelector(${JSON.stringify(selector)}); if (!node) return false; node.click(); return true })()`)
    await sleep(350)
    return clicked
  }

  const clickNth = async (selector, index) => {
    const clicked = await evaluate(`(() => { const nodes = [...document.querySelectorAll(${JSON.stringify(selector)})]; const node = nodes[${index}]; if (!node) return false; node.click(); return true })()`)
    await sleep(400)
    return clicked
  }

  const clickTab = async (label) => {
    const clicked = await evaluate(`(() => {
      const tabs = [...document.querySelectorAll('.panel-terminal-tab-trigger')];
      const tab = tabs.find((candidate) => (candidate.textContent || '').includes(${JSON.stringify(label)}));
      if (!tab) return false;
      tab.click();
      return true;
    })()`)
    await sleep(500)
    return clicked
  }

  const tabLabels = () => evaluate("[...document.querySelectorAll('.panel-terminal-tab-label')].map((node) => node.textContent)")

  const tabStatuses = () => evaluate("[...document.querySelectorAll('.panel-terminal-tab-dot')].map((node) => node.getAttribute('data-status'))")

  const addButtonDisabled = () => evaluate("(() => { const node = document.querySelector('.panel-terminal-tab-add'); return node ? node.disabled : null })()")

  const addButtonHint = () => evaluate("(() => { const node = document.querySelector('.panel-terminal-tab-add'); return node ? node.getAttribute('title') : null })()")

  const selectRow = async (text) => {
    const point = await evaluate(`(() => {
      const rows = [...document.querySelectorAll('${ACTIVE_SURFACE} .xterm-rows > div')];
      const row = rows.find((candidate) => (candidate.textContent || '').includes(${JSON.stringify(text)}));
      if (!row) return null;
      const rect = row.getBoundingClientRect();
      return { x: Math.round(rect.left + 30), y: Math.round(rect.top + rect.height / 2) };
    })()`)
    if (!point) return false
    await cdp.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: point.x, y: point.y, button: 'left', clickCount: 3 })
    await cdp.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: point.x, y: point.y, button: 'left', clickCount: 3 })
    await sleep(300)
    return true
  }

  const typeCommand = async (command) => {
    await focusTerminal()
    await typeText(command)
    await pressEnter()
  }

  const waitForOutput = async (text, timeoutMs = 20000) => {
    const deadline = Date.now() + timeoutMs
    while (Date.now() < deadline) {
      const rows = await termRows()
      if (rows.includes(text)) return true
      await sleep(300)
    }
    return false
  }

  return {
    evaluate,
    waitFor,
    screenshot,
    clickText,
    clickSelector,
    clickNth,
    clickTab,
    tabLabels,
    tabStatuses,
    addButtonDisabled,
    addButtonHint,
    typeText,
    pressKey,
    pressEnter,
    pressCtrlC,
    paste,
    copy,
    selectRow,
    termRows,
    termSize,
    focusTerminal,
    typeCommand,
    waitForOutput,
  }
}

export function readClipboard() {
  try {
    return execFileSync('pbpaste', { encoding: 'utf8' })
  } catch {
    return ''
  }
}

export function writeClipboard(text) {
  execFileSync('pbcopy', { input: text })
}
