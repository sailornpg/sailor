import { StrictMode, createElement, useState } from 'react'
import { createRoot } from 'react-dom/client'
import BrowserPanel from '@/components/panels/BrowserPanel'
import { PanelAddButton } from '@/components/layout/PanelAddButton'
import { PanelTabStrip } from '@/components/layout/PanelTabStrip'
import { panelDescriptors } from '@/lib/panels/descriptors'
import { createPanelRegistry } from '@/lib/panels/registry'
import { hasBlockingOverlay, rectsOverlap } from '@/lib/panels/browserSurface'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { BROWSER_SURFACE_RADIUS_PX } from '@shared/browser'
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
    /** 展开/收起真实的面板选择下拉；主进程用它验证浮层遮挡时原生视图被摘掉。 */
    __fixtureOpenPicker: (open: boolean) => void
    /** 展开/收起一个真的压在面板上的浮层（模拟别处菜单落进 dock 的情况）。 */
    __fixtureOpenFallbackMenu: (open: boolean) => void
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

  // 内容区是一张不贴边的圆角卡片：原生视图跟着同一块矩形，所以四边都要留出内边距。
  const dockRect = document.querySelector('.panel-dock')?.getBoundingClientRect()
  const inset = {
    left: (rect?.x ?? 0) - (dockRect?.x ?? 0),
    top: (rect?.y ?? 0) - (dockRect?.y ?? 0),
    right: (dockRect?.right ?? 0) - (rect?.right ?? 0),
    bottom: (dockRect?.bottom ?? 0) - (rect?.bottom ?? 0),
  }
  check(
    '内容区四边都不贴 dock 边缘',
    Object.values(inset).every((value) => value >= 8),
    JSON.stringify(inset),
  )
  check(
    '内容区是圆角容器',
    surface !== null && getComputedStyle(surface).borderRadius === `${BROWSER_SURFACE_RADIUS_PX}px`,
    surface === null ? '没有内容区' : getComputedStyle(surface).borderRadius,
  )

  const menuRect = () =>
    document.querySelector('[data-slot="dropdown-menu-content"]')?.getBoundingClientRect()
  const surfaceHidden = () =>
    document.querySelector('.panel-web-surface')?.getAttribute('data-hidden') === 'true'
  const panelElement = document.querySelector('.panel-web')
  const settle = () => new Promise((resolve) => setTimeout(resolve, 500))

  // 面板选择下拉：必须飞到 dock 左侧的对话区，压不到原生视图，浏览器页面全程可见。
  window.__fixtureOpenPicker(true)
  await waitFor(() => menuRect() !== undefined)
  await settle()
  const menu = menuRect()
  check(
    '面板选择下拉落在 dock 之外的对话区',
    menu !== undefined && dockRect !== undefined && menu.right <= dockRect.x,
    JSON.stringify({ menu, dock: dockRect }),
  )
  check(
    '面板选择下拉没有压住内容区',
    panelElement !== null &&
      menu !== undefined &&
      !rectsOverlap(menu, panelElement.getBoundingClientRect()),
  )
  check(
    '下拉展开时浏览器页面仍然可见（原生视图没被摘掉）',
    !surfaceHidden(),
    `hidden=${surfaceHidden()}`,
  )

  window.__fixtureOpenPicker(false)
  await settle()
  check('下拉收起后内容区恢复', !surfaceHidden())

  // 兜底：别处的菜单真的落到面板上时，原生视图让位，菜单不被页面盖住。
  window.__fixtureOpenFallbackMenu(true)
  await waitFor(() => menuRect() !== undefined)
  await settle()
  check(
    '压在面板上的浮层仍然让原生视图让位（菜单不被页面盖住）',
    surfaceHidden(),
    `blocking=${panelElement !== null && hasBlockingOverlay(document, panelElement)} hidden=${surfaceHidden()}`,
  )
  window.__fixtureOpenFallbackMenu(false)
  await settle()
  check('兜底浮层收起后内容区恢复', !surfaceHidden())

  return results
}

const fixtureRegistry = createPanelRegistry(panelDescriptors)
let togglePicker: ((open: boolean) => void) | null = null
let toggleFallbackMenu: ((open: boolean) => void) | null = null

window.__fixtureOpenPicker = (open) => togglePicker?.(open)
window.__fixtureOpenFallbackMenu = (open) => toggleFallbackMenu?.(open)

const browserDescriptor = panelDescriptors.find((descriptor) => descriptor.id === 'browser')!

/**
 * 复刻真实三栏的一角：左边对话区（普通 DOM），右边 panel dock（真实 tab 条 + 选择器 + 浏览器面板）。
 */
function FixtureShell() {
  const [pickerOpen, setPickerOpen] = useState(false)
  const [fallbackOpen, setFallbackOpen] = useState(false)
  togglePicker = setPickerOpen
  toggleFallbackMenu = setFallbackOpen
  const panelProps = {
    instanceId: 'browser:project-fixture',
    panelId: 'browser',
    scopeId: projectId,
    context: { chatId: 'chat-fixture', projectId },
    data: {},
  }
  return createElement(
    'div',
    { style: { display: 'flex', height: '620px' } },
    createElement('div', { style: { flex: '1', minWidth: '0' } }),
    createElement(
      'aside',
      {
        className: 'panel-dock',
        'data-dock': 'open',
        style: { flex: '0 0 384px', width: '384px' },
      },
      createElement(PanelTabStrip, {
        activeInstanceId: panelProps.instanceId,
        onActivate: () => {},
        onClose: () => {},
        picker: createElement(PanelAddButton, {
          context: panelProps.context,
          onOpenChange: setPickerOpen,
          onPick: () => {},
          open: pickerOpen,
          platform: 'mac',
          registry: fixtureRegistry,
        }),
        tabs: [
          {
            instance: { instanceId: panelProps.instanceId, panelId: 'browser', scopeId: projectId },
            descriptor: browserDescriptor,
          },
        ],
      }),
      createElement(
        'div',
        { className: 'panel-host', style: { position: 'relative' } },
        createElement(BrowserPanel, panelProps),
        // 模拟别处菜单落进 dock 的情况：这条走的是"原生视图让位"的兜底路径。
        createElement(
          'div',
          { style: { position: 'absolute', top: '0', right: '0' } },
          createElement(
            DropdownMenu,
            { onOpenChange: setFallbackOpen, open: fallbackOpen },
            createElement(
              DropdownMenuTrigger,
              { asChild: true },
              createElement('button', { 'aria-label': '模拟浮层', type: 'button' }, '…'),
            ),
            createElement(
              DropdownMenuContent,
              { align: 'end' },
              createElement(DropdownMenuItem, null, '模拟菜单项'),
            ),
          ),
        ),
      ),
    ),
  )
}

createRoot(document.getElementById('root')!).render(
  createElement(StrictMode, null, createElement(FixtureShell)),
)

setTimeout(() => window.browserTest.ready(), 400)
