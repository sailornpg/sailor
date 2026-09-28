import { useEffect, useState } from 'react'
import type { PiDisplayEvent } from '@shared/piDisplayEvent'
import { PiEventLine } from './PiEventRecord'

export function PiRuntimeEventStatus({ chatId }: { chatId: string }) {
  const [current, setCurrent] = useState<PiDisplayEvent | null>(null)
  useEffect(() => {
    setCurrent(null)
    return window.sailor.agent.subscribe((_runId, item) => {
      if (item.type !== 'pi-event' || item.event.chatId !== chatId) return
      const event = item.event.event
      if (event.phase === 'started') setCurrent(event)
      else setCurrent((previous) => (previous?.id === event.id ? null : previous))
    })
  }, [chatId])
  return current ? <PiEventLine event={current} /> : null
}
