import { useEffect, useState } from 'react'
import { X } from 'lucide-react'

export function TransientErrorNotice({ message }: { message: string }) {
  const [closed, setClosed] = useState(false)
  useEffect(() => {
    const timeout = window.setTimeout(() => setClosed(true), 8000)
    return () => window.clearTimeout(timeout)
  }, [])
  if (closed) return null
  return (
    <div className="runtime-error runtime-error-notice" role="alert">
      <span>{message}</span>
      <button
        type="button"
        className="runtime-error-close"
        aria-label="关闭错误提示"
        onClick={() => setClosed(true)}
      >
        <X size={16} aria-hidden="true" />
      </button>
    </div>
  )
}
