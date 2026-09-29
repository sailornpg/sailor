import { FileDiff, RefreshCw } from 'lucide-react'
import { useEffect, useState } from 'react'
import { CodeDiff } from '@/components/assistant-ui/elements/code-diff'
import { Button } from '@/components/ui/button'
import { useChatFileReview } from '@/components/chat/review/useChatFileReview'
import { useTurnFileReview } from '@/components/chat/review/useTurnFileReview'
import type { PanelProps } from '@/lib/panels/registry'
import type { FileChange } from '@shared/fileReview'

const kindLabel = { added: '新增', modified: '修改', deleted: '删除' } as const

export default function ReviewPanel({ context, data }: PanelProps) {
  const chatId = context.chatId
  const turnId = data.review?.turnId ?? null
  const chatReview = useChatFileReview(chatId)
  const turnReview = useTurnFileReview(chatId, turnId)
  const { summary, loading, error, refresh } = turnId ? turnReview : chatReview
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [detail, setDetail] = useState<FileChange | null>(null)
  const [detailError, setDetailError] = useState<string | null>(null)
  const [detailLoading, setDetailLoading] = useState(false)
  const activeId = summary?.changes.some((change) => change.id === selectedId)
    ? selectedId
    : (summary?.changes[0]?.id ?? null)

  useEffect(() => {
    setSelectedId(null)
    setDetail(null)
    setDetailError(null)
  }, [turnId])

  useEffect(() => {
    if (!chatId || !activeId || (turnId && summary?.turnId !== turnId)) return
    let active = true
    setDetailLoading(true)
    const detailPromise = turnId
      ? window.sailor.workspaces.review.turnDetail({ chatId, turnId, changeId: activeId })
      : window.sailor.workspaces.review.detail({ chatId, changeId: activeId })
    detailPromise
      .then((value) => {
        if (!active) return
        setDetail(value)
        setDetailError(null)
      })
      .catch((cause: unknown) => {
        if (!active) return
        setDetailError(cause instanceof Error ? cause.message : '无法读取文件差异。')
      })
      .finally(() => {
        if (active) setDetailLoading(false)
      })
    return () => {
      active = false
    }
  }, [chatId, turnId, activeId, summary])

  const currentDetail = detail?.chatId === chatId && detail.id === activeId ? detail : null

  if (!chatId)
    return (
      <div className="panel-placeholder" role="status">
        先打开一个会话。
      </div>
    )

  return (
    <div className="flex h-full min-h-0 flex-col" data-review-panel>
      <div className="flex shrink-0 items-center justify-between border-b border-border/60 px-4 py-3">
        <div className="min-w-0">
          <h2 className="text-sm font-medium text-foreground">
            {turnId ? '本轮文件变更' : '会话文件变更'}
          </h2>
          {summary && (
            <p className="mt-0.5 text-xs text-muted-foreground">{summary.fileCount} 个文件</p>
          )}
        </div>
        <Button
          size="icon"
          variant="ghost"
          title="刷新变更"
          aria-label="刷新变更"
          onClick={refresh}
        >
          <RefreshCw size={15} aria-hidden />
        </Button>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto">
        {/* {summary?.hasUntrackedHostExec && (
          <p
            className="border-b border-border/60 px-4 py-3 text-xs leading-5 text-muted-foreground"
            role="note"
          >
            本会话运行过宿主命令。命令产生的文件变更未跟踪，以下列表可能不完整。
          </p>
        )}
        {summary?.hasTrackingError && (
          <p
            className="border-b border-border/60 px-4 py-3 text-xs leading-5 text-destructive"
            role="alert"
          >
            部分文件变更记录未保存，本会话的审查结果可能不完整。
          </p>
        )}
        {summary?.hasIncompleteDiff && !summary.hasTrackingError && (
          <p
            className="border-b border-border/60 px-4 py-3 text-xs leading-5 text-muted-foreground"
            role="note"
          >
            部分文件差异无法完整计算，汇总行数可能未知。
          </p>
        )} */}
        {loading && (
          <p className="px-4 py-5 text-sm text-muted-foreground" role="status">
            正在读取变更…
          </p>
        )}
        {error && (
          <div className="px-4 py-5 text-sm text-destructive" role="alert">
            <p>读取会话变更失败：{error}</p>
            <Button variant="ghost" size="sm" className="mt-2" onClick={refresh}>
              重试
            </Button>
          </div>
        )}
        {!loading && !error && summary?.fileCount === 0 && (
          <div className="panel-placeholder" role="status">
            <FileDiff size={18} className="panel-placeholder-icon" aria-hidden />
            <p className="panel-placeholder-title">暂无已记录的文件变更</p>
          </div>
        )}
        {summary && summary.fileCount > 0 && (
          <>
            <div className="border-b border-border/60 py-1" aria-label="变更文件">
              {summary.changes.map((change) => (
                <button
                  type="button"
                  key={change.id}
                  aria-current={change.id === activeId ? 'true' : undefined}
                  className="flex w-full min-w-0 items-center gap-2 px-4 py-2 text-left text-xs hover:bg-foreground/[0.05] focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-ring aria-current:bg-foreground/[0.07]"
                  onClick={() => setSelectedId(change.id)}
                  title={change.path}
                >
                  <FileDiff size={14} className="shrink-0 text-muted-foreground" aria-hidden />
                  <span className="min-w-0 flex-1 truncate font-mono">{change.path}</span>
                  <span className="shrink-0 text-muted-foreground">{kindLabel[change.kind]}</span>
                  {change.addedLines !== null && change.removedLines !== null && (
                    <span className="shrink-0 font-mono tabular-nums">
                      <span className="text-emerald-600 dark:text-emerald-400">
                        +{change.addedLines}
                      </span>{' '}
                      <span className="text-red-600 dark:text-red-400">−{change.removedLines}</span>
                    </span>
                  )}
                </button>
              ))}
            </div>
            {detailLoading && !currentDetail && (
              <p className="px-4 py-5 text-sm text-muted-foreground" role="status">
                正在读取差异…
              </p>
            )}
            {detailError && (
              <p className="px-4 py-5 text-sm text-destructive" role="alert">
                {detailError}
              </p>
            )}
            {currentDetail && !detailError && (
              <div className="min-w-0 px-3 py-4">
                {currentDetail.state === 'stale' && (
                  <p className="mb-3 text-xs leading-5 text-muted-foreground" role="note">
                    文件在记录后又发生变化；以下是本会话保存的历史差异。
                  </p>
                )}
                {currentDetail.state === 'unavailable' && (
                  <p className="mb-3 text-xs leading-5 text-destructive" role="note">
                    当前文件状态无法核验；以下仅显示已保存的历史记录。
                  </p>
                )}
                {currentDetail.truncated ||
                currentDetail.addedLines === null ||
                currentDetail.removedLines === null ? (
                  <p className="break-all text-xs leading-5 text-muted-foreground" role="status">
                    {currentDetail.path} 的差异超限或不是可预览文本，无法可靠计算行数。
                  </p>
                ) : (
                  <CodeDiff
                    className="max-w-none rounded-md"
                    filename={currentDetail.path}
                    additions={currentDetail.addedLines}
                    deletions={currentDetail.removedLines}
                    lines={currentDetail.lines}
                    cycle={0}
                  />
                )}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}
