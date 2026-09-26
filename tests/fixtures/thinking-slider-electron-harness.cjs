const { app, BrowserWindow } = require('electron')
const [reportPath, fixtureUrl, screenshotPath] = process.argv.slice(-3)

const wait = (duration = 50) => new Promise((resolve) => setTimeout(resolve, duration))

app.commandLine.appendSwitch('no-sandbox')
app.disableHardwareAcceleration()
app.on('window-all-closed', (event) => event.preventDefault())

app
  .whenReady()
  .then(async () => {
    const window = new BrowserWindow({ show: true, width: 520, height: 420 })
    await window.loadURL(fixtureUrl)
    await wait(100)

    await window.webContents.executeJavaScript("document.querySelector('#model').click()")
    await wait()
    require('fs').writeFileSync(screenshotPath, (await window.capturePage()).toPNG())
    const prepared = await window.webContents.executeJavaScript(`(() => {
      const root = document.querySelector('[data-thinking-slider-track]')
      const track = root.querySelector('[data-slot="slider-track"]')
      const rail = root.querySelector('[data-thinking-marker-rail]')
      const markers = [...root.querySelectorAll('[data-thinking-step]')]
      const thumb = root.querySelector('[role="slider"]')
      const rootRect = root.getBoundingClientRect()
      const trackRect = track.getBoundingClientRect()
      const thumbRect = thumb.getBoundingClientRect()
      const positions = markers.map((marker) => {
        const rect = marker.getBoundingClientRect()
        return rect.left + rect.width / 2 - rootRect.left
      })
      const expectedPositions = markers.map((_, index) => 8 + (rootRect.width - 16) * index / 7)
      const maxAlignmentError = Math.max(...positions.map((position, index) => Math.abs(position - expectedPositions[index])))
      const sliderGeometry = {
        markerCount: markers.length,
        markerPositions: positions,
        maxAlignmentError,
        rootHeight: getComputedStyle(root).height,
        railHeight: getComputedStyle(track).height,
        railBorder: getComputedStyle(track).borderTopWidth,
        thumbWidth: thumbRect.width,
        thumbHeight: thumbRect.height,
        thumbBorder: getComputedStyle(thumb).borderTopWidth,
        markerInset: getComputedStyle(rail).left,
        rootWidth: rootRect.width,
        trackWidth: trackRect.width,
      }
      const lightRailColor = getComputedStyle(track).backgroundColor
      document.documentElement.classList.add('dark')
      const darkRailColor = getComputedStyle(track).backgroundColor
      document.documentElement.classList.remove('dark')
      const modelList = document.querySelector('#model-list')
      const thinkingControl = document.querySelector('[data-thinking-control]')
      const menu = document.querySelector('#model-menu')
      window.__thinkingSliderSmoke.sliderGeometry = sliderGeometry
      window.__thinkingSliderSmoke.themeColors = { light: lightRailColor, dark: darkRailColor }
      window.__thinkingSliderSmoke.modelListScrollable = modelList.scrollHeight > modelList.clientHeight
      window.__thinkingSliderSmoke.footerOutsideModelList = thinkingControl.parentElement === menu && !modelList.contains(thinkingControl)
      const start = { x: rootRect.left + 8, y: rootRect.top + rootRect.height / 2 }
      const end = { x: rootRect.left + 8 + (rootRect.width - 16) * 0.86, y: start.y }
      return { start, end }
    })()`)

    window.focus()
    await wait()
    const debuggerApi = window.webContents.debugger
    debuggerApi.attach('1.3')
    const sendMouse = (type, point, buttons, button) =>
      debuggerApi.sendCommand('Input.dispatchMouseEvent', {
        type,
        x: point.x,
        y: point.y,
        button,
        buttons,
        clickCount: 1,
      })
    await sendMouse('mouseMoved', prepared.start, 0, 'none')
    await sendMouse('mousePressed', prepared.start, 1, 'left')
    await wait(40)
    await sendMouse('mouseMoved', prepared.end, 1, 'left')
    await wait(40)
    await sendMouse('mouseReleased', prepared.end, 0, 'left')
    await wait(80)
    debuggerApi.detach()

    await window.webContents.executeJavaScript(`(() => {
      const runtime = window.__thinkingSliderSmoke
      const thumb = document.querySelector('[role="slider"]')
      runtime.draggedValue = Number(thumb.getAttribute('aria-valuenow'))
      runtime.draggedLevel = runtime.thinkingLevel
      runtime.draggedValues = [...runtime.valuesChanged]
      document.querySelector('#model').click()
    })()`)
    await wait()
    await window.webContents.executeJavaScript("document.querySelector('#model').click()")
    await wait()

    window.webContents.sendInputEvent({ type: 'keyDown', keyCode: 'TAB' })
    window.webContents.sendInputEvent({ type: 'keyUp', keyCode: 'TAB' })
    await window.webContents.executeJavaScript(
      'document.querySelector(\'[role="slider"]\').focus()',
    )
    window.webContents.sendInputEvent({ type: 'keyDown', keyCode: 'RIGHT' })
    window.webContents.sendInputEvent({ type: 'keyUp', keyCode: 'RIGHT' })
    await wait()

    const keyboard = await window.webContents.executeJavaScript(`(() => {
      const runtime = window.__thinkingSliderSmoke
      const thumb = document.querySelector('[role="slider"]')
      runtime.keyboardValue = Number(thumb.getAttribute('aria-valuenow'))
      runtime.keyboardLevel = runtime.thinkingLevel
      runtime.keyboardFocusVisible = thumb.matches(':focus-visible')
      runtime.unifiedMenu = document.querySelector('[data-thinking-value]').textContent === runtime.labels[runtime.keyboardLevel]
      return { value: runtime.keyboardValue, focusVisible: runtime.keyboardFocusVisible }
    })()`)
    await window.webContents.executeJavaScript("document.querySelector('#model').click()")
    await wait()
    await window.webContents.executeJavaScript("document.querySelector('#permission').click()")
    await wait()
    await window.webContents.executeJavaScript(
      'document.querySelector(\'[data-mode="allow-all"]\').click()',
    )
    await wait()
    const persisted = await window.webContents.executeJavaScript(
      "JSON.parse(window.name).permissionMode === 'allow-all'",
    )
    await window.webContents.executeJavaScript("document.querySelector('#send').click()")
    await wait()
    const request = await window.webContents.executeJavaScript(
      'window.__thinkingSliderSmoke.request',
    )
    await window.webContents.executeJavaScript(
      "document.querySelector('#change-after-start').click()",
    )
    await wait()

    const result = await window.webContents.executeJavaScript(`(() => {
      const runtime = window.__thinkingSliderSmoke
      const modelMenu = document.querySelector('#model-menu')
      const permissionMenu = document.querySelector('#permission-menu')
      const modelList = document.querySelector('#model-list')
      const thinkingControl = document.querySelector('[data-thinking-control]')
      return {
        menus: modelMenu.hidden && permissionMenu.hidden,
        sliderGeometry: runtime.sliderGeometry,
        themeColors: runtime.themeColors,
        draggedValue: runtime.draggedValue,
        draggedLevel: runtime.draggedLevel,
        draggedValues: runtime.draggedValues,
        valuesChanged: runtime.valuesChanged,
        keyboardValue: runtime.keyboardValue,
        keyboardLevel: runtime.keyboardLevel,
        keyboardFocusVisible: runtime.keyboardFocusVisible,
        retainedAfterReopen: Number(document.querySelector('[role="slider"]').getAttribute('aria-valuenow')) === runtime.keyboardValue,
        unifiedMenu: runtime.unifiedMenu,
        modelListScrollable: runtime.modelListScrollable,
        footerOutsideModelList: runtime.footerOutsideModelList && !modelList.contains(thinkingControl),
        persisted: ${persisted},
        thinkingPersisted: JSON.parse(window.name).thinkingLevel === runtime.keyboardLevel,
        request: ${JSON.stringify(request)},
        resumed: { ...${JSON.stringify(request)} },
        switchedAfterStart: runtime.permissionMode,
        status: document.querySelector('#status').textContent,
      }
    })()`)
    if (!keyboard.focusVisible) process.exitCode = 1
    require('fs').writeFileSync(reportPath, JSON.stringify(result))
    window.close()
    app.quit()
  })
  .catch((error) => {
    require('fs').writeFileSync(
      reportPath,
      JSON.stringify({ error: String(error), stack: error?.stack }),
    )
    console.error(error)
    process.exitCode = 1
    app.quit()
  })
