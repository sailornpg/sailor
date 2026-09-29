import { useCallback, useEffect, useState } from 'react'
import type { TurnFileChangeSummary } from '@shared/fileReview'

export function useTurnFileReview(chatId: string | null, turnId: string | null) {
  const [summary, setSummary] = useState<TurnFileChangeSummary | null>(null)
  const [loading, setLoading] = useState(Boolean(chatId && turnId))
  const [error, setError] = useState<string | null>(null)
  const [revision, setRevision] = useState(0)
  const refresh = useCallback(() => setRevision((value) => value + 1), [])

  useEffect(() => {
    if (!chatId || !turnId) return
    return window.sailor.workspaces.review.subscribe((changedChatId) => {
      if (changedChatId === chatId) refresh()
    })
  }, [chatId, turnId, refresh])

  useEffect(() => {
    if (!chatId || !turnId) {
      setSummary(null)
      setLoading(false)
      return
    }
    let active = true
    setLoading(true)
    window.sailor.workspaces.review
      .turnSummary({ chatId, turnId })
      .then((value) => {
        if (!active) return
        setSummary(value)
        setError(null)
      })
      .catch((cause: unknown) => {
        if (!active) return
        setError(cause instanceof Error ? cause.message : '无法读取本轮文件变更。')
      })
      .finally(() => active && setLoading(false))
    return () => {
      active = false
    }
  }, [chatId, turnId, revision])

  return { summary, loading, error, refresh }
}
