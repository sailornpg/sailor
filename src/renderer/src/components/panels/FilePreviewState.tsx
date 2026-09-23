import { File, FileWarning, LoaderCircle } from 'lucide-react'
import { Button } from '@/components/ui/button'

export function FilePreviewState({ title, description, kind = 'empty', onRetry }: {
  title: string
  description: string
  kind?: 'empty' | 'unsupported' | 'error' | 'loading'
  onRetry?: () => void
}) {
  const Icon = kind === 'loading' ? LoaderCircle : kind === 'error' ? FileWarning : File
  return (
    <div className="flex min-h-0 flex-1 items-center justify-center overflow-auto px-6 py-8" role={kind === 'error' ? 'alert' : 'status'}>
      <div className="flex w-full max-w-sm flex-col items-center gap-3 text-center">
        <Icon aria-hidden className={`mb-1 size-8 shrink-0 text-muted-foreground ${kind === 'loading' ? 'animate-spin motion-reduce:animate-none' : ''}`} strokeWidth={1.5} />
        <h3 className="text-base font-medium text-foreground">{title}</h3>
        <p className="text-sm leading-6 text-muted-foreground wrap-anywhere">{description}</p>
        {onRetry && <Button variant="outline" size="sm" onClick={onRetry}>重新加载</Button>}
      </div>
    </div>
  )
}
