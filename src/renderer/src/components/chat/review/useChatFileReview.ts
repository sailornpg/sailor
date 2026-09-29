import { useCallback, useEffect, useState } from 'react'
import type { ChatFileChangeSummary } from '@shared/fileReview'

export function useChatFileReview(chatId: string | null) {
  const [summary, setSummary] = useState<ChatFileChangeSummary | null>(null)
  const [loading, setLoading] = useState(Boolean(chatId))
  const [error, setError] = useState<string | null>(null)
  const [revision, setRevision] = useState(0)

  const refresh = useCallback(() => setRevision((value) => value + 1), [])

  useEffect(() => {
    if (!chatId) return
    return window.sailor.workspaces.review.subscribe((changedChatId) => {
      if (changedChatId === chatId) refresh()
    })
  }, [chatId, refresh])

  useEffect(() => {
    if (!chatId) return
    let active = true
    window.sailor.workspaces.review
      .summary(chatId)
      .then((value) => {
        if (!active) return
        setSummary(value)
        setError(null)
      })
      .catch((cause: unknown) => {
        if (!active) return
        setError(cause instanceof Error ? cause.message : '无法读取会话文件变更。')
      })
      .finally(() => {
        if (active) setLoading(false)
      })
    return () => {
      active = false
    }
  }, [chatId, revision])

  return {
    summary: summary?.chatId === chatId ? summary : null,
    loading: loading && summary?.chatId !== chatId,
    error,
    refresh,
  }
}
