import type { ComponentType } from 'react'

export function PanelPlaceholder({ icon: Icon, title, description, hint }: {
  icon: ComponentType<{ size?: number | string; className?: string }>
  title: string
  description: string
  hint?: string
}) {
  return <div className="panel-placeholder" role="status">
    <Icon className="panel-placeholder-icon" size={18} />
    <p className="panel-placeholder-title">{title}</p>
    <p className="panel-placeholder-description">{description}</p>
    {hint && <p className="panel-placeholder-hint">{hint}</p>}
  </div>
}
