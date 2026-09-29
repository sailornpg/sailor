import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const threadElement = 'src/renderer/src/components/assistant-ui/elements/thread.aui.tsx'
const autoScrollHook =
  'node_modules/@assistant-ui/react/dist/primitives/thread/useThreadViewportAutoScroll.js'
const scrollToBottomPrimitive =
  'node_modules/@assistant-ui/react/dist/primitives/thread/ThreadScrollToBottom.js'

test('Thread viewport anchors the turn at the bottom so streaming follows the tail', async () => {
  const source = await readFile(threadElement, 'utf8')

  // Upstream ships `turnAnchor="top"`, which disables auto scroll and pins the
  // user turn instead of following the tail. Sailor opts out of that default.
  assert.doesNotMatch(source, /turnAnchor="top"/)
  assert.match(source, /turnAnchor="bottom"/)

  // The deviation has to stay documented, or `assistant-ui add thread` silently reverts it.
  assert.match(source, /Sailor deviation from the upstream element/)
})

test('bottom anchoring keeps the follow, pause and re-pin affordances wired', async () => {
  const source = await readFile(threadElement, 'utf8')
  assert.match(source, /<ThreadScrollToBottom \/>/)
  // `instant` makes an explicit re-pin deterministic while streamed content
  // continues to resize the viewport.
  assert.match(source, /<ThreadPrimitive\.ScrollToBottom behavior="instant" asChild>/)
  // A run start must not enqueue a forced bottom scroll that can win a race
  // with a reader scrolling upward while streamed content resizes the thread.
  assert.match(source, /scrollToBottomOnRunStart=\{false\}/)
  // A programmatic jump to the bottom during tool streaming must not clear a
  // pause that was caused by the reader scrolling upward.
  assert.match(source, /const autoScrollPaused = useRef\(false\)/)
  assert.match(source, /const userResumedAtBottom =/)
  assert.match(source, /onPointerCancel=\{handleViewportPointerUp\}/)
  assert.match(source, /closest\('\.aui-thread-scroll-to-bottom'\)/)

  const hook = await readFile(autoScrollHook, 'utf8')
  // Auto scroll defaults on for every anchoring mode except "top".
  assert.match(hook, /autoScroll = threadViewportStore\.getState\(\)\.turnAnchor !== "top"/)
  // Scrolling up clears the follow flag; scrolling to the bottom restores it.
  assert.match(hook, /followBottomRef\.current = false/)
  assert.match(hook, /followBottomRef\.current = true/)

  const primitive = await readFile(scrollToBottomPrimitive, 'utf8')
  // The control only exists while the reader is away from the bottom.
  assert.match(primitive, /if \(isAtBottom\) return null/)
})
