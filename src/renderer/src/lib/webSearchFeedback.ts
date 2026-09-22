import { toolResultSchema, type ToolRecoveryAction } from '@shared/toolFeedback'
import { webSearchDataSchema } from '@shared/webSearch'

export interface WebSearchFeedbackSource {
  sourceId: string
  title: string
  url: string
  domain: string
  snippet: string
}

export interface WebSearchFeedback {
  phase: 'running' | 'succeeded' | 'failed' | 'cancelled'
  query: string
  summary: string
  sources: WebSearchFeedbackSource[]
  errorCode?: string
  errorMessage?: string
  recovery?: ToolRecoveryAction[]
}

export function projectWebSearchFeedback(input: {
  toolName: string
  args: unknown
  result: unknown
  status: 'running' | 'complete' | 'error' | 'cancelled'
}): WebSearchFeedback | null {
  if (input.toolName !== 'web_search') return null
  const query = getQuery(input.args)
  if (input.status === 'running') {
    return { phase: 'running', query, summary: '正在搜索 Web', sources: [] }
  }
  if (input.status === 'cancelled') {
    return { phase: 'cancelled', query, summary: 'Web 搜索已停止', sources: [] }
  }

  const wrapped = toolResultSchema.safeParse(input.result)
  if (wrapped.success && !wrapped.data.ok) {
    return {
      phase: 'failed',
      query,
      summary: wrapped.data.summary,
      sources: [],
      errorCode: wrapped.data.error.code,
      errorMessage: wrapped.data.error.message,
      recovery: wrapped.data.error.recovery,
    }
  }
  const raw = wrapped.success && wrapped.data.ok ? wrapped.data.data : input.result
  const candidate = raw && typeof raw === 'object' && 'results' in raw
    ? {
        query,
        sources: (raw as { results?: unknown[] }).results?.map((item) => {
          if (!item || typeof item !== 'object') return null
          const value = item as Record<string, unknown>
          return {
            sourceId: `src_${stableHex(String(value.id ?? value.url ?? value.title ?? ''))}`,
            title: typeof value.title === 'string' ? value.title : '',
            url: typeof value.url === 'string' ? value.url : '',
            snippet: typeof value.snippet === 'string' ? value.snippet : '',
            retrievedAt: new Date().toISOString(),
          }
        }).filter(Boolean),
      }
    : raw
  const data = webSearchDataSchema.safeParse(candidate)
  if (!data.success) return null
  return {
    phase: 'succeeded',
    query: data.data.query,
    summary: wrapped.success && wrapped.data.ok ? wrapped.data.summary : `已找到 ${data.data.sources.length} 条来源`,
    sources: data.data.sources.map(source => ({
      sourceId: source.sourceId,
      title: source.title,
      url: source.url,
      domain: new URL(source.url).hostname.replace(/^www\./, ''),
      snippet: source.snippet,
    })),
  }
}

function stableHex(value: string): string {
  let hash = 2166136261
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index)
    hash = Math.imul(hash, 16777619)
  }
  return (hash >>> 0).toString(16).padStart(8, '0').repeat(2)
}

function getQuery(args: unknown): string {
  if (!args || typeof args !== 'object') return ''
  const query = (args as { query?: unknown }).query
  return typeof query === 'string' ? query : ''
}
