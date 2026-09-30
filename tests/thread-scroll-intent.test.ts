import assert from 'node:assert/strict'
import { resolve } from 'node:path'
import test from 'node:test'
import { createServer } from 'vite'

const modulePath = '/src/renderer/src/components/assistant-ui/utils/scrollFollow.ts'

async function loadScrollFollow() {
  const vite = await createServer({
    logLevel: 'silent',
    server: { middlewareMode: true },
    resolve: { alias: { '@': resolve('src/renderer/src'), '@shared': resolve('src/shared') } },
  })
  try {
    return (await vite.ssrLoadModule(modulePath).catch(() => ({}))) as Record<string, unknown>
  } finally {
    await vite.close()
  }
}

const follow = await loadScrollFollow()
const reduce = follow['nextScrollFollow'] as
  ((state: unknown, event: unknown) => Record<string, unknown>) | undefined
const initial = follow['initialScrollFollow'] as Record<string, unknown> | undefined

const metrics = (scrollTop: number, scrollHeight: number, clientHeight = 400) => ({
  scrollTop,
  scrollHeight,
  clientHeight,
})

/** A viewport that already followed its way down to a growing answer. */
const following = () => {
  assert.ok(initial, '需要实现滚动跟随初始状态 initialScrollFollow')
  return { ...initial, scrollTop: 900, scrollHeight: 1300 }
}

const scroll = (
  state: Record<string, unknown>,
  next: ReturnType<typeof metrics>,
  programmatic = false,
) => reduce!(state, { kind: 'scroll', metrics: next, programmatic })

test('尾部以上塌缩后被钳到底部时保持跟随', () => {
  const state = following()
  // A collapsing block above the tail shrinks the scroll box, so the container
  // clamps the offset down to the new bottom.
  const next = scroll(state, metrics(700, 1100))

  assert.equal(next['following'], true)
  assert.equal(next['paused'], false)
  assert.equal(next['scrollTop'], 700)
  assert.equal(next['scrollHeight'], 1100)
})

test('锚定补偿把偏移推离底部时不算用户上滚', () => {
  const state = following()
  // Compensation for a layout change above the tail moved the offset upward
  // while the answer kept growing, so the viewport is deliberately not at the
  // bottom: only the height-change rule can tell this apart from a gesture.
  const next = scroll(state, metrics(700, 1500))

  assert.equal(next['following'], true)
  assert.equal(next['paused'], false)
  assert.equal(next['scrollHeight'], 1500)
})

test('真实的用户上滚（滚动高度不变）暂停跟随', () => {
  const state = following()
  const next = scroll(state, metrics(700, 1300))

  assert.equal(next['following'], false)
  assert.equal(next['paused'], true)
})

test('滚轮上滚立即暂停跟随，不依赖随后的滚动事件', () => {
  const next = reduce!(following(), { kind: 'wheel', deltaY: -120 })

  assert.equal(next['following'], false)
  assert.equal(next['paused'], true)
  assert.equal(next['downwardIntent'], false)
})

test('程序化滚动期间的上移不改变跟随状态', () => {
  const state = following()
  const next = scroll(state, metrics(700, 1300), true)

  assert.equal(next['following'], true)
  assert.equal(next['paused'], false)
})

test('内容增长与贴底保持跟随', () => {
  const grown = scroll(following(), metrics(1000, 1400))
  assert.equal(grown['following'], true)

  const wobble = scroll(grown, metrics(999, 1400))
  assert.equal(wobble['following'], true, '亚像素回弹不应暂停跟随')
})

test('程序化滚到底部不算用户恢复阅读尾部', () => {
  const paused = scroll(following(), metrics(700, 1300))
  assert.equal(paused['paused'], true)

  const reachedBottom = scroll(paused, metrics(900, 1300))
  assert.equal(reachedBottom['paused'], true, '暂停状态必须独立于当前是否在底部')
  assert.equal(reachedBottom['following'], false)
})

test('用户向下滚动到底部后恢复跟随', () => {
  const paused = scroll(following(), metrics(700, 1300))
  const armed = reduce!(paused, { kind: 'wheel', deltaY: 120 })
  const resumed = scroll(armed, metrics(900, 1300))

  assert.equal(resumed['following'], true)
  assert.equal(resumed['paused'], false)
  assert.equal(resumed['downwardIntent'], false)
  assert.equal(resumed['pinIntent'], false)
})

test('点击回到底部控件后恢复跟随', () => {
  const paused = scroll(following(), metrics(700, 1300))
  const pressed = reduce!(paused, { kind: 'pin-control', pressed: true })
  const resumed = scroll(pressed, metrics(900, 1300))

  assert.equal(resumed['following'], true)
  assert.equal(resumed['paused'], false)
})

test('回底控件触发的程序化滚动同样恢复跟随', () => {
  const paused = scroll(following(), metrics(700, 1300))
  const pressed = reduce!(paused, { kind: 'pin-control', pressed: true })
  // The control's own scroll lands as a programmatic event; the reader asked
  // for it, so it may resume the follow even though it may never pause it.
  const resumed = scroll(pressed, metrics(900, 1300), true)

  assert.equal(resumed['following'], true)
  assert.equal(resumed['paused'], false)
  assert.equal(resumed['pinIntent'], false)
})

test('无变化的滚动事件返回同一个状态对象，避免无谓重渲染', () => {
  const state = following()
  const same = scroll(state, metrics(900, 1300))
  assert.equal(same, state)

  const idle = reduce!(state, { kind: 'wheel', deltaY: 0 })
  assert.equal(idle, state)

  const rested = reduce!(state, { kind: 'pin-control', pressed: false })
  assert.equal(rested, state)
})

test('贴底判定容差覆盖亚像素差异', () => {
  const atBottom = follow['isViewportAtBottom'] as ((metrics: unknown) => boolean) | undefined
  assert.equal(typeof atBottom, 'function', '需要实现贴底判定 isViewportAtBottom')

  assert.equal(atBottom!(metrics(900, 1300)), true)
  assert.equal(atBottom!(metrics(899, 1300)), true)
  assert.equal(atBottom!(metrics(897, 1300)), false)
  // Content shorter than the viewport counts as bottom too.
  assert.equal(atBottom!(metrics(0, 300)), true)
})

test('远离底部时的亚像素回弹不算用户上滚', () => {
  // The answer grew, so the offset lags the bottom until the next pin.
  const grown = scroll(following(), metrics(600, 1500))
  assert.equal(grown['following'], true)

  const echo = scroll(grown, metrics(599, 1500))
  assert.equal(echo['following'], true)
  assert.equal(echo['paused'], false)
})
