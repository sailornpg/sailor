import { useEffect, useRef, useState } from 'react'
import type { ToolCallMessagePartProps } from '@assistant-ui/react'
import { askUserRequestSchema, type AskUserResponse } from '@shared/askUser'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { useSailorAskUserResponder } from '../runtime/SailorChatProvider'
import { pendingAskUserKey } from '../composer/pendingAskUser'

export type SailorAskUserCardProps = Pick<
  ToolCallMessagePartProps,
  'toolCallId' | 'args' | 'result'
> & {
  status?: ToolCallMessagePartProps['status']
  chatId?: string
}

function terminalLabel(result: unknown): string | null {
  if (!result || typeof result !== 'object' || !('outcome' in result)) return null
  const outcome = (result as { outcome?: string }).outcome
  return outcome === 'answered'
    ? '已回答'
    : outcome === 'skipped'
      ? '已跳过'
      : outcome === 'cancelled'
        ? '已取消'
        : outcome === 'expired'
          ? '已过期'
          : outcome === 'denied'
            ? '已拒绝'
            : null
}

export function SailorAskUserCard({ toolCallId, args, status, result }: SailorAskUserCardProps) {
  const parsed = askUserRequestSchema.safeParse(args)
  const [optionId, setOptionId] = useState<string>()
  const [text, setText] = useState('')
  const [submitted, setSubmitted] = useState(false)
  const [error, setError] = useState<string>()
  const respondToAskUser = useSailorAskUserResponder()

  if (!parsed.success)
    return (
      <div className="text-destructive my-2 text-sm" role="alert">
        无法显示用户问题
      </div>
    )

  const finished = terminalLabel(result)
  if (finished || (status?.type === 'incomplete' && status.reason === 'cancelled'))
    return (
      <div className="text-muted-foreground my-2 text-sm" role="status">
        {finished ?? '已取消'}
      </div>
    )

  const request = parsed.data
  const answer = async (response: AskUserResponse) => {
    if (submitted) return
    setSubmitted(true)
    setError(undefined)
    try {
      await respondToAskUser(toolCallId, response)
    } catch (failure) {
      setSubmitted(false)
      setError(failure instanceof Error ? failure.message : String(failure))
    }
  }
  const canAnswer = optionId !== undefined || (request.allowFreeform && text.trim().length > 0)

  return (
    <section className="my-2 w-full max-w-md space-y-3" aria-label="需要你的回答">
      <h3 className="text-foreground text-sm font-medium">{request.question}</h3>
      {request.options?.length ? (
        <div className="grid gap-2" role="radiogroup" aria-label="可选答案">
          {request.options.map((option) => (
            <button
              key={option.id}
              type="button"
              role="radio"
              aria-checked={optionId === option.id}
              disabled={submitted}
              onClick={() => setOptionId(option.id)}
              className={`rounded-md border px-3 py-2 text-left text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${optionId === option.id ? 'border-primary bg-primary/10' : 'border-border/60 hover:bg-muted/60'}`}
            >
              <span className="font-medium">{option.label}</span>
              {option.description && (
                <span className="text-muted-foreground mt-0.5 block text-xs">
                  {option.description}
                </span>
              )}
            </button>
          ))}
        </div>
      ) : null}
      {request.allowFreeform && (
        <Textarea
          value={text}
          onChange={(event) => setText(event.target.value)}
          disabled={submitted}
          aria-label="补充说明"
          placeholder="补充说明（可选）"
          rows={3}
        />
      )}
      <div className="flex flex-wrap items-center gap-2">
        <Button
          type="button"
          size="sm"
          disabled={submitted || !canAnswer}
          onClick={() =>
            void answer({
              outcome: 'answered',
              ...(optionId ? { optionId } : {}),
              ...(text.trim() ? { text: text.trim() } : {}),
            })
          }
        >
          {submitted ? '提交中…' : '提交回答'}
        </Button>
        {request.allowSkip && (
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={submitted}
            onClick={() => void answer({ outcome: 'skipped' })}
          >
            跳过
          </Button>
        )}
      </div>
      {error && (
        <p className="text-destructive text-xs" role="alert">
          {error}
        </p>
      )}
    </section>
  )
}

export function SailorAskUserPopover({ pending }: { pending?: SailorAskUserCardProps }) {
  const [current, setCurrent] = useState<SailorAskUserCardProps | undefined>(pending)
  const currentRef = useRef<SailorAskUserCardProps | undefined>(pending)
  const [closing, setClosing] = useState(false)
  const pendingKey = pendingAskUserKey(pending)

  useEffect(() => {
    let frame: number | undefined
    let timer: number | undefined
    if (pending) {
      currentRef.current = pending
      setCurrent(pending)
      setClosing(true)
      frame = window.requestAnimationFrame(() => setClosing(false))
    } else if (currentRef.current) {
      setClosing(true)
      timer = window.setTimeout(() => {
        currentRef.current = undefined
        setCurrent(undefined)
      }, 220)
    }
    return () => {
      if (frame) window.cancelAnimationFrame(frame)
      if (timer) window.clearTimeout(timer)
    }
  }, [pendingKey])

  if (!current) return null
  return (
    <section
      className="sailor-composer-popover sailor-ask-user-popover bg-background border border-border/60 dark:bg-popover"
      data-state={closing ? 'closing' : 'open'}
      aria-label="需要你的回答"
    >
      <SailorAskUserCard {...current} />
    </section>
  )
}
