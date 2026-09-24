import type { ReactNode } from 'react'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/assistant-ui/elements/popover'

interface ReferenceSummaryProps {
  icon: ReactNode
  label: string
  title: string
  children: ReactNode
  dismiss: ReactNode
}

export function ReferenceSummary({ icon, label, title, children, dismiss }: ReferenceSummaryProps) {
  return (
    <Popover>
      <div className="workspace-context-summary">
        <PopoverTrigger asChild>
          <button
            type="button"
            className="workspace-context-summary-trigger"
            aria-label={`查看${label}`}
          >
            {icon}
            <span>{label}</span>
          </button>
        </PopoverTrigger>
        {dismiss}
      </div>
      <PopoverContent className="workspace-context-popover" align="start" side="top">
        <div className="workspace-context-popover-title">{title}</div>
        {children}
      </PopoverContent>
    </Popover>
  )
}
