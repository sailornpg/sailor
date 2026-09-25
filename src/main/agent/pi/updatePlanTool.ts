import { tool, type ToolSet } from 'ai'
import { planTodoListSchema } from '../../../shared/planTodo.js'

export function createUpdatePlanTool(input: {
  updatePlan: (plan: unknown) => Promise<unknown>
}): ToolSet {
  return {
    update_plan: tool({
      description:
        'Create or update the current plan TodoList. Keep step IDs stable across revisions.',
      inputSchema: planTodoListSchema,
      execute: async (plan) => input.updatePlan(plan),
    }),
  } as ToolSet
}
