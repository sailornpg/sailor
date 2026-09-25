// Real-Electron + packaged-app acceptance for the workspace terminal.
//
// Phase 1 runs tests/fixtures/terminal-electron-harness.cjs inside Electron's main
// process and drives the real PTY service against a real login shell.
// Phase 2 probes the packaged macOS artifact (node-pty prebuild, executable
// spawn-helper, asar-unpacked spawn path).
// Phase 3 launches the packaged app, opens the terminal through the real
// renderer/preload/IPC path, drives real input and captures screenshots that a human
// still has to look at (`.agent-harness/evidence/workspace-terminal/`).
import { spawn, spawnSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  connectToApp,
  createClient,
  readClipboard,
  sleep,
  writeClipboard,
} from './fixtures/terminal-visual-cdp.mjs'

const here = path.dirname(fileURLToPath(import.meta.url))
const root = path.resolve(here, '..')
const evidenceDir = path.join(root, '.agent-harness', 'evidence')
const shotDir = path.join(evidenceDir, 'workspace-terminal')
const reportPath = path.join(evidenceDir, 'workspace-terminal-report.json')
const debugPort = 9400 + (process.pid % 400)

const results = []
function check(name, ok, detail) {
  results.push({ name, ok: Boolean(ok), detail: detail === undefined ? null : detail })
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${detail ? ` — ${detail}` : ''}`)
}

/** Last `stty size` answer in the rendered terminal text, e.g. { rows: 40, cols: 120 }. */
function parseSttySize(text) {
  const matches = [...String(text ?? '').matchAll(/^\s*(\d{1,4})\s+(\d{1,4})\s*$/gm)]
  const last = matches.at(-1)
  return last ? { rows: Number(last[1]), cols: Number(last[2]) } : null
}

const electronBinary = path.join(
  root,
  'node_modules',
  'electron',
  'dist',
  'Electron.app',
  'Contents',
  'MacOS',
  'Electron',
)
const packagedApp = path.join(root, 'dist', 'mac-arm64', 'Sailor.app')
const packagedBinary = path.join(packagedApp, 'Contents', 'MacOS', 'Sailor')

/**
 * The packaged app is the subject of phases 2 and 3. This repository's `node` on PATH
 * is the desktop harness shim, which swallows electron-builder's CLI arguments, so the
 * build runs with a real Node first on PATH when one is available.
 */
function newestMtimeMs(directory) {
  let newest = 0
  const walk = (current) => {
    let entries
    try {
      entries = fs.readdirSync(current, { withFileTypes: true })
    } catch {
      return
    }
    for (const entry of entries) {
      const full = path.join(current, entry.name)
      if (entry.isDirectory()) walk(full)
      else {
        try {
          newest = Math.max(newest, fs.statSync(full).mtimeMs)
        } catch {
          // ignore unreadable entries
        }
      }
    }
  }
  walk(directory)
  return newest
}

function isOlderThan(file, referenceMs) {
  try {
    return fs.statSync(file).mtimeMs < referenceMs
  } catch {
    return true
  }
}

function ensurePackagedApp() {
  const outIndex = path.join(root, 'out', 'renderer', 'index.html')
  const sourceMs = Math.max(
    newestMtimeMs(path.join(root, 'src')),
    newestMtimeMs(
      path.join(root, 'package.json').replace('package.json', 'electron.vite.config.ts'),
    ),
  )
  if (!fs.existsSync(outIndex) || isOlderThan(outIndex, sourceMs)) {
    console.log('building out/ (electron-vite)…')
    const built = spawnSync('pnpm', ['run', 'build'], {
      cwd: root,
      env: childEnv(),
      encoding: 'utf8',
      timeout: 900000,
    })
    if (built.status !== 0) {
      check(
        '应用构建',
        false,
        (built.stdout ?? built.stderr ?? '').split('\n').slice(-4).join(' | '),
      )
      return false
    }
  }
  const outMs = newestMtimeMs(path.join(root, 'out'))
  if (fs.existsSync(packagedBinary) && !isOlderThan(packagedBinary, outMs)) return true
  const candidates = [
    path.join(os.homedir(), '.nvm', 'versions', 'node'),
    '/usr/local/bin',
    '/opt/homebrew/bin',
  ]
  const realNodeDir = candidates.find((directory) => {
    try {
      return fs.readdirSync(directory).some((entry) => entry === 'node' || /^v\d/.test(entry))
    } catch {
      return false
    }
  })
  const env = childEnv()
  if (realNodeDir) {
    const resolved = fs.existsSync(path.join(realNodeDir, 'node'))
      ? realNodeDir
      : path.join(
          realNodeDir,
          fs
            .readdirSync(realNodeDir)
            .filter((entry) => /^v\d/.test(entry))
            .sort()
            .at(-1),
          'bin',
        )
    env.PATH = `${resolved}:${env.PATH}`
  }
  console.log('packaging dist/mac-arm64/Sailor.app (electron-builder --mac --dir)…')
  const built = spawnSync('pnpm', ['exec', 'electron-builder', '--mac', '--dir'], {
    cwd: root,
    env,
    encoding: 'utf8',
    timeout: 900000,
  })
  if (!fs.existsSync(packagedBinary)) {
    check(
      '打包 macOS 产物',
      false,
      (built.stdout ?? built.stderr ?? '').split('\n').slice(-4).join(' | '),
    )
    return false
  }
  return true
}

function childEnv() {
  const env = { ...process.env, ELECTRON_DISABLE_SECURITY_WARNINGS: '1' }
  delete env.ELECTRON_RUN_AS_NODE
  return env
}

function runPhase1() {
  const reportFile = path.join(os.tmpdir(), `sailor-terminal-harness-${process.pid}.json`)
  const result = spawnSync(
    electronBinary,
    [path.join(here, 'fixtures', 'terminal-electron-harness.cjs'), reportFile],
    {
      cwd: root,
      env: childEnv(),
      encoding: 'utf8',
      timeout: 180000,
    },
  )
  let report = null
  try {
    report = JSON.parse(fs.readFileSync(reportFile, 'utf8'))
    fs.rmSync(reportFile, { force: true })
  } catch {
    // fall through: the harness crashed
  }
  const failed = report
    ? report.results.filter((entry) => !entry.ok)
    : [{ name: 'harness 报告', detail: result.stderr?.slice(-400) ?? 'missing' }]
  check(
    '真实 Electron 中的 PTY 生命周期与清理',
    Boolean(report?.ok),
    failed.map((entry) => entry.name).join(', ') || 'all checks passed',
  )
  return report
}

function runPhase2() {
  check('打包 macOS 产物存在', fs.existsSync(packagedBinary), packagedApp)
  const resources = path.join(packagedApp, 'Contents', 'Resources')
  const unpacked = path.join(resources, 'app.asar.unpacked', 'node_modules', 'node-pty')
  const prebuilt = path.join(unpacked, 'prebuilds', 'darwin-arm64')
  check('打包产物包含 node-pty prebuild', fs.existsSync(path.join(prebuilt, 'pty.node')), prebuilt)
  const helper = path.join(prebuilt, 'spawn-helper')
  const helperMode = fs.existsSync(helper) ? fs.statSync(helper).mode & 0o777 : 0
  check(
    '打包后的 spawn-helper 可执行',
    (helperMode & 0o111) === 0o111,
    `mode ${helperMode.toString(8)}`,
  )
  check('打包产物解压了 node-pty（asarUnpack）', fs.existsSync(unpacked), unpacked)

  const probe = path.join(os.tmpdir(), `sailor-packaged-pty-probe-${process.pid}.cjs`)
  fs.writeFileSync(
    probe,
    [
      'const pty = require(process.argv[2]);',
      "let out = '';",
      'try {',
      "  const child = pty.spawn('/bin/zsh', ['-l'], { cols: 80, rows: 24, cwd: process.cwd(), env: { ...process.env, TERM: 'xterm-256color' } });",
      '  child.onData((data) => { out += data; });',
      "  setTimeout(() => child.write('echo packaged-$((6*7))\\r'), 400);",
      '  setTimeout(() => {',
      '    child.kill();',
      '    const ok = /packaged-42/.test(out);',
      "    console.log(ok ? 'packaged-pty-ok' : 'packaged-pty-missing');",
      '    process.exit(ok ? 0 : 1);',
      '  }, 2200);',
      '} catch (error) {',
      "  console.log('SPAWN_ERR', error.message);",
      '  process.exit(1);',
      '}',
    ].join('\n'),
  )
  const binary = packagedBinary
  const result = spawnSync(
    binary,
    [probe, path.join(resources, 'app.asar', 'node_modules', 'node-pty')],
    {
      env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' },
      encoding: 'utf8',
      timeout: 60000,
    },
  )
  fs.rmSync(probe, { force: true })
  check(
    '打包应用可加载并运行 node-pty',
    result.stdout?.includes('packaged-pty-ok') ?? false,
    (result.stdout ?? result.stderr ?? '').trim().split('\n').slice(-2).join(' | '),
  )
}

function seedUserData(userDataDir, projectDir) {
  fs.mkdirSync(userDataDir, { recursive: true })
  fs.writeFileSync(
    path.join(userDataDir, 'workspaces.json'),
    JSON.stringify(
      {
        version: 1,
        projects: [{ id: 'project-terminal', name: 'terminal-demo', rootPath: projectDir }],
        chats: [
          {
            id: 'chat-terminal',
            projectId: 'project-terminal',
            title: '终端验收',
            updatedAt: Date.now(),
            runId: null,
            status: 'idle',
            unread: false,
            error: null,
            messages: [],
          },
        ],
        activeChatId: 'chat-terminal',
        collapsedProjectIds: [],
      },
      null,
      2,
    ),
  )
}

function launchPackagedApp(userDataDir, port) {
  const args = [`--user-data-dir=${userDataDir}`, `--remote-debugging-port=${port}`, '--no-sandbox']
  if (process.platform !== 'darwin') {
    const processHandle = spawn(packagedBinary, args, {
      env: childEnv(),
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    return { processHandle, appPid: () => processHandle.pid }
  }

  // A packaged macOS Electron binary launched directly can enter the AppKit
  // restorable-state modal loop before Electron creates its browser window.
  // LaunchServices performs the normal app activation path and still forwards
  // the test-only arguments to the new instance.
  const launcher = spawn('/usr/bin/open', ['-na', packagedApp, '--args', ...args], {
    env: childEnv(),
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  const marker = `--user-data-dir=${userDataDir}`
  const findPid = () => {
    const listed = spawnSync('ps', ['-axo', 'pid=,command='], { encoding: 'utf8' }).stdout ?? ''
    const match = listed
      .split('\n')
      .map((line) => line.trim())
      .find((line) => line.includes(packagedBinary) && line.includes(marker))
    return match ? Number(match.split(/\s+/, 1)[0]) : undefined
  }
  return { processHandle: launcher, appPid: findPid }
}

async function runPhase3() {
  fs.mkdirSync(shotDir, { recursive: true })
  const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sailor-terminal-userdata-'))
  const projectDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sailor-terminal-demo-'))
  fs.writeFileSync(path.join(projectDir, 'README.md'), '# 终端验收工作区\n')
  fs.mkdirSync(path.join(projectDir, 'src'), { recursive: true })
  fs.writeFileSync(path.join(projectDir, 'src', 'demo.ts'), 'export const demo = true\n')
  seedUserData(userDataDir, projectDir)

  const launched = launchPackagedApp(userDataDir, debugPort)
  const app = launched.processHandle
  const logs = []
  app.stdout?.on('data', (chunk) => logs.push(String(chunk)))
  app.stderr?.on('data', (chunk) => logs.push(String(chunk)))

  const shots = []
  const hasPid = (pid) => {
    try {
      process.kill(pid, 0)
      return true
    } catch {
      return false
    }
  }
  const shellPidFromRows = (rows) =>
    [...String(rows ?? '').matchAll(/shell-pid-(\d+)/g)].at(-1)?.[1] ?? ''
  let cdp = null
  try {
    cdp = await connectToApp(debugPort)
    const ui = createClient(cdp)
    await cdp.send('Page.enable')
    await cdp.send('Runtime.enable')

    await ui.waitFor("Boolean(document.querySelector('.app-shell'))", '应用外壳渲染完成')
    await ui.waitFor("document.body.innerText.includes('终端验收')", '会话已选中')

    // The app follows the OS theme by default; pin light so the first capture is light.
    await ui.evaluate(
      `localStorage.setItem('sailor.appearance.v1', JSON.stringify({ theme: 'light', accent: 'default' }))`,
    )
    await cdp.send('Page.reload', { ignoreCache: false })
    await sleep(1500)
    await ui.waitFor("Boolean(document.querySelector('.app-shell'))", '浅色主题重载')
    await ui.waitFor("document.body.innerText.includes('终端验收')", '浅色主题会话已选中')

    const panelOpened = await ui.evaluate(`(() => {
      const toggle = document.querySelector('[aria-label="显示面板"]') || document.querySelector('[aria-label="隐藏面板"]');
      if (!toggle) return 'no-toggle';
      toggle.click();
      return 'clicked';
    })()`)
    check('面板开关可点击', panelOpened === 'clicked', String(panelOpened))
    await sleep(500)
    await ui.clickText('.panel-menu-item', '终端')
    await ui.waitFor("Boolean(document.querySelector('.panel-terminal-tabs'))", '终端面板渲染')

    // Opening the panel must already hand the user a terminal: no second click on "+".
    await ui.waitFor(
      "[...document.querySelectorAll('.panel-terminal-tab-label')].length === 1",
      '打开面板即出现一个终端 tab',
    )
    await ui.waitFor(
      'Boolean(document.querySelector(\'.panel-terminal-surface[data-active="true"] .xterm\'))',
      '第一个终端挂载',
    )
    await ui.waitFor(
      "[...document.querySelectorAll('.panel-terminal-tab-dot')].some((node) => node.getAttribute('data-status') === 'running')",
      '自动启动的 tab 进入运行中',
    )
    check(
      '打开面板不需要二次点击',
      JSON.stringify(await ui.tabLabels()) === JSON.stringify(['终端 1']),
      JSON.stringify(await ui.tabLabels()),
    )
    check(
      '面板顶部只显示 tab 条',
      await ui.evaluate(
        "(() => { const tabs = document.querySelector('.panel-terminal-tabs'); return Boolean(tabs) && !document.body.innerText.includes('PID') && !document.body.innerText.includes('终端没有启动') })()",
      ),
    )

    await ui.typeCommand('echo visual-$((6*7))')
    check('渲染进程到 PTY 的端到端输入输出', await ui.waitForOutput('visual-42'))
    await ui.typeCommand('echo shell-pid-$$')
    await ui.waitForOutput('shell-pid-')
    const firstPid = shellPidFromRows(await ui.termRows())
    check('取得第一个终端的 pid', Boolean(firstPid), firstPid)

    // Second terminal in a tab of its own.
    await ui.clickSelector('.panel-terminal-tab-add')
    await ui.waitFor(
      "[...document.querySelectorAll('.panel-terminal-tab-label')].length === 2",
      '出现第二个 tab',
    )
    await ui.waitFor(
      'Boolean(document.querySelector(\'.panel-terminal-surface[data-active="true"] .xterm\'))',
      '第二个终端挂载',
    )
    await ui.typeCommand('echo second-tab-$((6*7))')
    check('第二个终端可交互', await ui.waitForOutput('second-tab-42'))
    await ui.typeCommand('echo shell-pid-$$')
    await ui.waitForOutput('shell-pid-')
    const secondPid = shellPidFromRows(await ui.termRows())
    check(
      '两个 tab 是两个独立 shell',
      Boolean(secondPid) && secondPid !== firstPid,
      `${firstPid} vs ${secondPid}`,
    )
    check(
      'tab 名称按 ordinal',
      JSON.stringify(await ui.tabLabels()) === JSON.stringify(['终端 1', '终端 2']),
      JSON.stringify(await ui.tabLabels()),
    )
    shots.push(await ui.screenshot(path.join(shotDir, 'terminal-light-desktop.png')))

    // Switching tabs keeps each buffer and its own shell.
    check('可以切回第一个 tab', await ui.clickTab('终端 1'))
    check('切回后保留自己的输出', (await ui.termRows()).includes('visual-42'))
    check('切回后不显示另一个终端的输出', !(await ui.termRows()).includes('second-tab-42'))
    check('第一个 shell 仍存活', hasPid(Number(firstPid)))
    check('切回第二个 tab', await ui.clickTab('终端 2'))
    check('第二个 tab 保留自己的输出', (await ui.termRows()).includes('second-tab-42'))
    check('第二个 shell 仍存活', hasPid(Number(secondPid)))

    await ui.typeCommand('printf "line-one\\nline-two\\n"')
    await sleep(300)

    // Paste through the real system clipboard.
    const pasteToken = 'pasted-ok'
    writeClipboard(`echo ${pasteToken}`)
    await ui.focusTerminal()
    await ui.paste()
    await ui.pressEnter()
    check('剪贴板粘贴后执行', await ui.waitForOutput(pasteToken), (await ui.termRows()).slice(-160))

    writeClipboard('echo multi-line-one\necho multi-line-two')
    await ui.focusTerminal()
    await ui.paste()
    await sleep(500)
    const multiLine = await ui.termRows()
    check(
      '多行粘贴进入终端输入',
      multiLine.includes('multi-line-one') && multiLine.includes('multi-line-two'),
      JSON.stringify(multiLine.slice(-160)),
    )
    await ui.pressCtrlC()
    await sleep(300)

    const selected = await ui.selectRow('second-tab-42')
    check('可在终端中选中整行', selected)
    writeClipboard('')
    await ui.copy()
    check(
      '选中内容可复制到剪贴板',
      readClipboard().includes('second-tab-42'),
      JSON.stringify(readClipboard().slice(0, 60)),
    )

    await ui.typeCommand('sleep 30')
    await sleep(800)
    await ui.focusTerminal()
    await ui.pressCtrlC()
    await sleep(500)
    await ui.typeCommand('echo interrupted-ok')
    check('Ctrl+C 中断前台任务', await ui.waitForOutput('interrupted-ok'))

    await ui.typeCommand('echo 中文输入-终端-测试')
    check('多字节文本经 PTY 往返', await ui.waitForOutput('中文输入-终端-测试'))

    const sizeWide = await ui.termSize()
    await ui.typeCommand('stty size')
    await sleep(600)
    const wideSize = parseSttySize(await ui.termRows())
    check(
      '宽窗口下 PTY 尺寸与渲染行数一致',
      Boolean(wideSize) && wideSize.rows === sizeWide?.lines,
      `${JSON.stringify(wideSize)} vs lines ${sizeWide?.lines}`,
    )

    await ui.typeCommand('seq 1 300')
    await sleep(1500)
    check(
      '大量输出后视图自动滚动到底部',
      /29\d/.test(await ui.termRows()),
      JSON.stringify((await ui.termRows()).slice(-60)),
    )

    await ui.typeCommand('echo replay-marker-ok')
    await ui.waitForOutput('replay-marker-ok')

    // Dark theme is a renderer-only preference; the reload also proves main keeps every
    // session alive while the renderer re-attaches to both tabs.
    await ui.evaluate(
      `localStorage.setItem('sailor.appearance.v1', JSON.stringify({ theme: 'dark', accent: 'default' }))`,
    )
    await cdp.send('Page.reload', { ignoreCache: false })
    await sleep(1800)
    await ui.waitFor("Boolean(document.querySelector('.app-shell'))", '重载后应用外壳')
    await ui.waitFor(
      "[...document.querySelectorAll('.panel-terminal-tab-label')].length === 2",
      '重载后恢复两个 tab',
    )
    await ui.waitFor(
      'Boolean(document.querySelector(\'.panel-terminal-surface[data-active="true"] .xterm\'))',
      '重载后终端重新挂载',
    )
    check(
      '重载后按 ordinal 恢复 tab',
      JSON.stringify(await ui.tabLabels()) === JSON.stringify(['终端 1', '终端 2']),
      JSON.stringify(await ui.tabLabels()),
    )
    check('重载后回放当前 tab 的输出', await ui.waitForOutput('replay-marker-ok'))
    await ui.typeCommand('echo shell-pid-$$')
    await ui.waitForOutput('shell-pid-')
    check(
      '渲染进程重载后 shell 保活',
      shellPidFromRows(await ui.termRows()) === secondPid,
      `${secondPid} -> ${shellPidFromRows(await ui.termRows())}`,
    )
    shots.push(await ui.screenshot(path.join(shotDir, 'terminal-dark-desktop.png')))

    // Closing one tab terminates only that shell.
    check('关闭第二个 tab', await ui.clickNth('.panel-terminal-tab-close', 1))
    await ui.waitFor(
      "[...document.querySelectorAll('.panel-terminal-tab-label')].length === 1",
      '关闭后只剩一个 tab',
    )
    await sleep(1200)
    check('关闭的 tab 对应 shell 被终止', !hasPid(Number(secondPid)), `pid ${secondPid}`)
    check('另一个 tab 的 shell 继续存活', hasPid(Number(firstPid)), `pid ${firstPid}`)
    await ui.typeCommand('echo after-close-ok')
    check('关闭一个 tab 后另一个仍可交互', await ui.waitForOutput('after-close-ok'))

    // Re-opening the panel restores the surviving session instead of silently spawning one.
    await ui.clickNth('.panel-tab-close', 0)
    await sleep(500)
    check(
      '关闭面板后 dock 不再显示终端',
      await ui.evaluate("!document.querySelector('.panel-terminal-tabs')"),
    )
    await ui.clickText('.panel-menu-item', '终端')
    await ui.waitFor("Boolean(document.querySelector('.panel-terminal-tabs'))", '重新打开终端面板')
    await sleep(1200)
    check(
      '重开面板恢复已有会话而不是新建',
      JSON.stringify(await ui.tabLabels()) === JSON.stringify(['终端 1']),
      JSON.stringify(await ui.tabLabels()),
    )
    check('重开后 shell 仍然存活', hasPid(Number(firstPid)), `pid ${firstPid}`)
    await ui.typeCommand('echo reopened-ok')
    check('重开后仍可交互', await ui.waitForOutput('reopened-ok'))

    // Fill the per-project cap, then the add button must be disabled with a real reason.
    for (let index = 1; index < 4; index += 1) {
      await ui.clickSelector('.panel-terminal-tab-add')
      await sleep(600)
    }
    await ui.waitFor(
      "[...document.querySelectorAll('.panel-terminal-tab-label')].length === 4",
      '达到每工作区上限',
    )
    check('达到上限后新建按钮禁用', (await ui.addButtonDisabled()) === true)
    check(
      '禁用时给出真实原因',
      String(await ui.addButtonHint()).includes('最多同时打开 4 个终端'),
      String(await ui.addButtonHint()),
    )

    // Narrow the panel with real keyboard input on its resizer.
    check('可以激活任意一个 tab', await ui.clickTab('终端 1'))
    await ui.evaluate(
      '(() => { const node = document.querySelector(\'.pane-resizer[aria-label="调整面板宽度"]\'); if (node) node.focus(); return Boolean(node) })()',
    )
    for (let step = 0; step < 3; step += 1)
      await ui.pressKey('ArrowRight', 'ArrowRight', 8, { keyCode: 39, settleMs: 250 })
    await sleep(600)
    const sizeNarrow = await ui.termSize()
    await ui.typeCommand('stty size')
    await sleep(700)
    const narrowSize = parseSttySize(await ui.termRows())
    check(
      '缩窄面板后终端重新布局',
      Boolean(sizeNarrow) &&
        Boolean(sizeWide) &&
        (sizeNarrow.surface ?? 0) < (sizeWide.surface ?? 0),
      `surface ${sizeWide?.surface} -> ${sizeNarrow?.surface}`,
    )
    check(
      'PTY 尺寸跟随面板尺寸',
      Boolean(narrowSize) &&
        Boolean(wideSize) &&
        narrowSize.cols < wideSize.cols &&
        narrowSize.rows === sizeNarrow?.lines,
      `${JSON.stringify(wideSize)} -> ${JSON.stringify(narrowSize)} (dom lines ${sizeNarrow?.lines})`,
    )
    shots.push(await ui.screenshot(path.join(shotDir, 'terminal-dark-narrow-panel.png')))

    await cdp.send('Emulation.setDeviceMetricsOverride', {
      width: 900,
      height: 720,
      deviceScaleFactor: 2,
      mobile: true,
    })
    await sleep(900)
    const narrowViewport = await ui.termSize()
    const overflow = await ui.evaluate('document.documentElement.scrollWidth - window.innerWidth')
    check('窄视口下没有横向溢出', overflow <= 1, `overflow ${overflow}px`)
    check(
      '窄视口下终端仍有尺寸',
      Boolean(narrowViewport) && (narrowViewport.surface ?? 0) > 0,
      JSON.stringify(narrowViewport),
    )
    shots.push(await ui.screenshot(path.join(shotDir, 'terminal-dark-narrow.png')))
    await cdp.send('Emulation.clearDeviceMetricsOverride')
    await sleep(700)
  } catch (error) {
    check('可视化阶段执行完成', false, error instanceof Error ? error.message : String(error))
  } finally {
    try {
      cdp?.close()
    } catch {
      // ignore
    }
    const appPid = launched.appPid()
    if (appPid && appPid !== process.pid) {
      try {
        process.kill(appPid, 'SIGTERM')
      } catch {
        /* already exited */
      }
    }
    app.kill('SIGTERM')
    await sleep(1500)
    if (appPid) {
      try {
        process.kill(appPid, 0)
        process.kill(appPid, 'SIGKILL')
      } catch {
        /* already exited */
      }
    }
    if (!app.killed) app.kill('SIGKILL')
    fs.rmSync(userDataDir, { recursive: true, force: true })
    fs.rmSync(projectDir, { recursive: true, force: true })
  }

  return { shots, logs: logs.slice(-20).join('').slice(-2000) }
}

async function main() {
  fs.mkdirSync(evidenceDir, { recursive: true })
  runPhase1()
  if (ensurePackagedApp()) runPhase2()
  const phase3 = await runPhase3()
  const failed = results.filter((entry) => !entry.ok)
  fs.writeFileSync(
    reportPath,
    JSON.stringify(
      { results, shots: phase3.shots, appLogs: phase3.logs, generatedAt: new Date().toISOString() },
      null,
      2,
    ),
  )
  console.log(`\n${results.length - failed.length}/${results.length} checks passed`)
  console.log(`report: ${reportPath}`)
  if (failed.length > 0) {
    console.error(
      `failed: ${failed.map((entry) => `${entry.name} (${entry.detail ?? ''})`).join('; ')}`,
    )
    process.exitCode = 1
  }
}

await main()
