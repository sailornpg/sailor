import type {
  ToolCallMessagePartComponent,
  ToolCallMessagePartProps,
  ToolCallMessagePartStatus,
} from '@assistant-ui/react'
import { useEffect, useState } from 'react'
import { ToolFallback } from '@/components/assistant-ui/elements/tool-fallback.aui'
import {
  browserViewTabs,
  browserViewText,
  projectBrowserFeedback,
  type BrowserToolView,
} from '@/lib/browserFeedback'

function statusFor(view: BrowserToolView, original: ToolCallMessagePartStatus | undefined) {
  if (view.phase !== 'failed') return original
  return {
    type: 'incomplete' as const,
    reason: 'error' as const,
    error: `${view.errorCode ?? 'INTERNAL_ERROR'}: ${view.errorMessage ?? view.summary}`,
  }
}

/** 截图存在 main 侧的会话目录里，这里按 artifactRef 现取现显示。 */
function BrowserCapture({ captureId, chatId }: { captureId: string; chatId: string }) {
  const [source, setSource] = useState<string | null>(null)
  const [failure, setFailure] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    window.sailor.browser
      .readCapture({ chatId, captureId })
      .catch(() => null)
      .then((value) => {
        if (cancelled) return
        if (value === null) setFailure('截图已不可用。')
        else setSource(value)
      })
    return () => {
      cancelled = true
    }
  }, [captureId, chatId])

  if (failure !== null) return <p className="text-muted-foreground text-xs">{failure}</p>
  if (source === null) return <p className="text-muted-foreground text-xs">正在读取截图…</p>
  return (
    <img
      alt="浏览器截图"
      className="border-border/60 max-h-72 w-full rounded-md border object-contain"
      src={source}
    />
  )
}

function BrowserResult({ view }: { view: BrowserToolView }) {
  const text = browserViewText(view)
  const tabs = browserViewTabs(view)
  const messages = Array.isArray(view.data?.messages) ? view.data.messages : []
  const size =
    typeof view.data?.width === 'number' && typeof view.data?.height === 'number'
      ? `${view.data.width}×${view.data.height}`
      : null

  return (
    <div className="space-y-2 text-xs" data-browser-phase={view.phase}>
      <div className="font-medium">{view.summary}</div>
      {view.errorMessage !== null && view.errorMessage !== view.summary && (
        <div className="text-destructive">{view.errorMessage}</div>
      )}
      {view.captureId !== null && typeof view.data?.chatId === 'string' && (
        <BrowserCapture captureId={view.captureId} chatId={view.data.chatId} />
      )}
      {size !== null && <div className="text-muted-foreground">尺寸：{size}</div>}
      {tabs.length > 0 && (
        <ul className="text-muted-foreground space-y-0.5">
          {tabs.map((tab) => (
            <li key={tab.id}>
              {tab.title === '' ? '新标签页' : tab.title}
              {tab.url === '' ? '' : ` — ${tab.url}`}
            </li>
          ))}
        </ul>
      )}
      {messages.length > 0 && (
        <ul className="text-muted-foreground space-y-0.5">
          {messages.slice(-10).map((message, index) => {
            const record =
              typeof message === 'object' && message !== null
                ? (message as Record<string, unknown>)
                : {}
            return (
              <li key={index}>
                {typeof record.level === 'string' ? `${record.level}: ` : ''}
                {typeof record.text === 'string' ? record.text : ''}
              </li>
            )
          })}
        </ul>
      )}
      {text !== '' && (
        <pre className="bg-muted/50 max-h-72 overflow-auto rounded-md p-2 whitespace-pre-wrap">
          {text}
        </pre>
      )}
      {view.truncated && <div className="text-muted-foreground">结果已截断。</div>}
      {view.recovery.length > 0 && (
        <div className="text-muted-foreground">
          <div className="font-medium">下一步</div>
          <ul className="list-disc pl-4">
            {view.recovery.map((item, index) => (
              <li key={`${item.action}-${index}`}>{item.reason}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}

export const SailorBrowserTool: ToolCallMessagePartComponent = (
  props: ToolCallMessagePartProps,
) => {
  const view = projectBrowserFeedback({
    toolName: props.toolName,
    result: props.result,
    status:
      props.status?.type === 'running'
        ? 'running'
        : props.status?.type === 'incomplete' && props.status.reason === 'cancelled'
          ? 'cancelled'
          : props.status?.type === 'incomplete'
            ? 'error'
            : 'complete',
  })
  const status = statusFor(view, props.status)
  return (
    <ToolFallback.Root defaultOpen={view.phase === 'failed' || view.captureId !== null}>
      <ToolFallback.Trigger toolName={props.toolName} status={status} />
      <ToolFallback.Content>
        <ToolFallback.Error status={status} />
        <ToolFallback.Args argsText={props.argsText} />
        <BrowserResult view={view} />
      </ToolFallback.Content>
    </ToolFallback.Root>
  )
}
