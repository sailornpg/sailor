import { useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { ResizableDivider } from '@/components/layout/ResizableDivider'
import { ScrollArea } from '@/components/ui/scroll-area'
export type FilePanelOrientation = 'horizontal' | 'vertical'
export function clampFileTreeRatio(value: number): number {
  return Math.min(0.5, Math.max(0.2, Number.isFinite(value) ? value : 0.32))
}
export function FileSplitPane({
  orientation,
  ratio,
  onRatioChange,
  tree,
  preview,
}: {
  orientation: FilePanelOrientation
  ratio: number
  onRatioChange: (ratio: number) => void
  tree: ReactNode
  preview: ReactNode
}) {
  const root = useRef<HTMLDivElement>(null)
  const [extent, setExtent] = useState(0)
  useLayoutEffect(() => {
    const element = root.current
    if (!element) return
    const measure = () => setExtent(orientation === 'vertical' ? element.clientHeight : element.clientWidth)
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(element)
    return () => observer.disconnect()
  }, [orientation])
  const percent = clampFileTreeRatio(ratio) * 100
  const dividerValue = clampFileTreeRatio(ratio) * extent
  return (
    <div
      ref={root}
      className="file-split-pane"
      data-orientation={orientation}
      style={
        orientation === 'vertical'
          ? { gridTemplateRows: `minmax(80px, ${percent}%) 8px minmax(0, 1fr)` }
          : {
              gridTemplateColumns: `minmax(80px, ${percent}%) 8px minmax(0, 1fr)`,
            }
      }
    >
      <ScrollArea className="file-tree-slot">{tree}</ScrollArea>
      <ResizableDivider orientation={orientation === 'horizontal' ? 'vertical' : 'horizontal'} label="调整文件树大小" value={dividerValue} min={Math.max(80, extent * 0.2)} max={Math.max(80, extent * 0.5)} onChange={(value) => { if (extent > 0) onRatioChange(clampFileTreeRatio(value / extent)) }} />
      <div className="file-preview-slot">{preview}</div>
    </div>
  )
}
