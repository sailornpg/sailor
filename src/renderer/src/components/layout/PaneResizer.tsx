import { ResizableDivider } from './ResizableDivider'
export interface PaneResizerProps { side:'left'|'right'; label:string; width:number; min:number; max:number; collapseAt?:number; forcedHover?:boolean; onResize:(width:number)=>void; onResizeEnd?:()=>void; onCollapse?:()=>void }
export function PaneResizer({side,label,width,min,max,collapseAt,forcedHover,onResize,onResizeEnd,onCollapse}:PaneResizerProps) {
  return <ResizableDivider orientation="vertical" label={label} value={side==='right' ? -width : width} min={side==='right' ? -max : min} max={side==='right' ? -min : max} onChange={(value)=>{ const next=side==='right' ? -value : value; if(collapseAt!==undefined && next<=collapseAt) onCollapse?.(); else onResize(next) }} onCommit={onResizeEnd} className={`pane-resizer-side-${side}${forcedHover ? ' is-forced-hover' : ''}`} />
}
