import { FileDiff } from 'lucide-react'
import { useTurnFileReview } from './useTurnFileReview'
import { requestPanelOpen } from '@/lib/panels/panelData'

export function TurnFileChangeCard({ chatId, turnId }: { chatId: string; turnId: string }) {
  const { summary } = useTurnFileReview(chatId, turnId)
  // Keep the last completed summary mounted while a journal notification refreshes it.
  // Otherwise every file write briefly removes all previous turn cards from the thread.
  if (!summary || summary.fileCount === 0) return null
  return (
    <section className="sailor-turn-file-card" data-turn-file-card data-turn-id={turnId}>
      <button
        type="button"
        className="sailor-turn-file-card__header"
        onClick={() => requestPanelOpen({ panelId: 'review', data: { review: { turnId } } })}
        aria-label={`审查本轮修改的 ${summary.fileCount} 个文件`}
      >
        <span className="sailor-turn-file-card__icon" aria-hidden>
          <FileDiff size={18} />
        </span>
        <span className="min-w-0 flex-1 text-left">
          <strong>已编辑 {summary.fileCount} 个文件</strong>
          <span className="sailor-turn-file-card__subtitle">查看本轮文件变更 ↗</span>
          {summary.addedLines !== null && summary.removedLines !== null && (
            <span className="sailor-turn-file-card__stats">
              <span className="text-emerald-600 dark:text-emerald-400">+{summary.addedLines}</span>{' '}
              <span className="text-red-600 dark:text-red-400">−{summary.removedLines}</span>
            </span>
          )}
        </span>
        <span className="sailor-turn-file-card__action">审查</span>
      </button>
      <div className="sailor-turn-file-card__files" aria-label="本轮变更文件">
        {summary.changes.map((change) => (
          <button
            type="button"
            key={change.id}
            onClick={() => requestPanelOpen({ panelId: 'review', data: { review: { turnId } } })}
            title={change.path}
          >
            <span>{change.path}</span>
            {change.addedLines !== null && change.removedLines !== null && (
              <span className="font-mono tabular-nums">
                <span className="text-emerald-600 dark:text-emerald-400">+{change.addedLines}</span>{' '}
                <span className="text-red-600 dark:text-red-400">−{change.removedLines}</span>
              </span>
            )}
          </button>
        ))}
      </div>
    </section>
  )
}
