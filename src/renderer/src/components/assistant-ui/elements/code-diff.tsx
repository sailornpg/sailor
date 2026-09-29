'use client'

import type { ComponentProps } from 'react'
import { cn } from '@/lib/utils'
import { codeScroll, codeSurface, mono, paper } from './surfaces'

export type DiffKind = 'context' | 'added' | 'removed'

export interface DiffLine {
  kind: DiffKind
  text: string
}

const GUTTER: Record<DiffKind, string> = {
  context: '',
  added: '+',
  removed: '−',
}

export function CodeDiff({
  filename,
  additions,
  deletions,
  lines,
  cycle,
  className,
  ...props
}: Omit<
  ComponentProps<'div'>,
  'children' | 'filename' | 'additions' | 'deletions' | 'lines' | 'cycle'
> & {
  filename: string
  additions: number
  deletions: number
  lines: readonly DiffLine[]
  cycle: number
}) {
  return (
    <div
      data-slot="code-diff"
      className={cn(
        paper,
        'w-full max-w-md overflow-hidden rounded-2xl font-mono text-xs',
        className,
      )}

      {...props}
    >
      <div className="flex items-center justify-between px-4 pt-3 pb-2">
        <span className="min-w-0 break-all text-foreground/90">{filename}</span>
        <span className={cn(mono, 'shrink-0 ps-3 tabular-nums')}>
          <span className="text-emerald-600 dark:text-emerald-400">+{additions}</span>{' '}
          <span className="text-red-600 dark:text-red-400">−{deletions}</span>
        </span>
      </div>
      <div className={codeScroll}>
        <div className={codeSurface}>
          {lines.map((line, i) => (
            <div
              key={`${cycle}-${i}-${line.text}`}
              className={cn(
                'flex px-4 py-0.5 leading-relaxed whitespace-pre',
                i < 24 &&
                  'fade-in animate-in fill-mode-both duration-300 motion-reduce:animate-none',
                line.kind === 'context' && 'text-foreground/45',
                line.kind === 'added' &&
                  'bg-emerald-500/10 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300',
                line.kind === 'removed' && 'bg-red-500/10 text-red-700 dark:text-red-300',
              )}
              style={i < 24 ? { animationDelay: `${i * 60}ms` } : undefined}
            >
              <span className="w-4 shrink-0 select-none">{GUTTER[line.kind]}</span>
              <span>{line.text}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
