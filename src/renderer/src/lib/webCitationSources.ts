import { projectWebSearchFeedback, type WebSearchFeedbackSource } from './webSearchFeedback'

/** A web source cited in one assistant turn, numbered for inline reference. */
export interface WebCitation extends WebSearchFeedbackSource {
  /** 1-based reference number, assigned in first-seen order. */
  number: number
}

/** Structural view of a message part; message state is untrusted input, so narrow here. */
interface CitationPart {
  type?: unknown
  toolName?: unknown
  args?: unknown
  result?: unknown
  status?: { type?: unknown; reason?: unknown } | undefined
}

function projectStatus(status: CitationPart['status']): 'running' | 'complete' | 'error' | 'cancelled' {
  if (status?.type === 'running') return 'running'
  if (status?.type === 'incomplete') return status.reason === 'cancelled' ? 'cancelled' : 'error'
  return 'complete'
}

/**
 * Matching key for a source URL. A model citing a page routinely adds or drops
 * `www.`, a trailing slash, query string or fragment, and none of those change
 * which page was cited. Host and path stay, because they do.
 */
export function citationUrlKey(url: string): string | null {
  let parsed: URL
  try {
    parsed = new URL(url)
  } catch {
    return null
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return null
  const host = parsed.hostname.toLowerCase().replace(/^www\./, '')
  if (!host) return null
  return `${host}${parsed.pathname.replace(/\/+$/, '').toLowerCase()}`
}

/** The citation a link points at, or undefined when the turn has no such source. */
export function citationForUrl(
  citations: readonly WebCitation[],
  href: string,
): WebCitation | undefined {
  const key = citationUrlKey(href)
  if (!key) return undefined
  return citations.find((citation) => citationUrlKey(citation.url) === key)
}

/**
 * Whether a link's visible text is just its own URL. Such a link carries no
 * wording worth keeping, so the citation chip replaces it instead of sitting
 * next to a duplicated address.
 */
export function isBareUrlText(text: string, href: string): boolean {
  const trimmed = text.trim()
  if (!trimmed || /\s/.test(trimmed)) return false
  const key = citationUrlKey(href)
  if (!key) return false
  const asWritten = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`
  return citationUrlKey(asWritten) === key
}

/**
 * Collect the web sources a message's tool calls returned, deduped by page and
 * numbered in first-seen order so every reference in the answer resolves to a
 * stable number.
 */
export function collectWebCitations(parts: readonly unknown[]): WebCitation[] {
  const byPage = new Map<string, WebCitation>()
  for (const part of parts) {
    if (!part || typeof part !== 'object') continue
    const candidate = part as CitationPart
    if (candidate.type !== 'tool-call' || typeof candidate.toolName !== 'string') continue
    const view = projectWebSearchFeedback({
      toolName: candidate.toolName,
      args: candidate.args,
      result: candidate.result,
      status: projectStatus(candidate.status),
    })
    if (!view) continue
    for (const source of view.sources) {
      const key = citationUrlKey(source.url)
      if (!key || byPage.has(key)) continue
      byPage.set(key, { ...source, number: byPage.size + 1 })
    }
  }
  return [...byPage.values()]
}
