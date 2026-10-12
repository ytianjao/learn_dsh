import { describe, expect, it } from 'vitest'
import {completeProfileInterviewFixture, activeProject, approveWorkspacePlan, beginWorkspaceOnboarding, compilePlanIntent, confirmWorkspaceProfile, createPlanDraftFromIntent, emptyState, requestPlanDraftRevision, validatePlanIntent, workspaceOf, finalizeLearnLoopToolError, renderLearnLoopRuntimeContext } from '../src/index.js'

const intent = { stages: [{ title: 'Foundations', outcome: 'Understand boundaries.', tasks: [
  { title: 'Explain state', objective: 'Explain the boundary.', activity: 'explain' as const, acceptanceCriteria: ['Explain global state.'], checkPrompt: 'Explain the boundary.', estimateMinutes: 30 },
  { title: 'Worked recovery', objective: 'Trace a recovery.', activity: 'example' as const, acceptanceCriteria: ['Identify restored state.'], checkPrompt: 'Explain the recovery.', estimateMinutes: 30 },
] }] }
function planning() {
  let state = beginWorkspaceOnboarding(emptyState(), { workspaceId: 'ws', sessionId: 'session', expectedRevision: 0, idempotencyKey: 'begin' })
  const projectId = workspaceOf(state, 'ws').activeProjectId!
  state = completeProfileInterviewFixture(state, 'ws', { 'goal.subject': 'Learn', 'learning-mode.style': ['read-only'] })
  return confirmWorkspaceProfile(state, { workspaceId: 'ws', projectId, sessionId: 'session', profileRevision: activeProject(workspaceOf(state, 'ws')).profileRevision, expectedRevision: workspaceOf(state, 'ws').revision, idempotencyKey: 'confirm' })
}
describe('Plan Intent compiler', () => {
  it('generates canonical identities in a deterministic linear order', () => {
    const state = planning(), profile = activeProject(workspaceOf(state, 'ws')).profile!
    const plan = compilePlanIntent(intent, profile, { planVersion: 1, createdAt: '2026-01-01T00:00:00.000Z', uuid: (() => { let n = 0; return () => String(++n) })() })
    const tasks = plan.stages.flatMap(stage => stage.tasks)
    expect(plan).toMatchObject({ id: 'plan_1', status: 'draft', version: 1 })
    expect(tasks.map(task => task.status)).toEqual(['pending', 'pending'])
    expect(tasks.map(task => task.title)).toEqual(['Explain state', 'Worked recovery'])
    expect(tasks.every(task => task.id.startsWith('task_') && task.conceptId.startsWith('concept_'))).toBe(true)
  })
  it('atomically publishes and payload-binds call id replay', () => {
    const state = planning(), first = createPlanDraftFromIntent(state, { sessionId: 'session', callId: 'call', plan: intent })
    expect(createPlanDraftFromIntent(first, { sessionId: 'session', callId: 'call', plan: intent })).toBe(first)
    expect(() => createPlanDraftFromIntent(first, { sessionId: 'session', callId: 'call', plan: { ...intent, stages: [{ ...intent.stages[0]!, title: 'Changed' }] } })).toThrowError(expect.objectContaining({ code: 'IDEMPOTENCY_KEY_REUSED' }))
    expect(activeProject(workspaceOf(first, 'ws')).phase).toBe('plan_review')
  })
  it('restores the canonical draft result after approval instead of scanning current state', () => {
    let state = createPlanDraftFromIntent(planning(), { sessionId: 'session', callId: 'call', plan: intent })
    const original = state.commandReceipts.find(receipt => receipt.idempotencyKey === 'plan-draft:call')!.result
    const project = activeProject(workspaceOf(state, 'ws'))
    state = approveWorkspacePlan(state, { workspaceId: 'ws', projectId: project.id, planId: project.plans[0]!.id, expectedRevision: workspaceOf(state, 'ws').revision, idempotencyKey: 'approve', sessionId: 'session' })
    const replayed = createPlanDraftFromIntent(state, { sessionId: 'session', callId: 'call', plan: intent })
    expect(replayed).toBe(state)
    expect(replayed.commandReceipts.find(receipt => receipt.idempotencyKey === 'plan-draft:call')!.result).toEqual(original)
    expect(activeProject(workspaceOf(replayed, 'ws')).plans).toHaveLength(1)
  })
  it('archives an explicitly rejected draft and permits a strictly newer draft', () => {
    let state = createPlanDraftFromIntent(planning(), { sessionId: 'session', callId: 'v1', plan: intent })
    state = requestPlanDraftRevision(state, { sessionId: 'session', callId: 'revise', reason: 'Use a clearer recovery example.' })
    const replayed = requestPlanDraftRevision(state, { sessionId: 'session', callId: 'revise', reason: 'Use a clearer recovery example.' })
    expect(replayed).toBe(state)
    expect(activeProject(workspaceOf(state, 'ws')).plans[0]!.status).toBe('archived')
    state = createPlanDraftFromIntent(state, { sessionId: 'session', callId: 'v2', plan: intent })
    const project = activeProject(workspaceOf(state, 'ws'))
    expect(project.plans.map(plan => [plan.version, plan.status])).toEqual([[1, 'archived'], [2, 'draft']])
    expect(() => approveWorkspacePlan(state, { workspaceId: 'ws', projectId: project.id, planId: project.plans[0]!.id, expectedRevision: workspaceOf(state, 'ws').revision, idempotencyKey: 'old', sessionId: 'session' })).toThrowError(expect.objectContaining({ code: 'PLAN_APPROVAL_MISMATCH' }))
  })
  it('names the violated rule in the tool error and publishes the profile-derived constraints before drafting', () => {
    const state = planning(), profile = activeProject(workspaceOf(state, 'ws')).profile!
    const withApply = { stages: [{ ...intent.stages[0]!, tasks: [...intent.stages[0]!.tasks, { ...intent.stages[0]!.tasks[0]!, title: 'Judge a framework', activity: 'apply' as const }] }] }
    let message = ''
    try { validatePlanIntent(withApply, profile) } catch (error) { message = (error as Error).message }
    const text = (finalizeLearnLoopToolError({} as never, { isError: true, error: { message, info: { code: 'INVALID_PLAN' } } } as never) as Array<{ text: string }>)[0]!.text
    const envelope = JSON.parse(text.split('<learnloop-tool-error-json>\n')[1]!.split('\n</learnloop-tool-error-json>')[0]!)
    expect(envelope).toMatchObject({ code: 'INVALID_PLAN', recovery: { kind: 'correct-and-retry' } })
    expect(envelope.details.violation).toContain('"Judge a framework"')
    const control = JSON.parse(renderLearnLoopRuntimeContext(state, 'session').split('<learnloop-host-control-json>\n')[1]!.split('\n</learnloop-host-control-json>')[0]!)
    expect(control.planConstraints).toEqual({ allowedActivities: ['explain', 'example'], minExplainOrExampleShare: 0.6, exampleInEveryStage: false, maxTotalMinutes: profile.weeklyHours * 60 * 52 })
  })
  it('rejects malformed and preference-invalid intents without mutation', () => {
    const state = planning(), profile = activeProject(workspaceOf(state, 'ws')).profile!
    const malformed: unknown[] = [
      {}, { stages: [] }, { stages: 'bad' }, { ...intent, extra: true },
      { stages: [{ ...intent.stages[0], extra: true }] },
      { stages: [{ ...intent.stages[0], tasks: [{}] }] },
      ...['refection','reflection','lesson','worked-example','implementation','discussion'].map(activity => ({ stages: [{ ...intent.stages[0], tasks: intent.stages[0]!.tasks.map((task, index) => index ? task : { ...task, activity }) }] })),
      ...[2.5, 9, 241, Number.NaN, '30'].map(estimateMinutes => ({ stages: [{ ...intent.stages[0], tasks: intent.stages[0]!.tasks.map((task, index) => index ? task : { ...task, estimateMinutes }) }] })),
      { stages: [{ ...intent.stages[0], title: ' ' }] }, { stages: [{ ...intent.stages[0], outcome: '' }] },
      { stages: [{ ...intent.stages[0], tasks: [] }] }, { stages: [{ ...intent.stages[0], tasks: intent.stages[0]!.tasks.map(task => ({ ...task, acceptanceCriteria: [] })) }] },
      { stages: [{ ...intent.stages[0], tasks: intent.stages[0]!.tasks.map(task => ({ ...task, checkPrompt: '' })) }] },
      { stages: [{ ...intent.stages[0], tasks: [...intent.stages[0]!.tasks, { ...intent.stages[0]!.tasks[0] }] }] },
      { workspaceId: 'host-id', ...intent }, { projectId: 'host-id', ...intent }, { idempotencyKey: 'model', ...intent },
      { stages: Array.from({ length: 7 }, (_, index) => ({ ...intent.stages[0]!, title: `Stage ${index}` })) },
      { stages: [{ ...intent.stages[0], tasks: intent.stages[0]!.tasks.map(task => ({ ...task, acceptanceCriteria: Array(9).fill('criterion') })) }] },
    ]
    expect(malformed).toHaveLength(28)
    let rejected = 0, mutations = 0; const baseline = state.revision
    for (const value of malformed) { try { validatePlanIntent(value, profile) } catch { rejected++ } if (state.revision !== baseline) mutations++ }
    expect({ total: malformed.length, rejectedBeforeExecute: rejected, unexpectedExecuteCount: malformed.length - rejected, stateMutationCount: mutations }).toEqual({ total: 28, rejectedBeforeExecute: 28, unexpectedExecuteCount: 0, stateMutationCount: 0 })
  })
})
