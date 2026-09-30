import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const threadElement = 'src/renderer/src/components/assistant-ui/elements/thread.aui.tsx'
const scrollFollow = 'src/renderer/src/components/assistant-ui/utils/scrollFollow.ts'
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

test('the viewport delegates follow arbitration to the pure decision module', async () => {
  const source = await readFile(threadElement, 'utf8')

  // The element only observes input and forwards it; the decision table lives in
  // the pure module covered by tests/thread-scroll-intent.test.ts.
  assert.match(source, /nextScrollFollow\(follow\.current, event\)/)
  assert.match(source, /kind: 'wheel'/)
  assert.match(source, /kind: 'pin-control'/)
  assert.match(source, /kind: 'scroll'/)
  assert.match(source, /programmaticScroll/)

  // A programmatic jump to the bottom during tool streaming must not clear a
  // pause that was caused by the reader scrolling upward.
  assert.match(source, /programmatic/)

  // Browser scroll anchoring must not move `scrollTop` behind the decision
  // module's back, or a layout correction above the tail reads as reader input.
  assert.match(source, /\[overflow-anchor:none\]/)

  const decision = await readFile(scrollFollow, 'utf8')
  // Only an upward gesture that leaves the scroll height untouched is reader
  // intent; a correction above a growing answer moves the offset too.
  assert.match(decision, /state\.scrollHeight === scrollHeight/)
  // A paused reader is not resumed by a programmatic scroll landing at the
  // bottom; it needs their own downward wheel or the scroll-to-bottom control.
  assert.match(decision, /state\.downwardIntent \|\| state\.pinIntent/)
})
