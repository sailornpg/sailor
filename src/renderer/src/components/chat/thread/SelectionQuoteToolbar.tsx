import { useState, type RefObject } from 'react'
import { SelectionToolbarPrimitive } from '@assistant-ui/react'
import { MessageSquarePlus, MessageSquareQuote } from 'lucide-react'
import { MESSAGE_QUOTE_MAX_BYTES, type MessageQuote } from '@shared/messageQuote'

function selectedMessage(root: HTMLElement | null): MessageQuote | null {
  const selection = window.getSelection()
  if (!root || !selection || selection.isCollapsed || !selection.anchorNode || !selection.focusNode)
    return null
  if (!root.contains(selection.anchorNode) || !root.contains(selection.focusNode)) return null
  const element =
    selection.anchorNode instanceof HTMLElement
      ? selection.anchorNode
      : selection.anchorNode.parentElement
  const message = element?.closest<HTMLElement>('[data-message-id]')
  const text = selection.toString().trim()
  return message?.dataset.messageId && text ? { text, messageId: message.dataset.messageId } : null
}

export function SelectionQuoteToolbar({
  root,
  onOpenSideChat,
}: {
  root: RefObject<HTMLDivElement | null>
  onOpenSideChat: (question?: string, quote?: MessageQuote) => Promise<void>
}) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  return (
    <SelectionToolbarPrimitive.Root className="selection-quote-toolbar">
      <SelectionQuoteActions
        root={root}
        busy={busy}
        error={error}
        onQuoteSide={async (quote) => {
          setBusy(true)
          setError(null)
          try {
            await onOpenSideChat(undefined, quote)
            window.getSelection()?.removeAllRanges()
          } catch (cause) {
            setError(cause instanceof Error ? cause.message : '侧聊创建失败。')
          } finally {
            setBusy(false)
          }
        }}
      />
    </SelectionToolbarPrimitive.Root>
  )
}

function SelectionQuoteActions({
  root,
  busy,
  error,
  onQuoteSide,
}: {
  root: RefObject<HTMLDivElement | null>
  busy: boolean
  error: string | null
  onQuoteSide: (quote: MessageQuote) => Promise<void>
}) {
  const quote = selectedMessage(root.current)
  if (!quote) return null
  const tooLarge = new TextEncoder().encode(quote.text).length > MESSAGE_QUOTE_MAX_BYTES
  return (
    <>
      <div className="selection-quote-actions">
        <SelectionToolbarPrimitive.Quote
          className="selection-quote-action"
          disabled={busy || tooLarge}
        >
          <MessageSquareQuote size={15} aria-hidden />
          添加到对话
        </SelectionToolbarPrimitive.Quote>
        <button
          className="selection-quote-action"
          disabled={busy || tooLarge}
          type="button"
          onClick={() => {
            void onQuoteSide(quote)
          }}
        >
          <MessageSquarePlus size={15} aria-hidden />
          在侧边聊天中提问
        </button>
      </div>
      {(error || tooLarge) && (
        <p className="selection-quote-error" role="alert">
          {error ?? '引用超过 8 KiB，请缩小选区。'}
        </p>
      )}
    </>
  )
}
