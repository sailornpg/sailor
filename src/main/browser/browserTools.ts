import { tool, type ToolSet } from 'ai'
import { z } from 'zod'
import {
  createToolFailure,
  createToolSuccess,
  createUnexpectedToolFailure,
  toToolModelOutput,
  type ToolRecoveryAction,
} from '../../shared/toolFeedback.js'
import { parseKeyChords, KEY_MODIFIERS } from './keys.js'
import {
  buildAccessibilitySnapshot,
  resolveRef,
  type AxNodeInput,
  type RefTable,
} from './snapshot.js'
import type { BrowserSite } from './BrowserSite.js'
import type { CdpSession } from './cdp.js'
import type { BrowserAgentAccess } from './BrowserRegistry.js'

export const BROWSER_TOOLS = {
  navigate: 'browser_navigate',
  readPage: 'browser_read_page',
  readText: 'browser_read_text',
  click: 'browser_click',
  type: 'browser_type',
  key: 'browser_key',
  scroll: 'browser_scroll',
  screenshot: 'browser_screenshot',
  console: 'browser_console',
  tabs: 'browser_tabs',
} as const

/** 工具描述里的浏览器纪律：来自 Claude in Chrome 的真实踩坑经验。 */
const DISCIPLINE =
  '要先 browser_read_page 拿到 ref 再操作，不要凭猜测点击；不要触发 alert/confirm/prompt 这类模态框，它们会卡住后续所有浏览器操作；同一个动作连续失败 2-3 次就停下来问用户，不要重复重试；自己用 browser_tabs 打开的标签页用完要关掉。'

export interface BrowserToolInput {
  access: BrowserAgentAccess
  projectId: string
  chatId: string
  /** 侧边聊天不注册浏览器工具。 */
  enabled?: boolean
}

interface Target {
  site: BrowserSite
  tabId: string
  refs: RefTable
  cdp: CdpSession
}

interface ConsoleEntry {
  level: string
  text: string
  at: string
}

const CONSOLE_LIMIT = 200
const consoleBuffers = new WeakMap<CdpSession, ConsoleEntry[]>()

function stringField(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined
}

function describeRemoteObject(value: unknown): string {
  if (typeof value !== 'object' || value === null) return String(value)
  const record = value as Record<string, unknown>
  if (record.type === 'string') return String(record.value ?? '')
  if (record.value !== undefined) return String(record.value)
  if (record.description !== undefined) return String(record.description)
  return String(record.type ?? 'object')
}

function consoleBuffer(cdp: CdpSession): ConsoleEntry[] {
  const existing = consoleBuffers.get(cdp)
  if (existing !== undefined) return existing
  const entries: ConsoleEntry[] = []
  consoleBuffers.set(cdp, entries)
  void cdp.send('Runtime.enable').catch(() => {})
  void cdp.send('Log.enable').catch(() => {})
  cdp.subscribe((event) => {
    if (entries.length >= CONSOLE_LIMIT) entries.shift()
    if (event.method === 'Runtime.consoleAPICalled') {
      const args = Array.isArray(event.params.args) ? event.params.args : []
      entries.push({
        level: String(event.params.type ?? 'log'),
        text: args.map(describeRemoteObject).join(' '),
        at: new Date().toISOString(),
      })
      return
    }
    if (event.method === 'Log.entryAdded') {
      const entry = (event.params.entry ?? {}) as Record<string, unknown>
      const url = entry.url === undefined ? '' : ` (${String(entry.url)})`
      entries.push({
        level: String(entry.level ?? 'info'),
        text: `${String(entry.text ?? '')}${url}`,
        at: new Date().toISOString(),
      })
    }
  })
  return entries
}

function normalizeAxNodes(raw: unknown): AxNodeInput[] {
  if (!Array.isArray(raw)) return []
  const nodes: AxNodeInput[] = []
  for (const item of raw) {
    if (typeof item !== 'object' || item === null) continue
    const record = item as Record<string, unknown>
    const nodeId = stringField(record.nodeId)
    if (nodeId === undefined) continue
    const properties: Record<string, string | number | boolean> = {}
    if (Array.isArray(record.properties)) {
      for (const property of record.properties) {
        if (typeof property !== 'object' || property === null) continue
        const entry = property as Record<string, unknown>
        const name = stringField(entry.name)
        if (name === undefined) continue
        const raw = ((entry.value ?? {}) as Record<string, unknown>).value
        if (typeof raw === 'string' || typeof raw === 'number' || typeof raw === 'boolean') {
          properties[name] = raw
        }
      }
    }
    const childIds = Array.isArray(record.childIds)
      ? record.childIds.filter((child): child is string => typeof child === 'string')
      : []
    nodes.push({
      nodeId,
      ignored: record.ignored === true,
      role: String((record.role as Record<string, unknown> | undefined)?.value ?? ''),
      name: String((record.name as Record<string, unknown> | undefined)?.value ?? ''),
      value: stringField((record.value as Record<string, unknown> | undefined)?.value),
      description: stringField((record.description as Record<string, unknown> | undefined)?.value),
      childIds,
      backendDOMNodeId:
        typeof record.backendDOMNodeId === 'number' ? record.backendDOMNodeId : undefined,
      properties,
    })
  }
  return nodes
}

function recoveries(reason: string): ToolRecoveryAction[] {
  return [{ action: 'ask_user', reason }]
}

function modifierMask(value: string | undefined): number {
  if (value === undefined || value === '') return 0
  return value
    .split('+')
    .map((part) => part.trim().toLowerCase())
    .reduce((mask, part) => {
      if (part === 'ctrl' || part === 'control') return mask | KEY_MODIFIERS.ctrl
      if (part === 'shift') return mask | KEY_MODIFIERS.shift
      if (part === 'alt' || part === 'option') return mask | KEY_MODIFIERS.alt
      if (part === 'cmd' || part === 'meta' || part === 'win') return mask | KEY_MODIFIERS.meta
      return mask
    }, 0)
}

export function createBrowserTools(input: BrowserToolInput): ToolSet {
  if (input.enabled === false) return {}

  /**
   * 浏览器默认可用：没有站点/标签页时由 registry 现建，工具这一层不再做任何授权判断。
   * 只有"拿不到浏览器"和"目标标签页没了"两种情况会拒绝。
   */
  const acquire = async (): Promise<
    | { ok: true; target: Target }
    | {
        ok: false
        message: string
        code: 'NOT_CONFIGURED' | 'LIMIT_EXCEEDED' | 'NOT_FOUND'
        recovery: string
      }
  > => {
    const access = await input.access.acquire(input.projectId)
    if (!access.ok) {
      return { ok: false, message: access.reason, code: access.code, recovery: access.recovery }
    }
    const site = access.site
    const tabId = site.activeTabId
    if (tabId === null) {
      return {
        ok: false,
        message: '浏览器没有活动的标签页。',
        code: 'NOT_CONFIGURED',
        recovery: '用 browser_tabs 的 open 动作新建一个标签页，再重试。',
      }
    }
    const entry = site.entryFor(tabId)
    if (entry === null) {
      return {
        ok: false,
        message: '活动标签页已经关闭。',
        code: 'NOT_FOUND',
        recovery: '用 browser_tabs 的 list 动作查看当前标签页，或直接重试。',
      }
    }
    return { ok: true, target: { site, tabId, refs: entry.refs, cdp: entry.cdp } }
  }

  type AcquireFailure = Extract<Awaited<ReturnType<typeof acquire>>, { ok: false }>

  const refuse = (tool: string, toolCallId: string, started: number, failure: AcquireFailure) =>
    toToolModelOutput(
      createToolFailure({
        toolCallId,
        tool,
        summary: '浏览器当前不可用',
        durationMs: Date.now() - started,
        code: failure.code,
        message: failure.message,
        retryable: failure.code === 'NOT_FOUND',
        recovery: recoveries(failure.recovery),
      }),
    )

  const failWith = (
    tool: string,
    toolCallId: string,
    started: number,
    code: 'INVALID_ARGUMENT' | 'NOT_FOUND' | 'LIMIT_EXCEEDED',
    message: string,
    reason: string,
    retryable = false,
  ) => {
    void reason
    return toToolModelOutput(
      createToolFailure({
        toolCallId,
        tool,
        summary: '浏览器操作未完成',
        durationMs: Date.now() - started,
        code,
        message,
        retryable,
        recovery: recoveries(reason),
      }),
    )
  }

  /** ref 解析成可操作的后端节点；ref 失效时给出统一的重新读取指引。 */
  const backendNodeFor = (
    refs: RefTable,
    ref: string,
  ): { ok: true; backendNodeId: number } | { ok: false; reason: string } => {
    const binding = resolveRef(refs, ref)
    if (binding === undefined) return { ok: false, reason: `${ref} 不在当前页面的 ref 表里。` }
    if (binding.backendDOMNodeId === undefined) {
      return { ok: false, reason: `${ref} 没有对应的后端节点，无法操作。` }
    }
    return { ok: true, backendNodeId: binding.backendDOMNodeId }
  }

  const centerOf = async (cdp: CdpSession, backendNodeId: number): Promise<[number, number]> => {
    await cdp.send('DOM.enable')
    await cdp.send('DOM.scrollIntoViewIfNeeded', { backendNodeId })
    const box = (await cdp.send('DOM.getBoxModel', { backendNodeId })) as {
      model?: { content?: number[] }
    }
    const quad = box.model?.content
    if (quad === undefined || quad.length < 8) throw new Error('元素没有可点击的几何区域。')
    const xs = [quad[0], quad[2], quad[4], quad[6]]
    const ys = [quad[1], quad[3], quad[5], quad[7]]
    return [
      Math.round((Math.min(...xs) + Math.max(...xs)) / 2),
      Math.round((Math.min(...ys) + Math.max(...ys)) / 2),
    ]
  }

  const clickAt = async (
    cdp: CdpSession,
    x: number,
    y: number,
    options: { button: 'left' | 'right' | 'middle'; clickCount: number; modifiers: number },
  ): Promise<void> => {
    const buttons = options.button === 'left' ? 1 : options.button === 'right' ? 2 : 4
    // 先把指针移到目标位置：hover/active 状态和坐标命中都依赖这一步。
    await cdp.send('Input.dispatchMouseEvent', {
      type: 'mouseMoved',
      x,
      y,
      button: 'none',
      buttons: 0,
      modifiers: options.modifiers,
    })
    for (let index = 1; index <= options.clickCount; index += 1) {
      const base = { x, y, button: options.button, modifiers: options.modifiers }
      await cdp.send('Input.dispatchMouseEvent', {
        type: 'mousePressed',
        ...base,
        clickCount: index,
        buttons,
      })
      await cdp.send('Input.dispatchMouseEvent', {
        type: 'mouseReleased',
        ...base,
        clickCount: index,
        buttons: 0,
      })
    }
  }

  const dispatchChords = async (
    cdp: CdpSession,
    chords: readonly {
      key: string
      code: string
      windowsVirtualKeyCode: number
      text?: string
      modifiers: number
    }[],
  ): Promise<void> => {
    for (const chord of chords) {
      const base = {
        key: chord.key,
        code: chord.code,
        windowsVirtualKeyCode: chord.windowsVirtualKeyCode,
        modifiers: chord.modifiers,
      }
      await cdp.send('Input.dispatchKeyEvent', {
        type: 'keyDown',
        ...base,
        ...(chord.text === undefined ? {} : { text: chord.text }),
      })
      await cdp.send('Input.dispatchKeyEvent', { type: 'keyUp', ...base })
    }
  }

  const tools: Record<string, unknown> = {
    [BROWSER_TOOLS.navigate]: tool({
      description: `在侧边栏浏览器里打开一个地址，或前进/后退。url 传 URL，或 "back" / "forward"。${DISCIPLINE}`,
      inputSchema: z.object({
        url: z.string().min(1).max(2000).describe('要打开的地址，或 "back" / "forward"。'),
      }),
      execute: async ({ url }, { toolCallId }) => {
        const started = Date.now()
        const acquired = await acquire()
        if (!acquired.ok) return refuse(BROWSER_TOOLS.navigate, toolCallId, started, acquired)
        const { site, tabId } = acquired.target
        const result = site.navigate(tabId, url)
        if (!result.ok) {
          return failWith(
            BROWSER_TOOLS.navigate,
            toolCallId,
            started,
            'INVALID_ARGUMENT',
            result.reason,
            '请改用 http/https 地址，或先读取页面拿到真实链接。',
          )
        }
        // 附着失败不影响导航本身：页面事件会把状态补上。
        await acquired.target.cdp.send('Page.enable').catch(() => {})
        site.notifyChanged()
        const summary = site.summaryFor(tabId)
        return toToolModelOutput(
          createToolSuccess({
            toolCallId,
            tool: BROWSER_TOOLS.navigate,
            summary: `已打开 ${summary?.url ?? url}`,
            durationMs: Date.now() - started,
            data: {
              url: summary?.url ?? '',
              title: summary?.title ?? '',
              loading: summary?.loading ?? false,
            },
            effects: { kind: 'applied', description: '浏览器地址已改变' },
          }),
        )
      },
    }),

    [BROWSER_TOOLS.readPage]: tool({
      description: `读取当前页面的可访问性树，返回带 ref 编号的元素列表；browser_click / browser_type 用这些 ref。${DISCIPLINE}`,
      inputSchema: z.object({
        mode: z
          .enum(['interactive', 'all'])
          .optional()
          .describe('interactive 只看可交互元素，默认 all。'),
        maxChars: z.number().int().min(500).max(200_000).optional(),
        depth: z.number().int().min(1).max(40).optional(),
        refId: z.string().max(32).optional().describe('只看某个 ref 及其子树。'),
      }),
      execute: async ({ mode, maxChars, depth, refId }, { toolCallId }) => {
        const started = Date.now()
        const acquired = await acquire()
        if (!acquired.ok) return refuse(BROWSER_TOOLS.readPage, toolCallId, started, acquired)
        const { refs, cdp } = acquired.target
        try {
          await cdp.send('Accessibility.enable')
          const tree = (await cdp.send('Accessibility.getFullAXTree')) as { nodes?: unknown }
          const snapshot = buildAccessibilitySnapshot(normalizeAxNodes(tree.nodes), refs, {
            mode: mode ?? 'all',
            maxChars: maxChars ?? 50_000,
            depth: depth ?? 15,
            ...(refId === undefined ? {} : { refId }),
          })
          if (snapshot.focusStale) {
            return failWith(
              BROWSER_TOOLS.readPage,
              toolCallId,
              started,
              'NOT_FOUND',
              `${refId ?? ''} 对应的元素已经不在了，返回的是整页快照。`,
              '页面已经变化，请用新的 ref 重新操作。',
              true,
            )
          }
          return toToolModelOutput(
            createToolSuccess({
              toolCallId,
              tool: BROWSER_TOOLS.readPage,
              summary: `读取到 ${snapshot.elementCount} 个元素`,
              durationMs: Date.now() - started,
              data: {
                text: snapshot.text,
                elementCount: snapshot.elementCount,
                totalChars: snapshot.totalChars,
              },
              truncated: snapshot.truncated,
            }),
          )
        } catch (error) {
          return toToolModelOutput(
            createUnexpectedToolFailure({
              toolCallId,
              tool: BROWSER_TOOLS.readPage,
              error,
              durationMs: Date.now() - started,
            }),
          )
        }
      },
    }),

    [BROWSER_TOOLS.readText]: tool({
      description: `读取当前页面的正文文本。需要元素结构、要点击或输入时用 ${BROWSER_TOOLS.readPage}。`,
      inputSchema: z.object({}),
      execute: async (_input, { toolCallId }) => {
        const started = Date.now()
        const acquired = await acquire()
        if (!acquired.ok) return refuse(BROWSER_TOOLS.readText, toolCallId, started, acquired)
        try {
          const evaluated = (await acquired.target.cdp.send('Runtime.evaluate', {
            expression: 'document.body ? document.body.innerText : ""',
            returnByValue: true,
          })) as { result?: { value?: unknown } }
          const text = typeof evaluated.result?.value === 'string' ? evaluated.result.value : ''
          const clipped = text.slice(0, 50_000)
          return toToolModelOutput(
            createToolSuccess({
              toolCallId,
              tool: BROWSER_TOOLS.readText,
              summary: `读取到 ${clipped.length} 个字符的正文`,
              durationMs: Date.now() - started,
              data: { text: clipped },
              truncated: clipped.length < text.length,
            }),
          )
        } catch (error) {
          return toToolModelOutput(
            createUnexpectedToolFailure({
              toolCallId,
              tool: BROWSER_TOOLS.readText,
              error,
              durationMs: Date.now() - started,
            }),
          )
        }
      },
    }),

    [BROWSER_TOOLS.click]: tool({
      description: `点击页面元素。优先用 ${BROWSER_TOOLS.readPage} 返回的 ref；只有确实需要坐标时才用 coordinate。${DISCIPLINE}`,
      inputSchema: z.object({
        ref: z.string().max(32).optional(),
        coordinate: z.array(z.number()).length(2).optional(),
        button: z.enum(['left', 'right', 'middle']).optional(),
        clickCount: z.number().int().min(1).max(3).optional(),
        modifiers: z.string().max(40).optional().describe('例如 "cmd"、"ctrl+shift"。'),
      }),
      execute: async ({ ref, coordinate, button, clickCount, modifiers }, { toolCallId }) => {
        const started = Date.now()
        const acquired = await acquire()
        if (!acquired.ok) return refuse(BROWSER_TOOLS.click, toolCallId, started, acquired)
        if (ref === undefined && coordinate === undefined) {
          return failWith(
            BROWSER_TOOLS.click,
            toolCallId,
            started,
            'INVALID_ARGUMENT',
            '必须给 ref 或 coordinate 之一。',
            '先用 browser_read_page 拿到 ref。',
          )
        }
        try {
          let point: [number, number]
          if (ref !== undefined) {
            const node = backendNodeFor(acquired.target.refs, ref)
            if (!node.ok) {
              return failWith(
                BROWSER_TOOLS.click,
                toolCallId,
                started,
                'NOT_FOUND',
                node.reason,
                '页面可能已经变化，请重新 browser_read_page 再点击。',
                true,
              )
            }
            point = await centerOf(acquired.target.cdp, node.backendNodeId)
          } else {
            point = [coordinate?.[0] ?? 0, coordinate?.[1] ?? 0]
          }
          await clickAt(acquired.target.cdp, point[0], point[1], {
            button: button ?? 'left',
            clickCount: clickCount ?? 1,
            modifiers: modifierMask(modifiers),
          })
          acquired.target.site.notifyChanged()
          return toToolModelOutput(
            createToolSuccess({
              toolCallId,
              tool: BROWSER_TOOLS.click,
              summary:
                ref === undefined ? `已点击坐标 (${point[0]}, ${point[1]})` : `已点击 ${ref}`,
              durationMs: Date.now() - started,
              data: { ref: ref ?? null, coordinate: point },
              effects: { kind: 'applied', description: '页面可能已经发生变化' },
            }),
          )
        } catch (error) {
          return toToolModelOutput(
            createUnexpectedToolFailure({
              toolCallId,
              tool: BROWSER_TOOLS.click,
              error,
              durationMs: Date.now() - started,
            }),
          )
        }
      },
    }),

    [BROWSER_TOOLS.type]: tool({
      description: `往表单元素里输入文本：先聚焦 ref，再插入文本。submit 为真时额外按一次回车。${DISCIPLINE}`,
      inputSchema: z.object({
        ref: z.string().min(1).max(32),
        text: z.string().max(10_000),
        submit: z.boolean().optional(),
      }),
      execute: async ({ ref, text, submit }, { toolCallId }) => {
        const started = Date.now()
        const acquired = await acquire()
        if (!acquired.ok) return refuse(BROWSER_TOOLS.type, toolCallId, started, acquired)
        const node = backendNodeFor(acquired.target.refs, ref)
        if (!node.ok) {
          return failWith(
            BROWSER_TOOLS.type,
            toolCallId,
            started,
            'NOT_FOUND',
            node.reason,
            '页面可能已经变化，请重新 browser_read_page 再输入。',
            true,
          )
        }
        try {
          const { cdp, site } = acquired.target
          await cdp.send('DOM.enable')
          await cdp.send('DOM.focus', { backendNodeId: node.backendNodeId })
          if (text !== '') await cdp.send('Input.insertText', { text })
          if (submit === true) {
            const parsed = parseKeyChords('Enter')
            if (parsed.ok) await dispatchChords(cdp, parsed.chords)
          }
          site.notifyChanged()
          return toToolModelOutput(
            createToolSuccess({
              toolCallId,
              tool: BROWSER_TOOLS.type,
              summary: `已向 ${ref} 输入 ${text.length} 个字符${submit === true ? '并提交' : ''}`,
              durationMs: Date.now() - started,
              data: { ref, characters: text.length, submitted: submit === true },
              effects: { kind: 'applied', description: '表单值已改变' },
            }),
          )
        } catch (error) {
          return toToolModelOutput(
            createUnexpectedToolFailure({
              toolCallId,
              tool: BROWSER_TOOLS.type,
              error,
              durationMs: Date.now() - started,
            }),
          )
        }
      },
    }),

    [BROWSER_TOOLS.key]: tool({
      description: `在页面里发送按键，例如 "Enter"、"Tab"、"cmd+a"、"Backspace Backspace Delete"。${DISCIPLINE}`,
      inputSchema: z.object({ keys: z.string().min(1).max(200) }),
      execute: async ({ keys }, { toolCallId }) => {
        const started = Date.now()
        const acquired = await acquire()
        if (!acquired.ok) return refuse(BROWSER_TOOLS.key, toolCallId, started, acquired)
        const parsed = parseKeyChords(keys)
        if (!parsed.ok) {
          return failWith(
            BROWSER_TOOLS.key,
            toolCallId,
            started,
            'INVALID_ARGUMENT',
            parsed.reason,
            '请用形如 "Enter"、"cmd+a" 或 "ArrowDown ArrowDown" 的写法。',
          )
        }
        try {
          await dispatchChords(acquired.target.cdp, parsed.chords)
          acquired.target.site.notifyChanged()
          return toToolModelOutput(
            createToolSuccess({
              toolCallId,
              tool: BROWSER_TOOLS.key,
              summary: `已发送 ${parsed.chords.length} 个按键`,
              durationMs: Date.now() - started,
              data: { keys: parsed.chords.map((chord) => chord.key) },
              effects: { kind: 'applied', description: '页面可能已经响应按键' },
            }),
          )
        } catch (error) {
          return toToolModelOutput(
            createUnexpectedToolFailure({
              toolCallId,
              tool: BROWSER_TOOLS.key,
              error,
              durationMs: Date.now() - started,
            }),
          )
        }
      },
    }),

    [BROWSER_TOOLS.scroll]: tool({
      description: `滚动页面：给 ref 会把元素滚动到可见位置，否则按 direction + amount 滚动视口。${DISCIPLINE}`,
      inputSchema: z.object({
        ref: z.string().max(32).optional(),
        direction: z.enum(['up', 'down', 'left', 'right']).optional(),
        amount: z.number().int().min(1).max(10).optional(),
      }),
      execute: async ({ ref, direction, amount }, { toolCallId }) => {
        const started = Date.now()
        const acquired = await acquire()
        if (!acquired.ok) return refuse(BROWSER_TOOLS.scroll, toolCallId, started, acquired)
        try {
          const { cdp, refs } = acquired.target
          if (ref !== undefined) {
            const node = backendNodeFor(refs, ref)
            if (!node.ok) {
              return failWith(
                BROWSER_TOOLS.scroll,
                toolCallId,
                started,
                'NOT_FOUND',
                node.reason,
                '页面可能已经变化，请重新 browser_read_page 再滚动。',
                true,
              )
            }
            await cdp.send('DOM.enable')
            await cdp.send('DOM.scrollIntoViewIfNeeded', { backendNodeId: node.backendNodeId })
          } else {
            const step = 120 * (amount ?? 3)
            const axis = direction ?? 'down'
            const deltaX = axis === 'left' ? -step : axis === 'right' ? step : 0
            const deltaY = axis === 'up' ? -step : axis === 'down' ? step : 0
            const metrics = (await cdp.send('Page.getLayoutMetrics')) as {
              layoutViewport?: { clientWidth?: number; clientHeight?: number }
            }
            await cdp.send('Input.dispatchMouseEvent', {
              type: 'mouseWheel',
              x: Math.round((metrics.layoutViewport?.clientWidth ?? 800) / 2),
              y: Math.round((metrics.layoutViewport?.clientHeight ?? 600) / 2),
              deltaX,
              deltaY,
            })
          }
          acquired.target.site.notifyChanged()
          return toToolModelOutput(
            createToolSuccess({
              toolCallId,
              tool: BROWSER_TOOLS.scroll,
              summary:
                ref === undefined ? `已向${direction ?? 'down'}滚动` : `已把 ${ref} 滚动到可见位置`,
              durationMs: Date.now() - started,
              data: { ref: ref ?? null, direction: direction ?? null },
              effects: { kind: 'applied', description: '视口位置已改变' },
            }),
          )
        } catch (error) {
          return toToolModelOutput(
            createUnexpectedToolFailure({
              toolCallId,
              tool: BROWSER_TOOLS.scroll,
              error,
              durationMs: Date.now() - started,
            }),
          )
        }
      },
    }),

    [BROWSER_TOOLS.screenshot]: tool({
      description:
        '给当前页面截图。截图保存在本机会话目录并在会话里以卡片展示给用户；工具结果只返回尺寸与引用。',
      inputSchema: z.object({}),
      execute: async (_input, { toolCallId }) => {
        const started = Date.now()
        const acquired = await acquire()
        if (!acquired.ok) return refuse(BROWSER_TOOLS.screenshot, toolCallId, started, acquired)
        try {
          const captured = (await acquired.target.cdp.send(
            'Page.captureScreenshot',
            { format: 'png' },
            30_000,
          )) as { data?: string }
          if (typeof captured.data !== 'string' || captured.data === '') {
            throw new Error('截图接口没有返回图像数据。')
          }
          const png = Buffer.from(captured.data, 'base64')
          const metrics = (await acquired.target.cdp.send('Page.getLayoutMetrics')) as {
            cssLayoutViewport?: { clientWidth?: number; clientHeight?: number }
          }
          const width = Math.round(metrics.cssLayoutViewport?.clientWidth ?? 0)
          const height = Math.round(metrics.cssLayoutViewport?.clientHeight ?? 0)
          const capture = await input.access.saveCapture({
            chatId: input.chatId,
            png,
            width,
            height,
          })
          return toToolModelOutput(
            createToolSuccess({
              toolCallId,
              tool: BROWSER_TOOLS.screenshot,
              summary: `已截图 ${width}×${height}`,
              durationMs: Date.now() - started,
              // 带上 chatId：UI 按 artifactRef 取图时，main 要用它校验归属。
              data: { width, height, bytes: capture.bytes, chatId: input.chatId },
              artifactRefs: [
                { id: capture.captureId, kind: 'browser-capture', label: '浏览器截图' },
              ],
            }),
          )
        } catch (error) {
          return toToolModelOutput(
            createUnexpectedToolFailure({
              toolCallId,
              tool: BROWSER_TOOLS.screenshot,
              error,
              durationMs: Date.now() - started,
            }),
          )
        }
      },
    }),

    [BROWSER_TOOLS.console]: tool({
      description: `读取当前标签页的 console 输出。务必带 pattern（正则）过滤。只记录开始监听之后产生的消息。${DISCIPLINE}`,
      inputSchema: z.object({
        pattern: z.string().max(200).optional(),
        onlyErrors: z.boolean().optional(),
        limit: z.number().int().min(1).max(200).optional(),
        clear: z.boolean().optional(),
      }),
      execute: async ({ pattern, onlyErrors, limit, clear }, { toolCallId }) => {
        const started = Date.now()
        const acquired = await acquire()
        if (!acquired.ok) return refuse(BROWSER_TOOLS.console, toolCallId, started, acquired)
        const buffer = consoleBuffer(acquired.target.cdp)
        let entries = [...buffer]
        if (clear === true) buffer.length = 0
        if (onlyErrors === true) {
          entries = entries.filter(
            (entry) => entry.level === 'error' || entry.level === 'exception',
          )
        }
        if (pattern !== undefined && pattern !== '') {
          let expression: RegExp
          try {
            expression = new RegExp(pattern)
          } catch {
            return failWith(
              BROWSER_TOOLS.console,
              toolCallId,
              started,
              'INVALID_ARGUMENT',
              `pattern 不是合法正则：${pattern}`,
              '请给出合法正则，或省略 pattern 读取全部消息。',
            )
          }
          entries = entries.filter((entry) => expression.test(entry.text))
        }
        const limited = entries.slice(-(limit ?? 100))
        return toToolModelOutput(
          createToolSuccess({
            toolCallId,
            tool: BROWSER_TOOLS.console,
            summary: `读取到 ${limited.length} 条 console 消息`,
            durationMs: Date.now() - started,
            data: {
              messages: limited,
              note: '只包含本会话开始监听之后产生的消息。',
            },
            truncated: limited.length < entries.length,
          }),
        )
      },
    }),

    [BROWSER_TOOLS.tabs]: tool({
      description: `管理侧边栏浏览器的标签页：list 列出、open 新建、close 关闭、activate 切换。${DISCIPLINE}`,
      inputSchema: z.object({
        action: z.enum(['list', 'open', 'close', 'activate']),
        tabId: z.string().max(64).optional(),
        url: z.string().max(2000).optional(),
      }),
      execute: async ({ action, tabId, url }, { toolCallId }) => {
        const started = Date.now()
        const acquired = await acquire()
        if (!acquired.ok) return refuse(BROWSER_TOOLS.tabs, toolCallId, started, acquired)
        const { site } = acquired.target
        if (action === 'list') {
          const state = site.state()
          return toToolModelOutput(
            createToolSuccess({
              toolCallId,
              tool: BROWSER_TOOLS.tabs,
              summary: `当前有 ${state.tabs.length} 个标签页`,
              durationMs: Date.now() - started,
              data: { activeTabId: state.activeTabId, tabs: state.tabs },
            }),
          )
        }
        if (action === 'open') {
          const result = site.openTab(url)
          if (!result.ok) {
            return failWith(
              BROWSER_TOOLS.tabs,
              toolCallId,
              started,
              'LIMIT_EXCEEDED',
              result.reason,
              '请先用 browser_tabs 关掉不需要的标签页。',
            )
          }
          site.notifyChanged()
          return toToolModelOutput(
            createToolSuccess({
              toolCallId,
              tool: BROWSER_TOOLS.tabs,
              summary: `已新建标签页 ${result.tab?.id ?? ''}`,
              durationMs: Date.now() - started,
              data: { tab: result.tab },
              effects: { kind: 'applied', description: '打开了一个新标签页' },
            }),
          )
        }
        if (tabId === undefined || tabId === '') {
          return failWith(
            BROWSER_TOOLS.tabs,
            toolCallId,
            started,
            'INVALID_ARGUMENT',
            `${action} 需要 tabId。`,
            '先用 browser_tabs 的 list 动作查看 tabId。',
          )
        }
        const result = action === 'close' ? site.closeTab(tabId) : site.activateTab(tabId)
        if (!result.ok) {
          return failWith(
            BROWSER_TOOLS.tabs,
            toolCallId,
            started,
            'NOT_FOUND',
            result.reason,
            '先用 browser_tabs 的 list 动作查看当前有效的 tabId。',
            true,
          )
        }
        site.notifyChanged()
        return toToolModelOutput(
          createToolSuccess({
            toolCallId,
            tool: BROWSER_TOOLS.tabs,
            summary: action === 'close' ? `已关闭标签页 ${tabId}` : `已切换到标签页 ${tabId}`,
            durationMs: Date.now() - started,
            data: { tabId, action },
            effects: { kind: 'applied', description: '标签页集合已变化' },
          }),
        )
      },
    }),
  }

  return tools as ToolSet
}
