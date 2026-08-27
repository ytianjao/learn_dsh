import { randomUUID } from 'node:crypto'
import { z } from 'zod'
import { LearnLoopDomainError } from './domain.js'
import type { LearnerProfile, PlanVersion } from './types.js'

export const planIntentActivitySchema = z.enum(['explain', 'example', 'apply'])
const visible = (maximum: number) => z.string().min(1).max(maximum).refine(value => value.trim().length > 0, 'Must not be blank')
export const planTaskIntentSchema = z.object({
  title: visible(160), objective: visible(2_000), activity: planIntentActivitySchema,
  acceptanceCriteria: z.array(visible(500)).min(1).max(8), checkPrompt: visible(2_000),
  estimateMinutes: z.number().int().min(10).max(240),
}).strict()
export const planStageIntentSchema = z.object({
  title: visible(120), outcome: visible(1_000), tasks: z.array(planTaskIntentSchema).min(1).max(10),
}).strict()
export const planIntentSchema = z.object({ stages: z.array(planStageIntentSchema).min(1).max(6) }).strict()
export type PlanIntent = z.infer<typeof planIntentSchema>
export type PlanIntentActivity = z.infer<typeof planIntentActivitySchema>

// Domain uniqueness must not vary with the host machine's locale.
const normalized = (value: string) => value.trim().toLowerCase()
const invalid = (message: string): never => { throw new LearnLoopDomainError('INVALID_PLAN', message) }
export function validatePlanIntent(value: unknown, profile: LearnerProfile): PlanIntent {
  const parsed = planIntentSchema.safeParse(value)
  if (!parsed.success) invalid(parsed.error.issues.map(issue => `${issue.path.join('.')}: ${issue.message}`).join('; '))
  const intent = parsed.data
  const tasks = intent.stages.flatMap(stage => stage.tasks)
  if (tasks.length < 2 || tasks.length > 40) invalid('Plan must contain 2 to 40 tasks.')
  const stageTitles = intent.stages.map(stage => normalized(stage.title))
  const taskTitles = tasks.map(task => normalized(task.title))
  if (new Set(stageTitles).size !== stageTitles.length) invalid('Stage titles must be unique after normalization.')
  if (new Set(taskTitles).size !== taskTitles.length) invalid('Task titles must be unique after normalization.')
  for (const task of tasks) {
    const criteria = task.acceptanceCriteria.map(normalized)
    if (new Set(criteria).size !== criteria.length) invalid(`Task "${task.title}" has duplicate acceptance criteria.`)
  }
  if (intent.stages.some(stage => stage.tasks.every(task => task.activity === 'apply'))) invalid('Every stage needs an explain or example activity.')
  const preferences = profile.learningPreferences
  if (preferences.mode === 'knowledge-first' && tasks.filter(task => task.activity !== 'apply').length / tasks.length < 0.6) invalid('Knowledge-first plans require at least 60% explain or example activities.')
  if (preferences.exampleDensity === 'high' && intent.stages.some(stage => stage.tasks.every(task => task.activity !== 'example'))) invalid('High example density requires an example in every stage.')
  return intent
}

export function compilePlanIntent(intent: PlanIntent, profile: LearnerProfile, context: { planVersion: number; createdAt?: string; uuid?: () => string }): PlanVersion {
  const valid = validatePlanIntent(intent, profile)
  const uuid = context.uuid ?? randomUUID
  let previousTaskId: string | null = null
  return {
    id: `plan_${uuid()}`, version: context.planVersion, status: 'draft', createdAt: context.createdAt ?? new Date().toISOString(),
    stages: valid.stages.map(stage => ({
      id: `stage_${uuid()}`, title: stage.title, outcome: stage.outcome,
      tasks: stage.tasks.map(task => {
        const id = `task_${uuid()}`
        const compiled = { ...task, id, status: 'pending' as const, conceptId: `concept_${uuid()}`, dependsOnTaskIds: previousTaskId ? [previousTaskId] : [] }
        previousTaskId = id
        return compiled
      }),
    })),
  }
}
