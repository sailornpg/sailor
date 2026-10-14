import { StrictMode, createElement } from 'react'
import { createRoot } from 'react-dom/client'
import BrowserPanel from '@/components/panels/BrowserPanel'
import '../../src/renderer/src/styles/globals.css'

interface Check {
  name: string
  ok: boolean
  error?: string
}

declare global {
  interface Window {
    browserTest: {
      ready(): void
      done(results: Check[]): void
    }
    __browserPanelChecks: () => Promise<Check[]>
    __browserReveals: string[]
  }
}

globalThis.IS_REACT_ACT_ENVIRONMENT = true

// 面板自身不会请求展示；这一条由 AppShell 负责，fixture 只记录 main 发来的信号。
window.__browserReveals = []
window.sailor.browser.onReveal((payload) => {
  window.__browserReveals.push(payload.projectId)
})

const projectId = 'project-fixture'
const fixtureUrl = new URLSearchParams(window.location.search).get('fixture') ?? ''

function waitFor(predicate: () => boolean, timeoutMs = 10_000): Promise<void> {
  return new Promise((resolve, reject) => {
    const started = Date.now()
    const tick = () => {
      if (predicate()) return resolve()
      if (Date.now() - started > timeoutMs) return reject(new Error('等待超时'))
      setTimeout(tick, 50)
    }
    tick()
  })
}

/** 走真实面板的公开 API 驱动；每一步失败都记成一条 FAIL，不整批中断。 */
window.__browserPanelChecks = async () => {
  const results: Check[] = []
  const check = (name: string, ok: boolean, error?: string) => {
    console.error(
      `[panel] ${ok ? 'PASS' : 'FAIL'} ${name}${error === undefined ? '' : `: ${error}`}`,
    )
    results.push({ name, ok, error })
  }
  const step = async (name: string, run: () => Promise<boolean>) => {
    try {
      check(name, await run())
    } catch (error) {
      check(name, false, error instanceof Error ? error.message : String(error))
    }
  }

  check(
    '面板渲染出浏览器外壳（工具条 + tab 条 + 占位区）',
    document.querySelector('.panel-web-surface') !== null,
  )
  check('地址栏存在', document.querySelector('[aria-label="地址"]') !== null)
  check(
    '面板上没有授权开关（默认允许 Agent 操作）',
    document.querySelector('.panel-web-toolbar button[aria-pressed]') === null,
  )

  await step('打开面板后自动有一个标签页', async () => {
    await waitFor(() => document.querySelectorAll('.panel-web-tab').length > 0)
    return true
  })

  await step('地址栏驱动真实导航并反映页面标题', async () => {
    await window.sailor.browser.navigate({ projectId, input: fixtureUrl })
    await waitFor(
      () =>
        document.querySelector('.panel-web-tab-label')?.textContent?.includes('Fixture') === true,
    )
    return true
  })

  const surface = document.querySelector('.panel-web-surface')
  const rect = surface?.getBoundingClientRect()
  check(
    '占位区有真实几何',
    (rect?.width ?? 0) > 32 && (rect?.height ?? 0) > 32,
    `${rect?.width ?? 0}x${rect?.height ?? 0}`,
  )

  await new Promise((resolve) => setTimeout(resolve, 300))
  return results
}

createRoot(document.getElementById('root')!).render(
  createElement(
    StrictMode,
    null,
    createElement(
      'div',
      { style: { height: '620px', display: 'flex', flexDirection: 'column' } },
      createElement(BrowserPanel, {
        instanceId: 'browser:project-fixture',
        panelId: 'browser',
        scopeId: projectId,
        context: { chatId: 'chat-fixture', projectId },
        data: {},
      }),
    ),
  ),
)

setTimeout(() => window.browserTest.ready(), 400)
