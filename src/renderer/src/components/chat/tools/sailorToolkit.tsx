import {
  defineToolkit,
  type ToolCallMessagePartComponent,
  type ToolCallMessagePartProps,
} from '@assistant-ui/react'
import { StructuredToolFallback } from './StructuredToolFallback'
import { SailorToolCall, toolCallNeedsFallback } from './SailorToolCall'

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
  web_search: backendTool(StructuredToolFallback),
  fetch_page: backendTool(StructuredToolFallback),
  ask_user: backendTool(AskUserMessage),
  update_plan: backendTool(UpdatePlanMessage),
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
