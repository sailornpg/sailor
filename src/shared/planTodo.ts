import { z } from 'zod'

export const planTodoStepStatusSchema = z.enum([
  'pending',
  'in-progress',
  'completed',
  'blocked',
  'skipped',
])

export const planTodoStepSchema = z.strictObject({
  id: z
    .string()
    .min(1)
    .max(120)
    .regex(/^[A-Za-z0-9][A-Za-z0-9._:-]*$/),
  title: z.string().trim().min(1).max(500),
  status: planTodoStepStatusSchema,
})

export const planTodoListSchema = z
  .strictObject({
    revision: z.number().int().positive(),
    steps: z.array(planTodoStepSchema).max(100),
  })
  .superRefine((plan, context) => {
    const ids = new Set<string>()
    for (const [index, step] of plan.steps.entries()) {
      if (ids.has(step.id)) {
        context.addIssue({
          code: 'custom',
          path: ['steps', index, 'id'],
          message: '步骤 ID 必须唯一',
        })
      }
      ids.add(step.id)
    }
  })

export type PlanTodoStep = z.infer<typeof planTodoStepSchema>
export type PlanTodoList = z.infer<typeof planTodoListSchema>

export function createPlanTodoList(input: unknown): PlanTodoList {
  return planTodoListSchema.parse(input)
}

export function mergePlanTodoList(
  previous: PlanTodoList | undefined,
  next: PlanTodoList,
): PlanTodoList {
  if (previous && next.revision <= previous.revision) throw new Error('计划 revision 已过期。')
  const completed = new Map(
    previous?.steps.filter((step) => step.status === 'completed').map((step) => [step.id, step]) ??
      [],
  )
  return {
    ...next,
    steps: next.steps.map((step) =>
      completed.has(step.id) ? { ...step, status: 'completed' } : step,
    ),
  }
}
