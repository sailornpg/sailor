import {
  defineToolkit,
  type ToolCallMessagePartComponent,
  type ToolCallMessagePartProps,
} from '@assistant-ui/react'
import { StructuredToolFallback } from './StructuredToolFallback'
import { SailorToolCall, toolCallNeedsFallback } from './SailorToolCall'
import { PiLegacyCompactionRecord } from '../events/PiEventRecord'
import { SailorBrowserTool } from './SailorBrowserTool'

export { SailorToolCall }

const backendTool = (render: ToolCallMessagePartComponent) => ({ type: 'backend' as const, render })

const AskUserMessage: ToolCallMessagePartComponent = () => null

const UpdatePlanMessage: ToolCallMessagePartComponent = (props) =>
  toolCallNeedsFallback(props) ? <SailorToolCall {...props} /> : null

export const sailorToolkit = defineToolkit({
  read_document: backendTool(SailorToolCall),
  write: backendTool(SailorToolCall),
  edit: backendTool(SailorToolCall),
  bash: backendTool(SailorToolCall),
  host_exec: backendTool(SailorToolCall),
  web_search: backendTool(SailorToolCall),
  fetch_page: backendTool(SailorToolCall),
  ask_user: backendTool(AskUserMessage),
  update_plan: backendTool(UpdatePlanMessage),
  browser_navigate: backendTool(SailorBrowserTool),
  browser_read_page: backendTool(SailorBrowserTool),
  browser_read_text: backendTool(SailorBrowserTool),
  browser_click: backendTool(SailorBrowserTool),
  browser_type: backendTool(SailorBrowserTool),
  browser_key: backendTool(SailorBrowserTool),
  browser_scroll: backendTool(SailorBrowserTool),
  browser_screenshot: backendTool(SailorBrowserTool),
  browser_console: backendTool(SailorBrowserTool),
  browser_tabs: backendTool(SailorBrowserTool),
  compaction: { type: 'backend', display: 'standalone', render: PiLegacyCompactionRecord },
})

export function toolRendererFor(toolName: string): ToolCallMessagePartComponent | undefined {
  if (!Object.prototype.hasOwnProperty.call(sailorToolkit, toolName)) return undefined
  return sailorToolkit[toolName as keyof typeof sailorToolkit]?.render
}

export const SailorToolFallback: ToolCallMessagePartComponent = (
  props: ToolCallMessagePartProps,
) => {
  const Render = toolRendererFor(props.toolName) ?? SailorToolCall
  return <Render {...props} />
}
