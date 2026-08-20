import { randomUUID } from 'node:crypto'
import { z } from 'zod'
import type { DomainSpec } from '@deepseek-ai/dsh-storage-domain'
import type { AdjustmentProposal, Evidence, LearnLoopState, MasteryLevel, PlanVersion, StateTable, TaskState } from './types.js'

const now = (): string => new Date().toISOString()
const id = (prefix: string): string => `${prefix}_${randomUUID()}`
const taskState = z.enum(['pending', 'active', 'blocked', 'completed', 'skipped'])
const stateSchema: z.ZodType<LearnLoopState> = z.object({
  schemaVersion: z.literal(1), revision: z.number().int().nonnegative(),
  project: z.object({ id: z.string(), title: z.string(), goal: z.string(), experience: z.string(), weeklyHours: z.number(), status: z.enum(['active', 'archived']), createdAt: z.string() }).nullable(),
  plans: z.array(z.object({ id: z.string(), version: z.number(), status: z.enum(['draft', 'active', 'superseded', 'archived']), createdAt: z.string(), stages: z.array(z.object({ id: z.string(), title: z.string(), tasks: z.array(z.object({ id: z.string(), title: z.string(), objective: z.string(), acceptanceCriteria: z.array(z.string()), estimateMinutes: z.number(), status: taskState, conceptIds: z.array(z.string()), dependsOn: z.array(z.string()) })) })) })),
  evidence: z.array(z.object({ id: z.string(), idempotencyKey: z.string(), conceptId: z.string(), kind: z.enum(['explanation', 'pseudocode', 'implementation', 'hypothesis', 'assessment', 'reflection']), summary: z.string(), source: z.object({ sessionId: z.string(), messageRange: z.string() }), confidence: z.number(), createdAt: z.string() })),
  mastery: z.array(z.object({ conceptId: z.string(), title: z.string(), level: z.enum(['unassessed', 'introduced', 'practicing', 'demonstrated', 'mastered']), evidenceIds: z.array(z.string()), rationale: z.string(), updatedAt: z.string() })),
  assessments: z.array(z.object({ id: z.string(), conceptId: z.string(), result: z.enum(['needs-work', 'passed', 'excellent']), explanation: z.string(), evidenceId: z.string(), createdAt: z.string() })),
  adjustments: z.array(z.object({ id: z.string(), idempotencyKey: z.string(), impact: z.enum(['minor', 'major']), state: z.enum(['proposed', 'applied', 'rejected', 'reverted']), reason: z.string(), diff: z.array(z.string()), createdAt: z.string(), appliedPlanVersion: z.number().optional() })),
  events: z.array(z.object({ id: z.string(), stableId: z.string(), type: z.string(), summary: z.string(), createdAt: z.string() })),
  settings: z.object({ language: z.enum(['zh-CN', 'en']), weeklyHours: z.number().min(1).max(80), strictness: z.enum(['supportive', 'balanced', 'strict']), autoMinorAdjustments: z.boolean(), showModeExplanation: z.boolean(), antiDependency: z.boolean() }),
  misconceptions: z.array(z.string()), reviewQueue: z.array(z.string()),
}).strict()
export const learnLoopDomainSpec = { name: 'learnloop', version: 1, tables: { state: { valueSchema: stateSchema } } } as const satisfies DomainSpec

export function emptyState(): LearnLoopState {
  return { schemaVersion: 1, revision: 0, project: null, plans: [], evidence: [], mastery: [], assessments: [], adjustments: [], events: [], misconceptions: [], reviewQueue: [], settings: { language: 'zh-CN', weeklyHours: 10, strictness: 'balanced', autoMinorAdjustments: true, showModeExplanation: false, antiDependency: true } }
}
function event(type: string, summary: string, stableId = id('evt')) { return { id: id('event'), stableId, type, summary, createdAt: now() } }
function activePlan(state: LearnLoopState): PlanVersion { const plans = state.plans.filter(plan => plan.status === 'active'); if (plans.length !== 1) throw new Error('project must have exactly one active plan'); return plans[0]! }
function nextRevision(state: LearnLoopState): LearnLoopState { return { ...state, revision: state.revision + 1 } }

export function initializeProject(state: LearnLoopState, input: { goal: string; experience: string; weeklyHours: number; idempotencyKey: string }): LearnLoopState {
  if (state.events.some(item => item.stableId === input.idempotencyKey)) return state
  if (state.project !== null) throw new Error('an active project already exists')
  const createdAt = now(); const conceptIds = ['runtime-state', 'planner-verifier', 'tooling-memory', 'agent-eval']
  const plan: PlanVersion = { id: id('plan'), version: 1, status: 'active', createdAt, stages: [
    { id: id('stage'), title: 'Agent Runtime 基础', tasks: [
      { id: id('task'), title: '手写最小 Agent Runtime 的状态模型', objective: '区分全局完成状态、可恢复状态和等待状态', acceptanceCriteria: ['解释 finish、status 与 checkpoint 的职责', '提交状态转换伪代码'], estimateMinutes: 45, status: 'active', conceptIds: ['runtime-state'], dependsOn: [] },
      { id: id('task'), title: '实现 Planner / Verifier 闭环', objective: '用影响等级约束规划和验证', acceptanceCriteria: ['列出三类失败影响', '用 fixture 验证重试边界'], estimateMinutes: 90, status: 'pending', conceptIds: ['planner-verifier'], dependsOn: ['runtime-state'] },
    ]},
    { id: id('stage'), title: '生产级 Agent 系统', tasks: [
      { id: id('task'), title: '设计 Tooling 与 Memory 边界', objective: '区分模型上下文与持久事实', acceptanceCriteria: ['提交数据流图'], estimateMinutes: 90, status: 'pending', conceptIds: ['tooling-memory'], dependsOn: ['planner-verifier'] },
      { id: id('task'), title: '建立 Agent Eval', objective: '用可回放证据验收系统行为', acceptanceCriteria: ['提交至少三个确定性场景'], estimateMinutes: 120, status: 'pending', conceptIds: ['agent-eval'], dependsOn: ['tooling-memory'] },
    ]},
  ] }
  return nextRevision({ ...state, project: { id: id('project'), title: input.goal.slice(0, 40), goal: input.goal, experience: input.experience, weeklyHours: input.weeklyHours, status: 'active', createdAt }, plans: [plan], mastery: conceptIds.map((conceptId, index) => ({ conceptId, title: ['Agent 状态建模', 'Planner / Verifier', 'Tooling 与 Memory', 'Agent Eval'][index]!, level: 'unassessed', evidenceIds: [], rationale: '尚无足够的用户证据。', updatedAt: createdAt })), events: [...state.events, event('learnloop/project-created', '学习项目已建立', input.idempotencyKey), event('learnloop/plan-created', '第一版学习计划已生成')] })
}

export function setTaskState(state: LearnLoopState, input: { taskId: string; status: TaskState; idempotencyKey: string }): LearnLoopState {
  if (state.events.some(item => item.stableId === input.idempotencyKey)) return state
  const plan = activePlan(state); let found = false
  const changed = { ...plan, stages: plan.stages.map(stage => ({ ...stage, tasks: stage.tasks.map(task => { if (task.id !== input.taskId) return task; found = true; return { ...task, status: input.status } }) })) }
  if (!found) throw new Error('task not found')
  return nextRevision({ ...state, plans: state.plans.map(item => item.id === plan.id ? changed : item), events: [...state.events, event('learnloop/task-changed', `任务状态已更新为 ${input.status}`, input.idempotencyKey)] })
}

function masteryFor(evidence: Evidence[]): { level: MasteryLevel; rationale: string } {
  const high = evidence.filter(item => item.confidence >= .75)
  const kinds = new Set(high.map(item => item.kind))
  if (high.length >= 3 && (kinds.has('assessment') || kinds.has('implementation'))) return { level: 'mastered', rationale: `已有 ${high.length} 条高置信证据，且包含独立评测或实现。` }
  if (high.length >= 2) return { level: 'demonstrated', rationale: `已有 ${high.length} 条相互支持的高置信证据。` }
  if (evidence.length > 0) return { level: 'practicing', rationale: `已记录 ${evidence.length} 条练习证据，仍需不同情境下的验证。` }
  return { level: 'unassessed', rationale: '尚无足够的用户证据。' }
}
export function recordEvidence(state: LearnLoopState, input: Omit<Evidence, 'id' | 'createdAt'>): LearnLoopState {
  const existing = state.evidence.find(item => item.idempotencyKey === input.idempotencyKey); if (existing) return state
  if (!state.mastery.some(item => item.conceptId === input.conceptId)) throw new Error('concept not found')
  const saved: Evidence = { ...input, id: id('evidence'), createdAt: now() }; const evidence = [...state.evidence, saved]
  const mastery = state.mastery.map(item => { if (item.conceptId !== saved.conceptId) return item; const related = evidence.filter(candidate => candidate.conceptId === item.conceptId); const calculated = masteryFor(related); return { ...item, ...calculated, evidenceIds: related.map(candidate => candidate.id), updatedAt: now() } })
  return nextRevision({ ...state, evidence, mastery, events: [...state.events, event('learnloop/evidence-recorded', `已记录证据：${saved.summary}`, input.idempotencyKey), event('learnloop/mastery-changed', mastery.find(item => item.conceptId === saved.conceptId)!.rationale)] })
}

export function proposeAdjustment(state: LearnLoopState, input: { impact: 'minor' | 'major'; reason: string; diff: string[]; idempotencyKey: string }): LearnLoopState {
  if (state.adjustments.some(item => item.idempotencyKey === input.idempotencyKey)) return state
  const proposal: AdjustmentProposal = { id: id('adjustment'), ...input, state: input.impact === 'minor' && state.settings.autoMinorAdjustments ? 'applied' : 'proposed', createdAt: now() }
  let result = { ...state, adjustments: [...state.adjustments, proposal], events: [...state.events, event(proposal.state === 'applied' ? 'learnloop/adjustment-applied' : 'learnloop/adjustment-proposed', input.reason, input.idempotencyKey)] }
  if (proposal.state === 'applied') result = versionPlan(result, proposal)
  return nextRevision(result)
}
function versionPlan(state: LearnLoopState, adjustment: AdjustmentProposal): LearnLoopState { const current = activePlan(state); const version = current.version + 1; const replacement = { ...structuredClone(current), id: id('plan'), version, createdAt: now(), status: 'active' as const }; return { ...state, plans: [...state.plans.map(plan => plan.id === current.id ? { ...plan, status: 'superseded' as const } : plan), replacement], adjustments: state.adjustments.map(item => item.id === adjustment.id ? { ...item, state: 'applied', appliedPlanVersion: version } : item) } }
export function decideAdjustment(state: LearnLoopState, adjustmentId: string, decision: 'apply' | 'reject' | 'revert'): LearnLoopState { const target = state.adjustments.find(item => item.id === adjustmentId); if (!target) throw new Error('adjustment not found'); if (decision === 'apply' && target.state !== 'proposed') return state; if (decision === 'reject' && target.state !== 'proposed') return state; if (decision === 'revert' && target.state !== 'applied') return state; let result = state; if (decision === 'apply') result = versionPlan(state, target); result = { ...result, adjustments: result.adjustments.map(item => item.id === adjustmentId ? { ...item, state: decision === 'apply' ? 'applied' : decision === 'reject' ? 'rejected' : 'reverted' } : item), events: [...result.events, event(`learnloop/adjustment-${decision}`, `计划调整已${decision === 'apply' ? '应用' : decision === 'reject' ? '拒绝' : '撤销'}`)] }; return nextRevision(result) }
export function nextAction(state: LearnLoopState) { if (!state.project) return null; const plan = activePlan(state); const tasks = plan.stages.flatMap(stage => stage.tasks); return tasks.find(task => task.status === 'active') ?? tasks.find(task => task.status === 'pending' && task.dependsOn.every(dep => tasks.some(candidate => candidate.conceptIds.includes(dep) && candidate.status === 'completed'))) ?? null }
export async function ensureState(table: StateTable): Promise<LearnLoopState> { const current = table.get('singleton'); if (current) return current; const fresh = emptyState(); await table.put('singleton', fresh); return fresh }
