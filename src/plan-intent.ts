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
  conceptKey: visible(80).optional(),
}).strict()
export const planStageIntentSchema = z.object({
  title: visible(120), outcome: visible(1_000), tasks: z.array(planTaskIntentSchema).min(1).max(10),
}).strict()
export const planIntentSchema = z.object({ stages: z.array(planStageIntentSchema).min(1).max(6) }).strict()
export type PlanIntent = z.infer<typeof planIntentSchema>
export type PlanIntentActivity = z.infer<typeof planIntentActivitySchema>

// Domain uniqueness must not vary with the host machine's locale.
const normalized = (value: string) => value.trim().toLowerCase()
// The violation travels in details: the tool error envelope drops the message, and without it the
// model retries blind and burns its single correct-and-retry attempt on the same mistake.
// A declaration so control flow narrows after `if (...) invalid(...)`; a const arrow does not.
function invalid(message: string): never { throw new LearnLoopDomainError('INVALID_PLAN', message, { violation: message }) }
/** Plan rules read only the preferences and weekly time the learner confirmed. */
export type PlanProfile = Pick<LearnerProfile, 'learningPreferences' | 'weeklyHours'>
/** The profile-derived plan rules, published to the model before it drafts and enforced below. */
export function planConstraints(profile: PlanProfile) {
  const preferences = profile.learningPreferences
  return {
    allowedActivities: preferences.practiceCapacity === 'none' ? ['explain', 'example'] as const : ['explain', 'example', 'apply'] as const,
    minExplainOrExampleShare: preferences.mode === 'knowledge-first' ? 0.6 : 0,
    exampleInEveryStage: preferences.exampleDensity === 'high',
    maxTotalMinutes: profile.weeklyHours * 60 * 52,
  }
}
export function validatePlanIntent(value: unknown, profile: PlanProfile): PlanIntent {
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
  const rules = planConstraints(profile)
  if (tasks.filter(task => task.activity !== 'apply').length / tasks.length < rules.minExplainOrExampleShare) invalid('Knowledge-first plans require at least 60% explain or example activities.')
  if (rules.exampleInEveryStage && intent.stages.some(stage => stage.tasks.every(task => task.activity !== 'example'))) invalid('High example density requires an example in every stage.')
  // Mode gate: a learner who cannot practise yet must not be assigned implementation work.
  const disallowed = tasks.filter(task => !(rules.allowedActivities as readonly string[]).includes(task.activity))
  if (disallowed.length) invalid(`The learner has no practice capacity, so apply activities are not allowed; rewrite as explain or example: ${disallowed.map(task => `"${task.title}"`).join(', ')}.`)
  // The plan must be finishable in the time the learner actually has. Weekly hours were previously
  // collected and then ignored, so a plan could promise a year of work to someone with one hour a week.
  const totalMinutes = tasks.reduce((sum, task) => sum + task.estimateMinutes, 0)
  if (totalMinutes > rules.maxTotalMinutes) invalid(`The plan needs about ${Math.round(totalMinutes / (profile.weeklyHours * 60))} weeks at the stated ${profile.weeklyHours} hours per week; shorten it or raise the weekly time.`)
  return intent
}

export function compilePlanIntent(intent: PlanIntent, profile: PlanProfile, context: { planVersion: number; createdAt?: string; uuid?: () => string; conceptIds?: ReadonlyMap<string, string> }): PlanVersion {
  const valid = validatePlanIntent(intent, profile)
  const uuid = context.uuid ?? randomUUID
  // Tasks naming the same conceptKey share one concept identity, so mastery can accumulate
  // across the tasks that practise it. Tasks without a key keep one concept per task.
  const concepts = new Map<string, string>(context.conceptIds ?? [])
  const conceptFor = (key: string | undefined) => {
    if (!key) return `concept_${uuid()}`
    const normalizedKey = key.trim().toLowerCase()
    const existing = concepts.get(normalizedKey) ?? `concept_${uuid()}`
    concepts.set(normalizedKey, existing)
    return existing
  }
  return {
    id: `plan_${uuid()}`, version: context.planVersion, status: 'draft', createdAt: context.createdAt ?? new Date().toISOString(),
    stages: valid.stages.map(stage => ({
      id: `stage_${uuid()}`, title: stage.title, outcome: stage.outcome,
      tasks: stage.tasks.map(task => ({ ...task, id: `task_${uuid()}`, status: 'pending' as const, conceptId: conceptFor(task.conceptKey) })),
    })),
  }
}

/** The inverse of compilation: a plan version as the minimal intent a revision must resubmit. */
export function planIntentOf(plan: PlanVersion): PlanIntent {
  return { stages: plan.stages.map(stage => ({ title: stage.title, outcome: stage.outcome, tasks: stage.tasks.map(task => ({ title: task.title, objective: task.objective, activity: task.activity, acceptanceCriteria: task.acceptanceCriteria, checkPrompt: task.checkPrompt, estimateMinutes: task.estimateMinutes, ...(task.conceptKey ? { conceptKey: task.conceptKey } : {}) })) })) }
}
