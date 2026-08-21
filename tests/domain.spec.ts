import { describe, expect, it } from 'vitest'
import { completeTaskWithEvidence, decideAdjustment, emptyState, initializeProject, learnLoopDomainSpec, nextAction, proposeAdjustment, publishGeneratedPlan, recordEvidence, resetState, setTaskState, updateSettings } from '../src/domain.js'
import type { GeneratedPlanInput } from '../src/types.js'

export const generatedPlan = { stages: [
  { key: 'foundation', title: 'Foundation', tasks: [
    { key: 'runtime-state', title: 'Runtime State', objective: 'Model state', acceptanceCriteria: ['Explain states'], estimateMinutes: 45, conceptKey: 'runtime-state', conceptTitle: 'Runtime State', dependsOn: [], kind: 'lesson', completion: { kind: 'short-answer', prompt: 'Explain states' } },
    { key: 'planner-verifier', title: 'Planner Verifier', objective: 'Close loop', acceptanceCriteria: ['Verify retries'], estimateMinutes: 90, conceptKey: 'planner-verifier', conceptTitle: 'Planner Verifier', dependsOn: ['runtime-state'], kind: 'worked-example', completion: { kind: 'reflection', prompt: 'Reflect on retries' } },
  ] },
  { key: 'production', title: 'Production', tasks: [
    { key: 'tooling-memory', title: 'Tooling Memory', objective: 'Set boundaries', acceptanceCriteria: ['Draw flow'], estimateMinutes: 90, conceptKey: 'tooling-memory', conceptTitle: 'Tooling Memory', dependsOn: ['planner-verifier'], kind: 'lesson', completion: { kind: 'short-answer', prompt: 'Draw flow' } },
    { key: 'agent-eval', title: 'Agent Eval', objective: 'Evaluate behavior', acceptanceCriteria: ['Write fixtures'], estimateMinutes: 120, conceptKey: 'agent-eval', conceptTitle: 'Agent Eval', dependsOn: ['tooling-memory'], kind: 'worked-example', completion: { kind: 'reflection', prompt: 'Reflect on fixtures' } },
  ] },
] } satisfies GeneratedPlanInput
function project() { return publishGeneratedPlan(initializeProject(emptyState(), { goal: '掌握商业级 Agent 系统', experience: '5 年开发，做过 RAG', weeklyHours: 10, sessionId: 'session-a', learningPreferences: { mode: 'balanced', practiceCapacity: 'light', explanationDepth: 'standard', exampleDensity: 'standard', additionalNotes: '' }, idempotencyKey: 'init-1' }), { ...generatedPlan, idempotencyKey: 'plan-1' }) }
describe('LearnLoop domain / LearnLoop 领域模型', () => {
  it('keeps the storage unit compatible while values migrate to schema v2', () => {
    expect(learnLoopDomainSpec.version).toBe(1)
    expect(emptyState().schemaVersion).toBe(2)
  })
  it('publishes one immutable active plan and applies a real operation', () => {
    const state = project(), task = nextAction(state)!
    const adjusted = proposeAdjustment(state, { impact: 'minor', reason: '延长练习 / Extend practice', diff: ['45m → 60m'], operations: [{ type: 'update-task', taskId: task.id, patch: { estimateMinutes: 60 } }], idempotencyKey: 'minor-1' })
    expect(adjusted.plans.filter(plan => plan.status === 'active')).toHaveLength(1)
    expect(nextAction(adjusted)?.estimateMinutes).toBe(60)
    expect(nextAction(state)?.estimateMinutes).toBe(45)
  })
  it('requires approval for a major adjustment and reverts through a new version', () => {
    const state = project(), task = nextAction(state)!
    const proposed = proposeAdjustment(state, { impact: 'major', reason: '改写目标 / Rewrite objective', diff: ['objective changed'], operations: [{ type: 'update-task', taskId: task.id, patch: { objective: '新目标 / New objective' } }], idempotencyKey: 'major-1' })
    expect(proposed.adjustments[0]?.state).toBe('proposed'); expect(proposed.plans).toHaveLength(1)
    const applied = decideAdjustment(proposed, proposed.adjustments[0]!.id, 'apply', 'decision-apply')
    expect(nextAction(applied)?.objective).toBe('新目标 / New objective'); expect(applied.plans).toHaveLength(2)
    const reverted = decideAdjustment(applied, proposed.adjustments[0]!.id, 'revert', 'decision-revert')
    expect(nextAction(reverted)?.objective).toBe(task.objective); expect(reverted.plans).toHaveLength(3); expect(reverted.adjustments[0]?.revertedPlanVersion).toBe(3)
  })
  it('moves a task and can restore its previous position', () => {
    const state = project(), second = state.plans[0]!.stages[0]!.tasks[1]!, destination = state.plans[0]!.stages[1]!
    const moved = proposeAdjustment(state, { impact: 'minor', reason: 'move', diff: ['move'], operations: [{ type: 'move-task', taskId: second.id, toStageId: destination.id }], idempotencyKey: 'move' })
    expect(moved.plans.at(-1)!.stages[1]!.tasks.at(-1)?.id).toBe(second.id)
    const reverted = decideAdjustment(moved, moved.adjustments[0]!.id, 'revert', 'undo-move')
    expect(reverted.plans.at(-1)!.stages[0]!.tasks[1]?.id).toBe(second.id)
  })
  it('deduplicates writes and gives introduced a reachable meaning', () => {
    const initial = project(); expect(initial.mastery[0]?.level).toBe('introduced')
    const once = recordEvidence(initial, { idempotencyKey: 'ev-1', conceptId: 'concept-runtime-state', kind: 'explanation', summary: 'finish vs status', source: { sessionId: 's1', messageRange: 'm1' }, confidence: .8 })
    expect(recordEvidence(once, { ...once.evidence[0]!, idempotencyKey: 'ev-1' }).evidence).toHaveLength(1)
  })
  it('requires diverse evidence before mastery', () => { let state = project(); state = recordEvidence(state, { idempotencyKey: 'a', conceptId: 'concept-runtime-state', kind: 'explanation', summary: '解释', source: { sessionId: 's', messageRange: '1' }, confidence: .8 }); expect(state.mastery[0]?.level).toBe('practicing'); state = recordEvidence(state, { idempotencyKey: 'b', conceptId: 'concept-runtime-state', kind: 'pseudocode', summary: '伪代码', source: { sessionId: 's', messageRange: '2' }, confidence: .9 }); expect(state.mastery[0]?.level).toBe('demonstrated'); state = recordEvidence(state, { idempotencyKey: 'c', conceptId: 'concept-runtime-state', kind: 'assessment', summary: '评测', source: { sessionId: 's', messageRange: '3' }, confidence: .9 }); expect(state.mastery[0]?.level).toBe('mastered') })
  it('computes dependencies and keeps reset revisions monotonic', () => { const state = project(), task = nextAction(state)!; const complete = completeTaskWithEvidence(state, { taskId: task.id, conceptId: task.conceptIds[0]!, kind: 'explanation', summary: 'done', source: { sessionId: 'session-a', messageRange: 'test' }, confidence: .7, idempotencyKey: 'done-1' }); expect(nextAction(complete)?.title).toContain('Planner'); const reset = resetState(complete, 'reset-1'); expect(reset.revision).toBe(complete.revision + 1); expect(reset.project).toBeNull() })
  it('records idempotent settings changes', () => { const state = project(), changed = updateSettings(state, { ...state.settings, language: 'en' }, 'settings-1'); expect(changed.settings.language).toBe('en'); expect(updateSettings(changed, changed.settings, 'settings-1')).toBe(changed) })
  it('atomically completes a task with evidence and mastery in one immutable revision', () => {
    const state = project(), before = structuredClone(state), task = nextAction(state)!
    const completed = completeTaskWithEvidence(state, { idempotencyKey: 'complete-1', taskId: task.id, conceptId: task.conceptIds[0]!, kind: 'explanation', summary: 'finish 和 checkpoint 支持恢复', source: { sessionId: 'browser', messageRange: 'manual-submission' }, confidence: .72 })
    expect(completed.revision).toBe(state.revision + 1)
    expect(completed.evidence).toHaveLength(state.evidence.length + 1)
    expect(completed.plans[0]!.stages[0]!.tasks[0]!.status).toBe('completed')
    expect(completed.mastery[0]).toMatchObject({ level: 'practicing', evidenceIds: [completed.evidence[0]!.id] })
    expect(completed.events.some(item => item.stableId === 'complete-1')).toBe(true)
    expect(state).toEqual(before)
  })
  it('replays an atomic completion without duplicate changes', () => {
    const state = project(), task = nextAction(state)!, input = { idempotencyKey: 'complete-replay', taskId: task.id, conceptId: task.conceptIds[0]!, kind: 'explanation' as const, summary: 'explanation', source: { sessionId: 'browser', messageRange: 'manual-submission' }, confidence: .72 }
    const once = completeTaskWithEvidence(state, input), replayed = completeTaskWithEvidence(once, input)
    expect(replayed).toBe(once)
    expect(replayed).toMatchObject({ revision: once.revision, evidence: once.evidence, events: once.events })
  })
  it('rejects invalid task and concepts without changing the input state', () => {
    const state = project(), before = structuredClone(state), task = nextAction(state)!, base = { idempotencyKey: 'invalid', taskId: task.id, conceptId: task.conceptIds[0]!, kind: 'explanation' as const, summary: 'explanation', source: { sessionId: 'browser', messageRange: 'manual-submission' }, confidence: .72 }
    expect(() => completeTaskWithEvidence(state, { ...base, taskId: 'missing-task' })).toThrow('task not found')
    expect(() => completeTaskWithEvidence(state, { ...base, conceptId: 'missing-concept' })).toThrow('concept not found')
    expect(() => completeTaskWithEvidence(state, { ...base, conceptId: 'concept-planner-verifier' })).toThrow('concept does not belong to task')
    expect(state).toEqual(before)
  })
  it('rejects a second completion command for an already completed task', () => {
    const state = project(), task = nextAction(state)!, input = { taskId: task.id, conceptId: task.conceptIds[0]!, kind: 'explanation' as const, summary: 'explanation', source: { sessionId: 'browser', messageRange: 'manual-submission' }, confidence: .72 }
    const once = completeTaskWithEvidence(state, { ...input, idempotencyKey: 'complete-first' })
    expect(() => completeTaskWithEvidence(once, { ...input, idempotencyKey: 'complete-second' })).toThrow('task is already completed')
    expect(once.evidence).toHaveLength(1)
    expect(once.revision).toBe(state.revision + 1)
  })
})

describe('generated plan publication', () => {
  it('initializes an empty pending plan and atomically publishes model input', () => {
    const initialized = initializeProject(emptyState(), { goal: '量化风险', experience: '', weeklyHours: 8, sessionId: 'session-a', learningPreferences: { mode: 'balanced', practiceCapacity: 'light', explanationDepth: 'standard', exampleDensity: 'standard', additionalNotes: '' }, idempotencyKey: 'init-new' })
    expect(initialized.plans[0]?.stages).toEqual([]); expect(initialized.mastery).toEqual([]); expect(nextAction(initialized)).toBeNull()
    const published = publishGeneratedPlan(initialized, { ...generatedPlan, idempotencyKey: 'call-1' })
    expect(published.revision).toBe(initialized.revision + 1); expect(nextAction(published)?.title).toBe('Runtime State'); expect(initialized.plans[0]?.stages).toEqual([])
    expect(publishGeneratedPlan(published, { ...generatedPlan, idempotencyKey: 'call-1' })).toBe(published)
    expect(() => publishGeneratedPlan(published, { ...generatedPlan, idempotencyKey: 'call-2' })).toThrow('already published')
  })
  it.each([
    [{ stages: [] }, '1 to 8 stages'],
    [{ stages: [{ ...generatedPlan.stages[0]!, tasks: [] }] }, 'stage must contain'],
    [{ stages: [{ ...generatedPlan.stages[0]!, tasks: [generatedPlan.stages[0]!.tasks[0]!, { ...generatedPlan.stages[0]!.tasks[1]!, key: 'runtime-state' }] }] }, 'duplicate task key'],
    [{ stages: [{ ...generatedPlan.stages[0]!, tasks: [generatedPlan.stages[0]!.tasks[0]!, { ...generatedPlan.stages[0]!.tasks[1]!, dependsOn: ['missing'] }] }] }, 'does not exist'],
    [{ stages: [{ ...generatedPlan.stages[0]!, tasks: [generatedPlan.stages[0]!.tasks[0]!, { ...generatedPlan.stages[0]!.tasks[1]!, dependsOn: ['planner-verifier'] }] }] }, 'itself'],
  ])('rejects invalid plans without partial writes', (candidate, message) => { const state = initializeProject(emptyState(), { goal: 'x', experience: '', weeklyHours: 1, sessionId: 'session-a', learningPreferences: { mode: 'balanced', practiceCapacity: 'light', explanationDepth: 'standard', exampleDensity: 'standard', additionalNotes: '' }, idempotencyKey: 'i' }); const before = structuredClone(state); expect(() => publishGeneratedPlan(state, { ...candidate, idempotencyKey: 'bad' })).toThrow(message); expect(state).toEqual(before) })
  it('destructively discards business state while retaining settings', async () => { const { discardCurrentProject } = await import('../src/domain.js'); const state = project(); const discarded = discardCurrentProject(state, 'discard-1'); expect(discarded.project).toBeNull(); expect(discarded.plans).toEqual([]); expect(discarded.settings).toEqual(state.settings); expect(discardCurrentProject(discarded, 'discard-1')).toBe(discarded) })
})
