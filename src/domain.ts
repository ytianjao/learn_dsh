import { randomUUID } from 'node:crypto'
import { z } from 'zod'
import type { DomainSpec } from '@deepseek-ai/dsh-storage-domain'
import type { AdjustmentProposal, Evidence, LearnLoopState, MasteryLevel, PlanOperation, PlanVersion, StateTable, TaskState } from './types.js'

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
  const createdAt = now(); const conceptIds = ['runtime-state', 'planner-verifier', 'tooling-memory', 'agent-eval']
  const plan: PlanVersion = { id: id('plan'), version: 1, status: 'active', createdAt, stages: [
    { id: 'stage-runtime', title: 'Agent Runtime 基础 / Agent Runtime Basics', tasks: [
      { id: 'task-runtime-state', title: '手写最小 Agent Runtime 的状态模型 / Model a minimal Agent Runtime', objective: '区分全局完成、可恢复和等待状态 / Separate completion, resumable, and waiting states', acceptanceCriteria: ['解释 finish、status 与 checkpoint 的职责 / Explain finish, status, and checkpoint', '提交状态转换伪代码 / Submit state-transition pseudocode'], estimateMinutes: 45, status: 'active', conceptIds: ['runtime-state'], dependsOn: [] },
      { id: 'task-planner-verifier', title: '实现 Planner / Verifier 闭环 / Build the Planner-Verifier loop', objective: '用影响等级约束规划和验证 / Bound planning and verification by impact', acceptanceCriteria: ['列出三类失败影响 / List three failure impacts', '用 fixture 验证重试边界 / Verify retry boundaries with fixtures'], estimateMinutes: 90, status: 'pending', conceptIds: ['planner-verifier'], dependsOn: ['runtime-state'] },
    ]},
    { id: 'stage-production', title: '生产级 Agent 系统 / Production Agent Systems', tasks: [
      { id: 'task-tooling-memory', title: '设计 Tooling 与 Memory 边界 / Design Tooling and Memory boundaries', objective: '区分模型上下文与持久事实 / Separate model context from durable facts', acceptanceCriteria: ['提交数据流图 / Submit a data-flow diagram'], estimateMinutes: 90, status: 'pending', conceptIds: ['tooling-memory'], dependsOn: ['planner-verifier'] },
      { id: 'task-agent-eval', title: '建立 Agent Eval / Establish Agent Evals', objective: '用可回放证据验收系统行为 / Validate behavior with replayable evidence', acceptanceCriteria: ['提交至少三个确定性场景 / Submit at least three deterministic scenarios'], estimateMinutes: 120, status: 'pending', conceptIds: ['agent-eval'], dependsOn: ['tooling-memory'] },
    ]},
  ] }
  return nextRevision({ ...state, project: { id: id('project'), title: input.goal.slice(0, 40), goal: input.goal, experience: input.experience, weeklyHours: input.weeklyHours, status: 'active', createdAt }, plans: [plan], mastery: conceptIds.map((conceptId, index) => ({ conceptId, title: ['Agent 状态建模 / Agent State Modeling', 'Planner / Verifier', 'Tooling 与 Memory / Tooling and Memory', 'Agent Eval'][index]!, level: 'introduced', evidenceIds: [], rationale: '已列入计划，尚无用户证据。 / Planned, but no learner evidence yet.', updatedAt: createdAt })), events: [...state.events, event('learnloop/project-created', '学习项目已建立 / Learning project created', input.idempotencyKey), event('learnloop/plan-created', '第一版学习计划已生成 / Initial learning plan generated')] })
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
