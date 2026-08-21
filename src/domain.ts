import { randomUUID } from 'node:crypto'
import { z } from 'zod'
import type { DomainSpec } from '@deepseek-ai/dsh-storage-domain'
import type { AdjustmentProposal, Evidence, GeneratedPlanInput, LearnLoopState, MasteryLevel, PlanOperation, PlanVersion, StateTable, TaskState } from './types.js'

const now = (): string => new Date().toISOString()
const id = (prefix: string): string => `${prefix}_${randomUUID()}`
const taskState = z.enum(['pending', 'active', 'blocked', 'completed', 'skipped'])
const taskSchema = z.object({ id: z.string(), title: z.string(), objective: z.string(), acceptanceCriteria: z.array(z.string()), estimateMinutes: z.number().int().positive(), status: taskState, conceptIds: z.array(z.string()), dependsOn: z.array(z.string()) })
const operationSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('update-task'), taskId: z.string(), patch: z.object({ title: z.string().optional(), objective: z.string().optional(), acceptanceCriteria: z.array(z.string()).optional(), estimateMinutes: z.number().int().positive().optional(), status: taskState.optional() }).strict() }),
  z.object({ type: z.literal('move-task'), taskId: z.string(), toStageId: z.string(), beforeTaskId: z.string().optional() }),
])
const stateSchema: z.ZodType<LearnLoopState> = z.object({
  schemaVersion: z.literal(1), revision: z.number().int().nonnegative(),
  project: z.object({ id: z.string(), title: z.string(), goal: z.string(), experience: z.string(), weeklyHours: z.number().int().min(1).max(80), status: z.enum(['active', 'archived']), createdAt: z.string() }).nullable(),
  plans: z.array(z.object({ id: z.string(), version: z.number().int().positive(), status: z.enum(['draft', 'active', 'superseded', 'archived']), createdAt: z.string(), stages: z.array(z.object({ id: z.string(), title: z.string(), tasks: z.array(taskSchema) })) })),
  evidence: z.array(z.object({ id: z.string(), idempotencyKey: z.string(), conceptId: z.string(), kind: z.enum(['explanation', 'pseudocode', 'implementation', 'hypothesis', 'assessment', 'reflection']), summary: z.string(), source: z.object({ sessionId: z.string(), messageRange: z.string() }), confidence: z.number().min(0).max(1), createdAt: z.string() })),
  mastery: z.array(z.object({ conceptId: z.string(), title: z.string(), level: z.enum(['unassessed', 'introduced', 'practicing', 'demonstrated', 'mastered']), evidenceIds: z.array(z.string()), rationale: z.string(), updatedAt: z.string() })),
  assessments: z.array(z.object({ id: z.string(), conceptId: z.string(), result: z.enum(['needs-work', 'passed', 'excellent']), explanation: z.string(), evidenceId: z.string(), createdAt: z.string() })),
  adjustments: z.array(z.object({ id: z.string(), idempotencyKey: z.string(), impact: z.enum(['minor', 'major']), state: z.enum(['proposed', 'applied', 'rejected', 'reverted']), reason: z.string(), diff: z.array(z.string()), operations: z.array(operationSchema), inverseOperations: z.array(operationSchema).optional(), createdAt: z.string(), appliedPlanVersion: z.number().optional(), revertedPlanVersion: z.number().optional() })),
  events: z.array(z.object({ id: z.string(), stableId: z.string(), type: z.string(), summary: z.string(), createdAt: z.string() })),
  settings: z.object({ language: z.enum(['zh-CN', 'en']), weeklyHours: z.number().int().min(1).max(80), strictness: z.enum(['supportive', 'balanced', 'strict']), autoMinorAdjustments: z.boolean(), showModeExplanation: z.boolean(), antiDependency: z.boolean() }),
  misconceptions: z.array(z.string()), reviewQueue: z.array(z.string()),
}).strict()
export const learnLoopDomainSpec = { name: 'learnloop', version: 1, tables: { state: { valueSchema: stateSchema } } } as const satisfies DomainSpec

export function emptyState(revision = 0): LearnLoopState {
  return { schemaVersion: 1, revision, project: null, plans: [], evidence: [], mastery: [], assessments: [], adjustments: [], events: [], misconceptions: [], reviewQueue: [], settings: { language: 'zh-CN', weeklyHours: 10, strictness: 'balanced', autoMinorAdjustments: true, showModeExplanation: false, antiDependency: true } }
}
function event(type: string, summary: string, stableId = id('evt')) { return { id: id('event'), stableId, type, summary, createdAt: now() } }
function activePlan(state: LearnLoopState): PlanVersion { const plans = state.plans.filter(plan => plan.status === 'active'); if (plans.length !== 1) throw new Error('project must have exactly one active plan'); return plans[0]! }
function nextRevision(state: LearnLoopState): LearnLoopState { return { ...state, revision: state.revision + 1 } }

export function initializeProject(state: LearnLoopState, input: { goal: string; experience: string; weeklyHours: number; idempotencyKey: string }): LearnLoopState {
  if (state.events.some(item => item.stableId === input.idempotencyKey)) return state
  if (state.project !== null) throw new Error('an active project already exists')
  const createdAt = now()
  const plan: PlanVersion = { id: id('plan'), version: 1, status: 'active', createdAt, stages: [] }
  return nextRevision({ ...state, project: { id: id('project'), title: input.goal.trim().slice(0, 40), goal: input.goal.trim(), experience: input.experience.trim(), weeklyHours: input.weeklyHours, status: 'active', createdAt }, plans: [plan], mastery: [], events: [...state.events, event('learnloop/project-created', '学习项目已建立 / Learning project created', input.idempotencyKey), event('learnloop/plan-generation-requested', '已请求 DSH 模型生成计划 / Plan generation requested')] })
}

const keyPattern = /^[a-z0-9][a-z0-9-]{0,63}$/
function clean(value: string, label: string, max: number): string { const result = value.trim(); if (!result || result.length > max) throw new Error(`${label} must be non-empty and at most ${max} characters`); return result }
export function publishGeneratedPlan(state: LearnLoopState, input: GeneratedPlanInput & { idempotencyKey: string }): LearnLoopState {
  if (state.events.some(item => item.stableId === input.idempotencyKey)) return state
  if (!state.project) throw new Error('project does not exist')
  const plan = activePlan(state); if (plan.stages.length !== 0) throw new Error('project plan is already published')
  if (input.stages.length < 1 || input.stages.length > 8) throw new Error('project plan must contain 1 to 8 stages')
  const stageKeys = new Set<string>(); const taskKeys = new Set<string>(); const conceptKeys = new Set<string>()
  const normalized = input.stages.map(stage => {
    const stageKey = clean(stage.key, 'stage key', 64); if (!keyPattern.test(stageKey)) throw new Error('stage key is invalid'); if (stageKeys.has(stageKey)) throw new Error('duplicate stage key'); stageKeys.add(stageKey)
    if (stage.tasks.length < 1) throw new Error('project plan stage must contain a task')
    return { key: stageKey, title: clean(stage.title, 'stage title', 200), tasks: stage.tasks.map(task => {
      const taskKey = clean(task.key, 'task key', 64); if (!keyPattern.test(taskKey)) throw new Error('task key is invalid'); if (taskKeys.has(taskKey)) throw new Error('duplicate task key'); taskKeys.add(taskKey)
      const conceptKey = clean(task.conceptKey, 'concept key', 64); if (!keyPattern.test(conceptKey)) throw new Error('concept key is invalid'); if (conceptKeys.has(conceptKey)) throw new Error('duplicate concept key'); conceptKeys.add(conceptKey)
      if (task.acceptanceCriteria.length < 1 || task.acceptanceCriteria.length > 8) throw new Error('task must contain 1 to 8 acceptance criteria')
      if (!Number.isInteger(task.estimateMinutes) || task.estimateMinutes < 10 || task.estimateMinutes > 480) throw new Error('task estimateMinutes must be between 10 and 480')
      return { key: taskKey, title: clean(task.title, 'task title', 300), objective: clean(task.objective, 'task objective', 2000), acceptanceCriteria: task.acceptanceCriteria.map(value => clean(value, 'acceptance criterion', 500)), estimateMinutes: task.estimateMinutes, conceptKey, conceptTitle: clean(task.conceptTitle, 'concept title', 300), dependsOn: task.dependsOn.map(value => { const dependency = clean(value, 'dependency key', 64); if (!keyPattern.test(dependency)) throw new Error('dependency key is invalid'); return dependency }) }
    }) }
  })
  const tasks = normalized.flatMap(stage => stage.tasks); if (tasks.length < 2 || tasks.length > 20) throw new Error('project plan must contain 2 to 20 tasks')
  for (const task of tasks) { const unique = new Set(task.dependsOn); if (unique.size !== task.dependsOn.length) throw new Error('duplicate task dependency'); if (unique.has(task.key)) throw new Error('task cannot depend on itself'); if ([...unique].some(dep => !taskKeys.has(dep))) throw new Error('task dependency does not exist') }
  const visiting = new Set<string>(); const visited = new Set<string>(); const byKey = new Map(tasks.map(task => [task.key, task])); const visit = (key: string): void => { if (visiting.has(key)) throw new Error('task dependency graph contains a cycle'); if (visited.has(key)) return; visiting.add(key); for (const dependency of byKey.get(key)!.dependsOn) visit(dependency); visiting.delete(key); visited.add(key) }; for (const task of tasks) visit(task.key)
  const first = tasks.find(task => task.dependsOn.length === 0); if (!first) throw new Error('project plan has no executable task')
  const createdAt = now(); const stages = normalized.map(stage => ({ id: `stage-${stage.key}`, title: stage.title, tasks: stage.tasks.map(task => ({ id: `task-${task.key}`, title: task.title, objective: task.objective, acceptanceCriteria: task.acceptanceCriteria, estimateMinutes: task.estimateMinutes, status: task.key === first.key ? 'active' as const : 'pending' as const, conceptIds: [`concept-${task.conceptKey}`], dependsOn: task.dependsOn.map(dependency => `concept-${byKey.get(dependency)!.conceptKey}`) })) }))
  const changedPlan = { ...plan, stages }; return nextRevision({ ...state, plans: state.plans.map(item => item.id === plan.id ? changedPlan : item), mastery: tasks.map(task => ({ conceptId: `concept-${task.conceptKey}`, title: task.conceptTitle, level: 'introduced' as const, evidenceIds: [], rationale: '概念由模型生成的学习计划引入，但尚无用户证据。 / Introduced by the model-generated plan; no learner evidence yet.', updatedAt: createdAt })), events: [...state.events, event('learnloop/plan-generated', '模型生成的学习计划已发布 / Model-generated plan published', input.idempotencyKey), event('learnloop/task-activated', `已激活任务：${first.title} / First task activated`)] })
}

export function discardCurrentProject(state: LearnLoopState, idempotencyKey: string): LearnLoopState {
  if (state.events.some(item => item.stableId === idempotencyKey)) return state
  if (!state.project) throw new Error('project does not exist')
  return nextRevision({ ...state, project: null, plans: [], evidence: [], mastery: [], assessments: [], adjustments: [], misconceptions: [], reviewQueue: [], events: [event('learnloop/project-discarded', '当前学习计划已破坏性废弃 / Current learning project destructively discarded', idempotencyKey)] })
}

export function setTaskState(state: LearnLoopState, input: { taskId: string; status: TaskState; idempotencyKey: string }): LearnLoopState {
  if (state.events.some(item => item.stableId === input.idempotencyKey)) return state
  const plan = activePlan(state); let found = false
  const changed = { ...plan, stages: plan.stages.map(stage => ({ ...stage, tasks: stage.tasks.map(task => { if (task.id !== input.taskId) return task; found = true; return { ...task, status: input.status } }) })) }
  if (!found) throw new Error('task not found')
  return nextRevision({ ...state, plans: state.plans.map(item => item.id === plan.id ? changed : item), events: [...state.events, event('learnloop/task-changed', `任务状态已更新为 ${input.status} / Task status changed to ${input.status}`, input.idempotencyKey)] })
}

function masteryFor(evidence: Evidence[]): { level: MasteryLevel; rationale: string } {
  const high = evidence.filter(item => item.confidence >= .75); const kinds = new Set(high.map(item => item.kind))
  if (high.length >= 3 && (kinds.has('assessment') || kinds.has('implementation'))) return { level: 'mastered', rationale: `已有 ${high.length} 条高置信证据并包含评测或实现。 / ${high.length} high-confidence items include an assessment or implementation.` }
  if (high.length >= 2) return { level: 'demonstrated', rationale: `已有 ${high.length} 条相互支持的高置信证据。 / ${high.length} high-confidence items corroborate one another.` }
  if (evidence.length > 0) return { level: 'practicing', rationale: `已记录 ${evidence.length} 条练习证据。 / ${evidence.length} practice evidence item(s) recorded.` }
  return { level: 'introduced', rationale: '已列入计划，尚无用户证据。 / Planned, but no learner evidence yet.' }
}
export function recordEvidence(state: LearnLoopState, input: Omit<Evidence, 'id' | 'createdAt'>): LearnLoopState {
  if (state.evidence.some(item => item.idempotencyKey === input.idempotencyKey)) return state
  if (!state.mastery.some(item => item.conceptId === input.conceptId)) throw new Error('concept not found')
  const saved: Evidence = { ...input, id: id('evidence'), createdAt: now() }; const evidence = [...state.evidence, saved]
  const mastery = state.mastery.map(item => { if (item.conceptId !== saved.conceptId) return item; const related = evidence.filter(candidate => candidate.conceptId === item.conceptId); return { ...item, ...masteryFor(related), evidenceIds: related.map(candidate => candidate.id), updatedAt: now() } })
  return nextRevision({ ...state, evidence, mastery, events: [...state.events, event('learnloop/evidence-recorded', `已记录证据：${saved.summary} / Evidence recorded`, input.idempotencyKey), event('learnloop/mastery-changed', mastery.find(item => item.conceptId === saved.conceptId)!.rationale)] })
}

export function completeTaskWithEvidence(state: LearnLoopState, input: { idempotencyKey: string; taskId: string; conceptId: string; kind: Evidence['kind']; summary: string; source: Evidence['source']; confidence: number }): LearnLoopState {
  if (state.events.some(item => item.stableId === input.idempotencyKey)) return state
  const plan = activePlan(state)
  const task = plan.stages.flatMap(stage => stage.tasks).find(item => item.id === input.taskId)
  if (!task) throw new Error('task not found')
  if (!state.mastery.some(item => item.conceptId === input.conceptId)) throw new Error('concept not found')
  if (!task.conceptIds.includes(input.conceptId)) throw new Error('concept does not belong to task')
  if (task.status === 'completed') throw new Error('task is already completed')

  const createdAt = now()
  const saved: Evidence = { id: id('evidence'), idempotencyKey: input.idempotencyKey, conceptId: input.conceptId, kind: input.kind, summary: input.summary, source: input.source, confidence: input.confidence, createdAt }
  const evidence = [...state.evidence, saved]
  const mastery = state.mastery.map(item => {
    if (item.conceptId !== saved.conceptId) return item
    const related = evidence.filter(candidate => candidate.conceptId === item.conceptId)
    return { ...item, ...masteryFor(related), evidenceIds: related.map(candidate => candidate.id), updatedAt: createdAt }
  })
  const changedPlan = { ...plan, stages: plan.stages.map(stage => ({ ...stage, tasks: stage.tasks.map(item => item.id === task.id ? { ...item, status: 'completed' as const } : item) })) }
  return nextRevision({
    ...state,
    plans: state.plans.map(item => item.id === plan.id ? changedPlan : item),
    evidence,
    mastery,
    events: [
      ...state.events,
      event('learnloop/task-completed-with-evidence', `任务已完成并记录证据：${saved.summary} / Task completed with evidence`, input.idempotencyKey),
      event('learnloop/mastery-changed', mastery.find(item => item.conceptId === saved.conceptId)!.rationale),
    ],
  })
}

function applyOperations(plan: PlanVersion, operations: PlanOperation[]): { stages: PlanVersion['stages']; inverse: PlanOperation[] } {
  let stages = structuredClone(plan.stages); const inverse: PlanOperation[] = []
  for (const operation of operations) {
    const sourceStage = stages.find(stage => stage.tasks.some(task => task.id === operation.taskId)); const task = sourceStage?.tasks.find(item => item.id === operation.taskId)
    if (!sourceStage || !task) throw new Error('adjustment task not found')
    if (operation.type === 'update-task') {
      const oldPatch = Object.fromEntries(Object.keys(operation.patch).map(key => [key, structuredClone(task[key as keyof typeof task])])) as Extract<PlanOperation, { type: 'update-task' }>['patch']
      inverse.unshift({ type: 'update-task', taskId: task.id, patch: oldPatch })
      Object.assign(task, structuredClone(operation.patch))
    } else {
      if (operation.beforeTaskId === operation.taskId) throw new Error('adjustment cannot move a task before itself')
      const oldIndex = sourceStage.tasks.findIndex(item => item.id === task.id); const oldBefore = sourceStage.tasks[oldIndex + 1]?.id
      const targetStage = stages.find(stage => stage.id === operation.toStageId); if (!targetStage) throw new Error('adjustment target stage not found')
      if (operation.beforeTaskId && !targetStage.tasks.some(item => item.id === operation.beforeTaskId)) throw new Error('adjustment anchor task not found')
      sourceStage.tasks.splice(oldIndex, 1); const targetIndex = operation.beforeTaskId ? targetStage.tasks.findIndex(item => item.id === operation.beforeTaskId) : targetStage.tasks.length
      targetStage.tasks.splice(targetIndex, 0, task); inverse.unshift({ type: 'move-task', taskId: task.id, toStageId: sourceStage.id, ...(oldBefore ? { beforeTaskId: oldBefore } : {}) })
    }
  }
  return { stages, inverse }
}
function versionPlan(state: LearnLoopState, operations: PlanOperation[]): { state: LearnLoopState; version: number; inverse: PlanOperation[] } {
  const current = activePlan(state); const applied = applyOperations(current, operations); const version = Math.max(...state.plans.map(plan => plan.version)) + 1
  const replacement: PlanVersion = { ...structuredClone(current), id: id('plan'), version, createdAt: now(), status: 'active', stages: applied.stages }
  return { state: { ...state, plans: [...state.plans.map(plan => plan.id === current.id ? { ...plan, status: 'superseded' as const } : plan), replacement] }, version, inverse: applied.inverse }
}
export function proposeAdjustment(state: LearnLoopState, input: { impact: 'minor' | 'major'; reason: string; diff: string[]; operations: PlanOperation[]; idempotencyKey: string }): LearnLoopState {
  if (state.adjustments.some(item => item.idempotencyKey === input.idempotencyKey)) return state
  if (input.operations.length === 0) throw new Error('adjustment requires at least one operation')
  const autoApply = input.impact === 'minor' && state.settings.autoMinorAdjustments
  let proposal: AdjustmentProposal = { id: id('adjustment'), ...input, state: autoApply ? 'applied' : 'proposed', createdAt: now() }
  let result = { ...state, adjustments: [...state.adjustments, proposal] }
  if (autoApply) { const applied = versionPlan(result, input.operations); proposal = { ...proposal, appliedPlanVersion: applied.version, inverseOperations: applied.inverse }; result = { ...applied.state, adjustments: applied.state.adjustments.map(item => item.id === proposal.id ? proposal : item) } }
  return nextRevision({ ...result, events: [...result.events, event(autoApply ? 'learnloop/adjustment-applied' : 'learnloop/adjustment-proposed', input.reason, input.idempotencyKey)] })
}
export function decideAdjustment(state: LearnLoopState, adjustmentId: string, decision: 'apply' | 'reject' | 'revert', idempotencyKey: string): LearnLoopState {
  if (state.events.some(item => item.stableId === idempotencyKey)) return state
  const target = state.adjustments.find(item => item.id === adjustmentId); if (!target) throw new Error('adjustment not found')
  if (decision === 'apply' && target.state !== 'proposed' || decision === 'reject' && target.state !== 'proposed' || decision === 'revert' && target.state !== 'applied') throw new Error('adjustment decision is invalid for its current state')
  let result = state; let replacement: Partial<AdjustmentProposal>
  if (decision === 'apply') { const applied = versionPlan(state, target.operations); result = applied.state; replacement = { state: 'applied', appliedPlanVersion: applied.version, inverseOperations: applied.inverse } }
  else if (decision === 'revert') { const reverted = versionPlan(state, target.inverseOperations ?? []); result = reverted.state; replacement = { state: 'reverted', revertedPlanVersion: reverted.version } }
  else replacement = { state: 'rejected' }
  result = { ...result, adjustments: result.adjustments.map(item => item.id === adjustmentId ? { ...item, ...replacement } : item), events: [...result.events, event(`learnloop/adjustment-${decision}`, `计划调整决定：${decision} / Adjustment decision: ${decision}`, idempotencyKey)] }
  return nextRevision(result)
}
export function updateSettings(state: LearnLoopState, settings: LearnLoopState['settings'], idempotencyKey: string): LearnLoopState { if (state.events.some(item => item.stableId === idempotencyKey)) return state; return nextRevision({ ...state, settings, events: [...state.events, event('learnloop/settings-changed', '设置已更新 / Settings updated', idempotencyKey)] }) }
export function resetState(state: LearnLoopState, idempotencyKey: string): LearnLoopState { const reset = emptyState(state.revision + 1); reset.events = [event('learnloop/reset', '学习数据已重置 / Learning data reset', idempotencyKey)]; return reset }
export function nextAction(state: LearnLoopState) { if (!state.project) return null; const tasks = activePlan(state).stages.flatMap(stage => stage.tasks); return tasks.find(task => task.status === 'active') ?? tasks.find(task => task.status === 'pending' && task.dependsOn.every(dep => tasks.some(candidate => candidate.conceptIds.includes(dep) && candidate.status === 'completed'))) ?? null }
export async function ensureState(table: StateTable): Promise<LearnLoopState> { const current = table.get('singleton'); if (current) return current; const fresh = emptyState(); await table.put('singleton', fresh); return fresh }
