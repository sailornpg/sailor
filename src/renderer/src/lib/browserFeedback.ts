import { toolResultSchema, type ToolErrorCode, type ToolRecoveryAction } from '@shared/toolFeedback'

export type BrowserToolPhase = 'running' | 'succeeded' | 'failed' | 'cancelled'

export interface BrowserToolView {
  toolName: string
  phase: BrowserToolPhase
  summary: string
  /** 成功时的结构化数据（页面文本、标签页列表、尺寸等）。 */
  data: Record<string, unknown> | null
  errorCode: ToolErrorCode | null
  errorMessage: string | null
  recovery: ToolRecoveryAction[]
  /** 截图工具产出的 artifactRef：UI 按它去 main 取图。 */
  captureId: string | null
  truncated: boolean
}

export interface BrowserFeedbackInput {
  toolName: string
  result: unknown
  status: 'running' | 'complete' | 'error' | 'cancelled'
}

const EMPTY: BrowserToolView = {
  toolName: '',
  phase: 'running',
  summary: '浏览器操作进行中',
  data: null,
  errorCode: null,
  errorMessage: null,
  recovery: [],
  captureId: null,
  truncated: false,
}

/** 只解析合法的 ToolResult；工具还在跑或结果不是我们这个契约时返回进行中视图。 */
export function projectBrowserFeedback(input: BrowserFeedbackInput): BrowserToolView {
  const base: BrowserToolView = { ...EMPTY, toolName: input.toolName }
  if (input.status === 'running') return base
  if (input.status === 'cancelled')
    return { ...base, phase: 'cancelled', summary: '浏览器操作已取消' }

  const parsed = toolResultSchema.safeParse(input.result)
  if (!parsed.success) {
    return input.status === 'error'
      ? {
          ...base,
          phase: 'failed',
          summary: '浏览器操作失败',
          errorCode: 'INTERNAL_ERROR',
          errorMessage: '工具返回了无法识别的结果。',
          recovery: [{ action: 'retry', reason: '可重试一次；若仍失败，请查看应用日志。' }],
        }
      : base
  }
  const result = parsed.data
  if (!result.ok) {
    return {
      ...base,
      phase: 'failed',
      summary: result.summary,
      errorCode: result.error.code,
      errorMessage: result.error.message,
      recovery: result.error.recovery,
      truncated: result.truncated,
    }
  }
  const data =
    result.data !== null && typeof result.data === 'object'
      ? (result.data as Record<string, unknown>)
      : null
  const capture = result.artifactRefs?.find((ref) => ref.kind === 'browser-capture')
  return {
    ...base,
    phase: 'succeeded',
    summary: result.summary,
    data,
    captureId: capture?.id ?? null,
    truncated: result.truncated,
  }
}

/** read_page 的文本自带截断说明，这里不重复加噪声。 */
export function browserViewText(view: BrowserToolView, limit = 4000): string {
  const text = typeof view.data?.text === 'string' ? view.data.text : ''
  return text.length > limit ? `${text.slice(0, limit)}\n…（已截断显示）` : text
}

export function browserViewTabs(
  view: BrowserToolView,
): { id: string; title: string; url: string }[] {
  const tabs = view.data?.tabs
  if (!Array.isArray(tabs)) return []
  return tabs.flatMap((entry) => {
    if (typeof entry !== 'object' || entry === null) return []
    const record = entry as Record<string, unknown>
    if (typeof record.id !== 'string') return []
    return [
      {
        id: record.id,
        title: typeof record.title === 'string' ? record.title : '',
        url: typeof record.url === 'string' ? record.url : '',
      },
    ]
  })
}
