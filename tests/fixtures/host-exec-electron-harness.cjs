// Runs the host command tool inside Electron's main process. This verifies the
// same node-pty-era main boundary can start the user's real node/npm binaries.
const { app } = require('electron')
const fs = require('node:fs/promises')
const os = require('node:os')
const path = require('node:path')

app.commandLine.appendSwitch('no-sandbox')
app.disableHardwareAcceleration()
app.setPath(
  'userData',
  require('node:fs').mkdtempSync(path.join(os.tmpdir(), 'sailor-host-exec-userdata-')),
)
if (app.dock) app.dock.hide()

const results = []
function check(name, ok, detail) {
  results.push({ name, ok: Boolean(ok), detail: detail ?? null })
  if (!ok) console.error(`FAIL ${name}: ${detail ?? ''}`)
}

async function main() {
  const { createServer } = await import('vite')
  const root = process.cwd()
  const server = await createServer({
    logLevel: 'silent',
    server: { middlewareMode: true },
    resolve: { alias: { '@shared': path.resolve(root, 'src/shared') } },
  })
  try {
    const { HostCommandExecutor } = await server.ssrLoadModule(
      '/src/main/agent/host/HostCommandExecutor.ts',
    )
    const { createHostExecTool, hostExecApprovalFor } = await server.ssrLoadModule(
      '/src/main/agent/host/hostExecTool.ts',
    )
    const projectRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'sailor-host-exec-project-'))
    await fs.writeFile(
      path.join(projectRoot, 'package.json'),
      JSON.stringify({
        name: 'host-exec-smoke',
        private: true,
        scripts: { probe: 'node -e "process.stdout.write(process.cwd())"' },
      }),
    )
    const signal = new AbortController().signal
    const executor = new HostCommandExecutor()
    const tool = createHostExecTool({
      rootPath: projectRoot,
      signal,
      resolveCwd: async (cwd) => path.resolve(projectRoot, cwd),
      executor,
    }).host_exec
    const node = await tool.execute(
      { command: 'node -e "process.stdout.write(\'electron-host-node-ok\')"' },
      { toolCallId: 'electron-node', abortSignal: signal },
    )
    check(
      'Electron main 可执行真实 node',
      node.exitCode === 0 && node.stdout.includes('electron-host-node-ok'),
      JSON.stringify(node),
    )

    const npm = await tool.execute(
      { command: 'npm run probe --silent' },
      { toolCallId: 'electron-npm', abortSignal: signal },
    )
    check(
      'Electron main 可执行真实 npm 并使用工作区 cwd',
      npm.exitCode === 0 && npm.stdout.includes(projectRoot),
      JSON.stringify(npm),
    )
    check('allow-all 不请求逐次审批', hostExecApprovalFor('allow-all') === 'approved')
    check('allow-edits 复用现有 bash 审批', hostExecApprovalFor('allow-edits') === 'user-approval')
    check('allow-reads 复用现有 bash 审批', hostExecApprovalFor('allow-reads') === 'user-approval')
    await fs.rm(projectRoot, { recursive: true, force: true })
  } finally {
    await server.close()
  }
  console.log(JSON.stringify({ checks: results }, null, 2))
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
    setTimeout(() => app.quit(), 50)
  })
