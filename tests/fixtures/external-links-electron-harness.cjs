const assert = require('node:assert/strict')
const { createServer } = require('node:http')
const { join } = require('node:path')
const { app, BrowserWindow, shell } = require('electron')

const temp = process.argv[2]
app.setPath('userData', join(temp, 'user-data'))
app.disableHardwareAcceleration()
if (app.dock) app.dock.hide()

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
const opened = []
let rejectOpen = false
shell.openExternal = async (url) => {
  opened.push(url)
  if (rejectOpen) throw new Error('Browser unavailable (test)')
}
const unhandled = []
process.on('unhandledRejection', (error) => unhandled.push(error))

app.whenReady().then(async () => {
  const server = createServer((_request, response) => {
    response.setHeader('Content-Type', 'text/html')
    response.end(
      '<!doctype html><title>Conversation</title><p id="conversation">Current chat</p><a id="link">Preview</a><div id="section">Section</div>',
    )
  })
  let window
  try {
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
    const base = `http://127.0.0.1:${server.address().port}`
    const { createMainWindow } = require(join(temp, 'main/window.cjs'))
    window = createMainWindow()
    const home = `${base}/chat`
    await window.loadURL(home)
    await window.webContents.executeJavaScript('window.conversationMarker = "preserved"')

    const click = async (href, target = '') => {
      await window.webContents.executeJavaScript(
        `(() => {
        const link = document.querySelector('#link')
        link.href = ${JSON.stringify(href)}
        link.target = ${JSON.stringify(target)}
        link.click()
      })()`,
        true,
      )
      await wait(150)
    }
    const assertPreserved = async () => {
      assert.equal(window.webContents.getURL(), home, '链接不能替换 Sailor 主窗口')
      assert.equal(
        await window.webContents.executeJavaScript('window.conversationMarker'),
        'preserved',
      )
      assert.equal(BrowserWindow.getAllWindows().length, 1)
    }

    // This is the ordinary anchor navigation emitted by conversation Markdown.
    await click(`${base}/preview`)
    await assertPreserved()
    assert.deepEqual(opened.splice(0), [`${base}/preview`], '普通链接应交给默认浏览器')
    for (const target of ['', '_blank']) {
      for (const url of [
        'https://example.com/docs?q=sailor#intro',
        'http://localhost:5173/preview',
      ]) {
        await click(url, target)
        await assertPreserved()
        assert.deepEqual(opened.splice(0), [url])
      }
    }
    for (const url of [
      'file:///tmp/sailor-link-test',
      'data:text/html,preview',
      'sailor-test://preview',
    ]) {
      await click(url, '_blank')
      await assertPreserved()
      assert.deepEqual(opened, [], '非网页协议不得交给系统执行')
    }
    rejectOpen = true
    await click('https://example.com/unavailable')
    await assertPreserved()
    assert.deepEqual(opened.splice(0), ['https://example.com/unavailable'])
    assert.deepEqual(unhandled, [], '浏览器打开失败应处理 Promise rejection')

    await click('#section')
    assert.equal(window.webContents.getURL(), `${home}#section`)
    assert.equal(
      await window.webContents.executeJavaScript('window.conversationMarker'),
      'preserved',
    )
    assert.deepEqual(opened, [], '页内锚点不应启动浏览器')
    console.log(
      'PASS external links Electron: same-window, new-window, HTTP(S), localhost, unsupported schemes, browser failure, anchors',
    )
  } catch (error) {
    console.error(error)
    process.exitCode = 1
  } finally {
    window?.destroy()
    server.close()
    app.exit(process.exitCode ?? 0)
  }
})
