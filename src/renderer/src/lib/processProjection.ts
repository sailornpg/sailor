import type { ToolUIPart } from 'ai'

type ToolState = ToolUIPart['state']

export interface ProcessStepProjection {
  description: string
  label: string
  status: 'active' | 'complete' | 'pending'
}

const stateDescriptions: Record<ToolState, string> = {
  'approval-requested': '等待批准',
  'approval-responded': '已响应批准请求',
  'input-available': '正在执行',
  'input-streaming': '正在准备参数',
  'output-available': '执行完成',
  'output-denied': '执行被拒绝',
  'output-error': '执行失败',
}

export function getProcessStepStatus(state: ToolState): ProcessStepProjection['status'] {
  if (state === 'input-streaming' || state === 'input-available') return 'active'
  if (state === 'approval-requested') return 'pending'
  return 'complete'
}

export function getProcessStepLabel(toolName: string): string {
  return `调用工具：${toolName}`
}

export function projectProcessStep(toolName: string, state: ToolState): ProcessStepProjection {
  return {
    description: stateDescriptions[state],
    label: getProcessStepLabel(toolName),
    status: getProcessStepStatus(state),
  }
}
