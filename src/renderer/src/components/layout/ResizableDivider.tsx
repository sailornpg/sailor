import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type PointerEvent,
} from 'react'

export type DividerOrientation = 'vertical' | 'horizontal'
export const clampDividerValue = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(min, value))

export function resizeFromPointer(input: {
  orientation: DividerOrientation
  startValue: number
  startPointer: number
  pointer: number
  min: number
  max: number
}) {
  const delta = input.pointer - input.startPointer
  return clampDividerValue(input.startValue + delta, input.min, input.max)
}

export function resizeFromKeyboard(input: {
  orientation: DividerOrientation
  value: number
  key: string
  min: number
  max: number
  shiftKey?: boolean
}) {
  const positive =
    input.orientation === 'vertical' ? input.key === 'ArrowRight' : input.key === 'ArrowDown'
  const negative =
    input.orientation === 'vertical' ? input.key === 'ArrowLeft' : input.key === 'ArrowUp'
  if (!positive && !negative) return input.value
  const step = input.shiftKey ? 64 : 16
  return clampDividerValue(input.value + (positive ? step : -step), input.min, input.max)
}

export function ResizableDivider({
  orientation,
  label,
  value,
  min,
  max,
  onChange,
  onCommit,
  className = '',
  side,
}: {
  orientation: DividerOrientation
  label: string
  value: number
  min: number
  max: number
  onChange: (value: number) => void
  onCommit?: () => void
  className?: string
  side?: 'left' | 'right'
}) {
  const [dragging, setDragging] = useState(false)
  const drag = useRef<{ pointerId: number; startPointer: number; startValue: number } | null>(null)
  const latest = useRef({ orientation, value, onChange, onCommit })
  latest.current = { orientation, value, onChange, onCommit }
  const end = useCallback((commit: boolean) => {
    if (!drag.current) return
    drag.current = null
    setDragging(false)
    if (commit) latest.current.onCommit?.()
  }, [])
  useEffect(() => {
    if (!dragging) return
    const move = (event: globalThis.PointerEvent) => {
      const active = drag.current
      if (!active || active.pointerId !== event.pointerId) return
      if (event.buttons === 0) return end(true)
      const pointer = latest.current.orientation === 'vertical' ? event.clientX : event.clientY
      latest.current.onChange(
        resizeFromPointer({
          ...active,
          orientation: latest.current.orientation,
          pointer,
          min,
          max,
        }),
      )
    }
    const up = () => end(true)
    const cancel = (event: globalThis.KeyboardEvent) => {
      if (event.key === 'Escape') end(false)
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
    window.addEventListener('pointercancel', up)
    window.addEventListener('keydown', cancel)
    return () => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
      window.removeEventListener('pointercancel', up)
      window.removeEventListener('keydown', cancel)
    }
  }, [dragging, end, min, max])
  const pointerDown = (event: PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return
    event.preventDefault()
    drag.current = {
      pointerId: event.pointerId,
      startPointer: orientation === 'vertical' ? event.clientX : event.clientY,
      startValue: value,
    }
    setDragging(true)
  }
  const keyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const next = resizeFromKeyboard({
      orientation,
      value,
      key: event.key,
      min,
      max,
      shiftKey: event.shiftKey,
    })
    if (next === value) return
    event.preventDefault()
    onChange(next)
    onCommit?.()
  }
  return (
    <div
      className={className ? `pane-resizer ${className}` : 'pane-resizer'}
      data-side={side}
      data-orientation={orientation}
      data-dragging={dragging}
      role="separator"
      aria-label={label}
      aria-orientation={orientation === 'vertical' ? 'vertical' : 'horizontal'}
      aria-valuemin={min}
      aria-valuemax={max}
      aria-valuenow={Math.round(value)}
      tabIndex={0}
      onPointerDown={pointerDown}
      onKeyDown={keyDown}
    >
      <span aria-hidden className="pane-resizer-grip" />
    </div>
  )
}
