import { useEffect, useState } from 'react'
import { createRoot } from 'react-dom/client'
import {
  AssistantRuntimeProvider,
  useLocalRuntime,
  type AssistantRuntime,
  type ChatModelAdapter,
} from '@assistant-ui/react'
import {
  Thread,
  type ThreadComponents,
} from '../../src/renderer/src/components/assistant-ui/elements/thread.aui'
import { PiRuntimeEventStatus } from '../../src/renderer/src/components/chat/events/PiRuntimeEventStatus'
import { TurnFileChangeCard } from '../../src/renderer/src/components/chat/review/TurnFileChangeCard'
import { PlanTodoListView } from '../../src/renderer/src/components/chat/PlanTodoListView'
import '../../src/renderer/src/styles/globals.css'

const scrollTest = (globalThis as Record<string, any>)['scrollTest']
const results: { name: string; ok: boolean; error?: string; detail?: string }[] = []
const assert = (condition: unknown, message: string) => {
  if (!condition) throw new Error(message)
}
const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))
const frame = () => new Promise((resolve) => requestAnimationFrame(() => resolve(null)))

const historyChunks = Array.from(
  { length: 40 },
  (_, index) => `历史第 ${index} 段：先前的回答内容，用来在视口里形成可滚动的上文。\n\n`,
)
const longChunks = Array.from(
  { length: 120 },
  (_, index) =>
    `第 ${index} 段：这段文字持续增长，用于验证流式期间视口的跟随行为、尾部几何是否稳定，以及滚动仲裁在布局变化下是否仍然成立。\n\n`,
)

const script = { chunks: [] as string[], delayMs: 16, paused: false }
const adapter: ChatModelAdapter = {
  async *run({ abortSignal }) {
    let text = ''
    for (const chunk of script.chunks) {
      while (script.paused && !abortSignal.aborted) await delay(16)
      if (abortSignal.aborted) return
      await delay(script.delayMs)
      text += chunk
      yield { content: [{ type: 'text' as const, text }] }
    }
    yield {
      content: [{ type: 'text' as const, text }],
      metadata: { custom: { turnId: 'turn-1' } },
    }
  },
}

const viewport = () => document.querySelector<HTMLElement>('[data-slot="aui_thread-viewport"]')
const distanceFromBottom = () => {
  const element = viewport()
  return element ? element.scrollHeight - element.scrollTop - element.clientHeight : Number.NaN
}
const messageRoots = () => [
  ...document.querySelectorAll<HTMLElement>('[data-slot="aui_assistant-message-root"]'),
]
/** The newest paragraph of the tail message: a stable anchor while paused. */
const tailParagraph = () => {
  const roots = messageRoots()
  const root = roots[roots.length - 1]
  const paragraphs = root ? [...root.querySelectorAll('p')] : []
  return paragraphs[paragraphs.length - 1] ?? null
}
const topWithinViewport = (element: Element | null) => {
  const container = viewport()
  if (!element || !container) return Number.NaN
  return element.getBoundingClientRect().top - container.getBoundingClientRect().top
}

/**
 * Simulates a block above the tail collapsing (the reasoning-panel case): a laid
 * out paragraph inside the streaming message, above the visible window, is
 * removed from the flow and put back. A skipped `content-visibility` message
 * would not do, because its size comes from the placeholder, not its content.
 */
const collapseAboveTail = (collapsed: boolean) => {
  const roots = messageRoots()
  const root = roots[roots.length - 1]
  const paragraphs = root ? [...root.querySelectorAll('p')] : []
  const target = paragraphs[Math.max(0, paragraphs.length - 12)]
  if (!target) return false
  target.style.display = collapsed ? 'none' : ''
  return true
}

const startSampling = () => {
  const samples: { top: number; distance: number }[] = []
  let running = true
  const tick = () => {
    if (!running) return
    const element = viewport()
    if (element) {
      samples.push({ top: element.scrollTop, distance: distanceFromBottom() })
    }
    requestAnimationFrame(tick)
  }
  requestAnimationFrame(tick)
  return {
    stop: () => {
      running = false
      return samples
    },
  }
}

/** Waits until the scroll box stops changing, so a measurement cannot race the
 * reveal/deferred markdown commits that trail the last streamed chunk. */
const waitForStableLayout = async (stableMs = 500, timeoutMs = 6000) => {
  const startedAt = performance.now()
  let lastHeight = -1
  let stableSince = performance.now()
  while (performance.now() - startedAt < timeoutMs) {
    const height = viewport()?.scrollHeight ?? -1
    if (height !== lastHeight) {
      lastHeight = height
      stableSince = performance.now()
    } else if (performance.now() - stableSince >= stableMs) {
      return
    }
    await delay(40)
  }
  throw new Error('layout never settled')
}

const composerListeners = new Set<() => void>()
let composerPlan: unknown
const setPlan = (plan: unknown) => {
  composerPlan = plan
  for (const listener of composerListeners) listener()
}

function FixtureComposer() {
  const [, force] = useState(0)
  useEffect(() => {
    const listener = () => force((value) => value + 1)
    composerListeners.add(listener)
    return () => {
      composerListeners.delete(listener)
    }
  }, [])
  return (
    <div data-slot="fixture-composer" className="flex flex-col gap-2 pb-2">
      <PlanTodoListView plan={composerPlan as never} runStatus="running" runId="run-1" />
      <div
        className="rounded-2xl border px-4 py-3 text-sm"
        style={{ borderColor: 'var(--border)', minHeight: 44 }}
      >
        随心输入
      </div>
    </div>
  )
}

const components = {
  RuntimeEventStatus: () => <PiRuntimeEventStatus chatId="fixture" />,
  FileChangeCard: ({ turnId }: { turnId: string }) => (
    <TurnFileChangeCard chatId="fixture" turnId={turnId} />
  ),
  Composer: FixtureComposer,
} as ThreadComponents

let runtime: AssistantRuntime | null = null

function Harness() {
  const localRuntime = useLocalRuntime(adapter)
  runtime = localRuntime
  return (
    <AssistantRuntimeProvider runtime={localRuntime}>
      <div className="flex flex-col" style={{ height: '100%', width: '100%' }}>
        <Thread components={components} />
      </div>
    </AssistantRuntimeProvider>
  )
}

createRoot(document.getElementById('root')!).render(<Harness />)
await delay(80)

const isRunning = () => runtime?.thread.getState().isRunning ?? false
const waitUntilRunning = async (timeoutMs = 5000) => {
  const startedAt = performance.now()
  while (performance.now() - startedAt < timeoutMs) {
    if (isRunning()) return
    await delay(16)
  }
  throw new Error('stream never started')
}
const waitUntilIdle = async (timeoutMs = 20000) => {
  const startedAt = performance.now()
  while (performance.now() - startedAt < timeoutMs) {
    if (!isRunning()) return
    await delay(40)
  }
  throw new Error('stream did not finish within the timeout')
}
/** Starts a scripted run and resolves once the runtime reports it running. */
const appendStream = async (chunks: string[], delayMs: number) => {
  script.chunks = chunks
  script.delayMs = delayMs
  const appended = runtime!.thread.append({
    role: 'user',
    content: [{ type: 'text', text: '请写一段很长的回答' }],
  })
  await waitUntilRunning()
  return appended
}

const check = async (name: string, body: () => Promise<void> | void) => {
  try {
    await body()
    results.push({ name, ok: true })
  } catch (error) {
    results.push({ name, ok: false, error: String(error) })
  }
}

const fileSummary = {
  chatId: 'fixture',
  turnId: 'turn-1',
  status: 'completed' as const,
  fileCount: 2,
  addedLines: 18,
  removedLines: 4,
  hasUntrackedHostExec: false,
  hasTrackingError: false,
  hasIncompleteDiff: false,
  changes: [
    {
      id: 'c1',
      chatId: 'fixture',
      turnId: 'turn-1',
      runId: 'run-1',
      path: 'src/sort.ts',
      kind: 'modified' as const,
      beforeHash: null,
      afterHash: null,
      state: 'current' as const,
      addedLines: 12,
      removedLines: 3,
      lines: [],
      truncated: false,
    },
    {
      id: 'c2',
      chatId: 'fixture',
      turnId: 'turn-1',
      runId: 'run-1',
      path: 'tests/sort.test.ts',
      kind: 'added' as const,
      beforeHash: null,
      afterHash: null,
      state: 'current' as const,
      addedLines: 6,
      removedLines: 1,
      lines: [],
      truncated: false,
    },
  ],
}

const emitEventLine = (id: string, phase: 'started' | 'succeeded') =>
  scrollTest.emitPiEvent({
    id,
    kind: 'retry',
    phase,
    at: Date.now(),
    attempt: 1,
    maxAttempts: 3,
  })

const eventLine = () => document.querySelector('[data-slot="pi-event-status"]')

// The card hook fetches on mount, so the stub summary must exist before render.
scrollTest.setFileSummary(fileSummary)

// ---- history so the tail has content above it --------------------------------
await appendStream(historyChunks, 6)
await waitUntilIdle()

// ---- streaming run under test ------------------------------------------------
const stream = await appendStream(longChunks, 20)
await delay(400)

await check('流式中的最后一条消息不使用 content-visibility:auto', () => {
  const roots = messageRoots()
  const tail = roots[roots.length - 1]
  assert(tail, 'no assistant message rendered')
  assert(
    getComputedStyle(tail).contentVisibility === 'visible',
    `streaming message must render its own box, got ${getComputedStyle(tail).contentVisibility}`,
  )
  // `concat-content` merges consecutive assistant messages, so a settled user
  // turn is the stable box that keeps the optimization.
  const userRoot = document.querySelector<HTMLElement>('[data-slot="aui_user-message-root"]')
  assert(userRoot, 'no settled user message rendered')
  assert(
    getComputedStyle(userRoot).contentVisibility === 'auto',
    `settled messages keep content-visibility:auto, got ${getComputedStyle(userRoot).contentVisibility}`,
  )
})

await check('viewport 关闭浏览器滚动锚定', () => {
  const element = viewport()
  assert(element, 'viewport missing')
  assert(
    getComputedStyle(element).overflowAnchor === 'none',
    `expected overflow-anchor:none, got ${getComputedStyle(element).overflowAnchor}`,
  )
})

const sampler = startSampling()
await delay(120)

await check('运行时事件行出现与消失不移动尾部文本', async () => {
  // Freeze the answer so the only thing that can move the anchor is the event
  // line itself, not the next streamed paragraph, then wait for the trailing
  // reveal and deferred markdown commits to land.
  script.paused = true
  await waitForStableLayout()
  const anchor = tailParagraph()
  assert(anchor, 'no tail paragraph rendered')
  const before = { top: topWithinViewport(anchor), scrollTop: viewport()!.scrollTop }
  emitEventLine('retry-1', 'started')
  await frame()
  await frame()
  assert(eventLine(), 'runtime event line did not render')
  const shown = { top: topWithinViewport(anchor), scrollTop: viewport()!.scrollTop }
  emitEventLine('retry-1', 'succeeded')
  await frame()
  await frame()
  assert(!eventLine(), 'runtime event line did not clear')
  const cleared = { top: topWithinViewport(anchor), scrollTop: viewport()!.scrollTop }
  script.paused = false

  const drift = Math.max(
    Math.abs(shown.top - before.top),
    Math.abs(cleared.top - before.top),
    Math.abs(shown.scrollTop - before.scrollTop),
    Math.abs(cleared.scrollTop - before.scrollTop),
  )
  assert(
    drift <= 1,
    `tail geometry moved by ${drift.toFixed(1)}px when the event line toggled: connected=${anchor.isConnected} before=${JSON.stringify(before)} shown=${JSON.stringify(shown)} cleared=${JSON.stringify(cleared)}`,
  )
})

await check('composer 计划面板出现后视口仍在底部', async () => {
  setPlan({
    revision: 1,
    steps: [
      { id: 'a', title: '读取实现', status: 'completed' },
      { id: 'b', title: '写入排序实现', status: 'in-progress' },
      { id: 'c', title: '补测试', status: 'pending' },
    ],
  })
  await delay(200)
  await frame()
  const distance = distanceFromBottom()
  assert(
    distance <= 4,
    `viewport left the bottom by ${distance.toFixed(1)}px after the plan panel appeared`,
  )
  // Visual evidence while the tail is pinned: light, wide window.
  await scrollTest.capture('wide-light')
})

// Blocks above the tail collapse and return while the answer keeps streaming.
// The stream pauses for each collapse: a shrink that the answer's growth happens
// to cancel in the same frame leaves the scroll height unchanged, which is
// indistinguishable from a gesture by design and is not what this checks.
const collapseDeltas: number[] = []
await check('尾部以上块塌缩时跟随保持', async () => {
  for (const _ of [0, 1, 2]) {
    script.paused = true
    // Settle first: a pending reveal would mask the shrink this measures.
    await waitForStableLayout()
    const beforeHeight = viewport()!.scrollHeight
    assert(collapseAboveTail(true), 'collapse stimulus found no paragraph above the tail')
    await frame()
    await frame()
    collapseDeltas.push(viewport()!.scrollHeight - beforeHeight)
    collapseAboveTail(false)
    await frame()
    await frame()
    script.paused = false
    await delay(120)
  }
  await delay(400)
  assert(
    collapseDeltas.every((delta) => delta < -8),
    `collapse stimulus did not shrink the scroll box: ${collapseDeltas.join(', ')}`,
  )
  const distance = distanceFromBottom()
  assert(
    distance <= 4,
    `viewport fell ${distance.toFixed(1)}px behind after collapsing above the tail`,
  )
})

const samples = sampler.stop()
await check('跟随流式期间视口不离开底部', () => {
  assert(samples.length > 30, `expected sampling frames, got ${samples.length}`)
  const worst = Math.max(...samples.map((sample) => sample.distance))
  let longest = 0
  let run = 0
  let episodes = 0
  for (const sample of samples) {
    const away = sample.distance > 4
    if (away && run === 0) episodes += 1
    run = away ? run + 1 : 0
    longest = Math.max(longest, run)
  }
  const detail = `worst ${worst.toFixed(1)}px, longest ${longest} frames, ${episodes} episodes over ${samples.length} frames`
  // A frame of lag is the pin catching up after the content or a layout above
  // the tail changed. A lost follow runs away instead: dropping the layout
  // guard leaves the viewport thousands of pixels and hundreds of frames behind.
  assert(longest <= 15, `follow was lost: ${detail}`)
  assert(worst <= 160, `viewport fell behind the tail: ${detail}`)
})

await check('用户上滚后不被拉回', async () => {
  const element = viewport()!
  element.dispatchEvent(new WheelEvent('wheel', { deltaY: -240, bubbles: true }))
  const target = Math.max(0, element.scrollTop - 220)
  element.scrollTop = target
  await frame()
  const settled = element.scrollTop
  await delay(400)
  assert(
    Math.abs(viewport()!.scrollTop - settled) <= 2,
    `viewport was pulled back from ${settled} to ${viewport()!.scrollTop} while the reader stayed away`,
  )
  assert(distanceFromBottom() > 100, 'expected the reader to be away from the tail')
})

await check('点击回到底部恢复跟随', async () => {
  const control = document.querySelector<HTMLElement>('.aui-thread-scroll-to-bottom')
  assert(control, 'scroll-to-bottom control missing while reading above the tail')
  control.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }))
  control.dispatchEvent(new PointerEvent('pointerup', { bubbles: true }))
  control.dispatchEvent(new MouseEvent('click', { bubbles: true }))
  await frame()
  await frame()
  await delay(200)
  const distance = distanceFromBottom()
  assert(distance <= 4, `viewport did not return to the bottom, ${distance.toFixed(1)}px away`)
})

await stream
await waitUntilIdle()
await delay(120)

await check('turn 文件变更卡出现后视口仍在底部', async () => {
  await delay(250)
  await frame()
  const card = document.querySelector('[data-turn-file-card]')
  assert(
    card,
    `turn file change card did not render; cards = ${document.querySelectorAll('.sailor-turn-file-card').length}`,
  )
  const distance = distanceFromBottom()
  assert(
    distance <= 4,
    `viewport left the bottom by ${distance.toFixed(1)}px after the turn card appeared`,
  )
})

await check('生成结束后滚动保持自由', async () => {
  const element = viewport()!
  element.dispatchEvent(new WheelEvent('wheel', { deltaY: -240, bubbles: true }))
  element.scrollTop = Math.max(0, element.scrollTop - 160)
  await frame()
  const settled = element.scrollTop
  await delay(400)
  assert(
    Math.abs(viewport()!.scrollTop - settled) <= 2,
    `a finished run still moved the viewport from ${settled} to ${viewport()!.scrollTop}`,
  )
})

await check('深色窄窗口下尾部几何一致', async () => {
  await scrollTest.setEnvironment({ dark: true, narrow: true })
  await delay(150)
  await appendStream(longChunks.slice(0, 24), 20)
  await delay(320)
  script.paused = true
  await waitForStableLayout()
  const anchor = tailParagraph()
  assert(anchor, 'no tail paragraph rendered in the narrow dark window')
  const before = { top: topWithinViewport(anchor), scrollTop: viewport()!.scrollTop }
  emitEventLine('retry-2', 'started')
  await frame()
  await frame()
  const shown = { top: topWithinViewport(anchor), scrollTop: viewport()!.scrollTop }
  emitEventLine('retry-2', 'succeeded')
  await frame()
  script.paused = false
  const drift = Math.max(
    Math.abs(shown.top - before.top),
    Math.abs(shown.scrollTop - before.scrollTop),
  )
  await scrollTest.capture('narrow-dark')
  assert(drift <= 1, `tail geometry moved by ${drift.toFixed(1)}px in the narrow dark window`)
  await waitUntilIdle()
})

await check('恢复浅色宽窗口环境', async () => {
  await scrollTest.setEnvironment({ dark: false, narrow: false })
  await delay(150)
})

scrollTest.done(results)
