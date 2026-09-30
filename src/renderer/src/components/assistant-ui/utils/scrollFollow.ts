/**
 * Scroll-follow arbitration for the thread viewport.
 *
 * While an answer streams, three writers move `scrollTop`: the runtime's
 * follow-the-tail pin, the browser's scroll anchoring, and layout changes above
 * the tail. Only real input may stop the follow, and only real input may resume
 * it; everything else is a layout side effect and must leave the state alone.
 *
 * Sailor deviation from the upstream element. This module deliberately has no
 * DOM dependency so the decision table stays unit-testable; `thread.aui.tsx`
 * feeds it wheel, pointer and scroll observations.
 */

export type ScrollMetrics = {
  scrollTop: number
  scrollHeight: number
  clientHeight: number
}

export type ScrollFollowState = {
  /** The viewport keeps pinning itself to the newest content. */
  following: boolean
  /** The reader deliberately left the tail. */
  paused: boolean
  /** A downward wheel arrived after the pause. */
  downwardIntent: boolean
  /** The reader pressed the scroll-to-bottom control. */
  pinIntent: boolean
  scrollTop: number
  scrollHeight: number
}

export type ScrollFollowEvent =
  | { kind: 'wheel'; deltaY: number }
  | { kind: 'pin-control'; pressed: boolean }
  | { kind: 'scroll'; metrics: ScrollMetrics; programmatic: boolean }

/** Positions within this many pixels of the edge count as "there". */
export const EDGE_TOLERANCE_PX = 2

export const initialScrollFollow: ScrollFollowState = {
  following: true,
  paused: false,
  downwardIntent: false,
  pinIntent: false,
  scrollTop: 0,
  scrollHeight: 0,
}

export const isViewportAtBottom = ({
  scrollTop,
  scrollHeight,
  clientHeight,
}: ScrollMetrics): boolean => scrollHeight - scrollTop - clientHeight <= EDGE_TOLERANCE_PX

const isFollowing = (state: ScrollFollowState) =>
  state.following && !state.paused && !state.downwardIntent && !state.pinIntent

/**
 * Returns the next follow state, or the same object when the event changes
 * nothing, so React can skip the re-render.
 */
export function nextScrollFollow(
  state: ScrollFollowState,
  event: ScrollFollowEvent,
): ScrollFollowState {
  switch (event.kind) {
    case 'wheel': {
      if (event.deltaY < 0) {
        if (!state.following && state.paused && !state.downwardIntent && !state.pinIntent)
          return state
        return { ...state, following: false, paused: true, downwardIntent: false, pinIntent: false }
      }
      if (event.deltaY > 0) {
        if (state.downwardIntent) return state
        return { ...state, downwardIntent: true }
      }
      return state
    }

    case 'pin-control': {
      if (state.pinIntent === event.pressed) return state
      return { ...state, pinIntent: event.pressed }
    }

    case 'scroll': {
      const { scrollTop, scrollHeight } = event.metrics
      const moved = state.scrollTop !== scrollTop || state.scrollHeight !== scrollHeight
      const observed = moved ? { ...state, scrollTop, scrollHeight } : state

      // Our own pin produced this event; it says nothing about the reader
      // leaving the tail. A pin the reader asked for may still resume it.
      if (event.programmatic) {
        if (isViewportAtBottom(event.metrics) && (state.downwardIntent || state.pinIntent)) {
          return {
            ...observed,
            following: true,
            paused: false,
            downwardIntent: false,
            pinIntent: false,
          }
        }
        return observed
      }

      if (
        isViewportAtBottom(event.metrics) &&
        (!state.paused || state.downwardIntent || state.pinIntent)
      ) {
        return isFollowing(state)
          ? observed
          : { ...observed, following: true, paused: false, downwardIntent: false, pinIntent: false }
      }

      // A real upward gesture keeps the scroll height; a layout or anchoring
      // correction above the tail moves the offset while the answer grows.
      const movedUpBy = state.scrollTop - scrollTop
      if (movedUpBy > EDGE_TOLERANCE_PX && state.scrollHeight === scrollHeight) {
        if (!state.following && state.paused && !state.downwardIntent && !state.pinIntent)
          return observed
        return {
          ...observed,
          following: false,
          paused: true,
          downwardIntent: false,
          pinIntent: false,
        }
      }

      return observed
    }
  }
}
