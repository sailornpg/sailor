import { Globe } from 'lucide-react'
import { WebPreview } from '@/components/assistant-ui/elements/web-preview'
import type { PanelProps } from '@/lib/panels/registry'
import { PanelPlaceholder } from './PanelPlaceholder'

/** Tool output feeds this string; an invalid URL must not throw inside render. */
function previewOrigin(url: string): string {
  try {
    return new URL(url).hostname
  } catch {
    return url
  }
}

export default function BrowserPreviewPanel({ data }: PanelProps) {
  const preview = data.preview
  if (!preview) {
    return <PanelPlaceholder
      description="还没有可渲染的预览内容。"
      hint="检索或抓取结果会在这里打开。"
      icon={Globe}
      title="浏览器"
    />
  }
  return <div className="panel-browser">
    <WebPreview
      className="w-full max-w-none flex-1 rounded-none border-0"
      loading={false}
      onOpenExternal={() => window.open(preview.url, '_blank')}
      origin={previewOrigin(preview.url)}
    >
      <div className="panel-browser-body">
        <h2 className="panel-browser-title">{preview.title}</h2>
        <pre className="panel-browser-content">{preview.content}</pre>
      </div>
    </WebPreview>
  </div>
}
