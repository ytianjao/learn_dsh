import { describe, expect, it } from 'vitest'
import { decideAdjustment, emptyState, initializeProject, nextAction, proposeAdjustment, recordEvidence, resetState, setTaskState, updateSettings } from '../src/domain.js'

function project() { return initializeProject(emptyState(), { goal: '掌握商业级 Agent 系统', experience: '5 年开发，做过 RAG', weeklyHours: 10, idempotencyKey: 'init-1' }) }
describe('LearnLoop domain / LearnLoop 领域模型', () => {
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
    const once = recordEvidence(initial, { idempotencyKey: 'ev-1', conceptId: 'runtime-state', kind: 'explanation', summary: 'finish vs status', source: { sessionId: 's1', messageRange: 'm1' }, confidence: .8 })
    expect(recordEvidence(once, { ...once.evidence[0]!, idempotencyKey: 'ev-1' }).evidence).toHaveLength(1)
  })
  it('requires diverse evidence before mastery', () => { let state = project(); state = recordEvidence(state, { idempotencyKey: 'a', conceptId: 'runtime-state', kind: 'explanation', summary: '解释', source: { sessionId: 's', messageRange: '1' }, confidence: .8 }); expect(state.mastery[0]?.level).toBe('practicing'); state = recordEvidence(state, { idempotencyKey: 'b', conceptId: 'runtime-state', kind: 'pseudocode', summary: '伪代码', source: { sessionId: 's', messageRange: '2' }, confidence: .9 }); expect(state.mastery[0]?.level).toBe('demonstrated'); state = recordEvidence(state, { idempotencyKey: 'c', conceptId: 'runtime-state', kind: 'assessment', summary: '评测', source: { sessionId: 's', messageRange: '3' }, confidence: .9 }); expect(state.mastery[0]?.level).toBe('mastered') })
  it('computes dependencies and keeps reset revisions monotonic', () => { const state = project(), task = nextAction(state)!; const complete = setTaskState(state, { taskId: task.id, status: 'completed', idempotencyKey: 'done-1' }); expect(nextAction(complete)?.title).toContain('Planner'); const reset = resetState(complete, 'reset-1'); expect(reset.revision).toBe(complete.revision + 1); expect(reset.project).toBeNull() })
  it('records idempotent settings changes', () => { const state = project(), changed = updateSettings(state, { ...state.settings, language: 'en' }, 'settings-1'); expect(changed.settings.language).toBe('en'); expect(updateSettings(changed, changed.settings, 'settings-1')).toBe(changed) })
})
