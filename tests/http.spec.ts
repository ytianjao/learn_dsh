import { EventEmitter } from 'node:events'
import { describe, expect, it } from 'vitest'
import { createLearnLoopHttpHandler } from '../src/http.js'
import { emptyState, publishGeneratedPlan } from '../src/domain.js'
import { generatedPlan } from './domain.spec.js'
import type { LearnLoopState, StateTable } from '../src/types.js'

class Table implements StateTable {
  state = emptyState()
  get() { return this.state }
  async put(_id: string, value: LearnLoopState) { this.state = value }
  async update(_id: string, fn: (state: LearnLoopState) => LearnLoopState) { return this.state = fn(this.state) }
}
function request(value: object, revision = 0, headers: Record<string, string> = {}) {
  const req = new EventEmitter() as EventEmitter & AsyncIterable<Buffer> & { method: string; headers: Record<string, string> }
  req.method = 'POST'; req.headers = { 'content-type': 'application/json', 'x-learnloop-mutation': '1', host: 'localhost', ...headers }
  req[Symbol.asyncIterator] = async function* () { yield Buffer.from(JSON.stringify({ idempotencyKey: 'key-1', ...value, revision })) }
  let status = 0, payload = ''; const res = { writeHead(code: number) { status = code }, end(response: string) { payload = response } }
  return { req, res, status: () => status, json: () => JSON.parse(payload) as Record<string, unknown> }
}
async function run(table: Table, call: ReturnType<typeof request>) { await createLearnLoopHttpHandler(table)(call.req as never, call.res as never); return call }
describe('LearnLoop HTTP projection / LearnLoop HTTP 投影', () => {
  it('creates and returns the authoritative project', async () => { const table = new Table(), call = request({ action: 'initialize', goal: '学习 Agent', experience: 'RAG', weeklyHours: 10, sessionId: 'session-a', learningPreferences: { mode: 'balanced', practiceCapacity: 'light', explanationDepth: 'standard', exampleDensity: 'standard', additionalNotes: '' } }); await run(table, call); expect(call.status()).toBe(200); expect((call.json().project as { goal: string }).goal).toBe('学习 Agent'); expect(table.state.revision).toBe(1) })
  it('atomically rejects one of two concurrent writes', async () => { const table = new Table(), first = request({ action: 'settings', language: 'en', weeklyHours: 10, strictness: 'balanced', autoMinorAdjustments: true, showModeExplanation: false, antiDependency: true, idempotencyKey: 'a' }), second = request({ action: 'settings', language: 'zh-CN', weeklyHours: 12, strictness: 'strict', autoMinorAdjustments: false, showModeExplanation: true, antiDependency: false, idempotencyKey: 'b' }); await Promise.all([run(table, first), run(table, second)]); expect([first.status(), second.status()].sort()).toEqual([200, 409]); expect(table.state.revision).toBe(1) })
  it('keeps reset revisions monotonic and rejects an old revision', async () => { const table = new Table(); table.state = { ...table.state, revision: 2 }; const reset = request({ action: 'reset' }, 2); await run(table, reset); expect(table.state.revision).toBe(3); const stale = request({ action: 'settings', language: 'en', weeklyHours: 10, strictness: 'balanced', autoMinorAdjustments: true, showModeExplanation: false, antiDependency: true, idempotencyKey: 'stale' }, 0); await run(table, stale); expect(stale.status()).toBe(409) })
  it('returns a committed projection for an idempotent retry', async () => { const table = new Table(), first = request({ action: 'settings', language: 'en', weeklyHours: 10, strictness: 'balanced', autoMinorAdjustments: true, showModeExplanation: false, antiDependency: true }); await run(table, first); const retry = request({ action: 'settings', language: 'en', weeklyHours: 10, strictness: 'balanced', autoMinorAdjustments: true, showModeExplanation: false, antiDependency: true }, 0); await run(table, retry); expect(retry.status()).toBe(200); expect(table.state.revision).toBe(1) })
  it.each([
    [{ action: 'task-state', taskId: 'x', status: 'corrupt' }, 400],
    [{ action: 'evidence', conceptId: 'x', kind: 'magic', summary: 'x', sessionId: 's', messageRange: 'm', confidence: 2 }, 400],
    [{ action: 'adjustment-decision', adjustmentId: 'x', decision: 'erase' }, 400],
    [{ action: 'adjustment', impact: 'unknown', reason: 'x', diff: ['x'], operations: [] }, 400],
  ])('rejects malformed mutations', async (payload, expected) => { const call = request(payload); await run(new Table(), call); expect(call.status()).toBe(expected) })
  it('rejects malformed and cross-origin requests', async () => { for (const origin of ['not a url', 'https://evil.example']) { const call = request({ action: 'reset' }, 0, { origin }); await run(new Table(), call); expect(call.status()).toBe(403) } })
  it('atomically completes a task with evidence in one revision and supports stale retry', async () => {
    const table = new Table(), initialized = request({ action: 'initialize', goal: '学习 Agent', experience: 'RAG', weeklyHours: 10, sessionId: 'session-a', learningPreferences: { mode: 'balanced', practiceCapacity: 'light', explanationDepth: 'standard', exampleDensity: 'standard', additionalNotes: '' }, idempotencyKey: 'init' }); await run(table, initialized); table.state = publishGeneratedPlan(table.state, { ...generatedPlan, idempotencyKey: 'plan' })
    const payload = { action: 'complete-task-with-evidence', taskId: 'task-runtime-state', conceptId: 'concept-runtime-state', kind: 'explanation', summary: '状态和 checkpoint 分工明确', sessionId: 'browser', messageRange: 'manual-submission', confidence: .72, idempotencyKey: 'complete' }
    const complete = request(payload, 2); await run(table, complete)
    expect(complete.status()).toBe(200); expect(table.state.revision).toBe(3); expect(table.state.evidence).toHaveLength(1); expect(table.state.mastery[0]?.level).toBe('practicing'); expect(table.state.plans[0]?.stages[0]?.tasks[0]?.status).toBe('completed')
    const retry = request(payload, 2); await run(table, retry)
    expect(retry.status()).toBe(200); expect(table.state.revision).toBe(3); expect(table.state.evidence).toHaveLength(1)
  })
  it('allows only one concurrent atomic completion at the same revision', async () => {
    const table = new Table(), initialized = request({ action: 'initialize', goal: '学习 Agent', experience: 'RAG', weeklyHours: 10, sessionId: 'session-a', learningPreferences: { mode: 'balanced', practiceCapacity: 'light', explanationDepth: 'standard', exampleDensity: 'standard', additionalNotes: '' }, idempotencyKey: 'init' }); await run(table, initialized); table.state = publishGeneratedPlan(table.state, { ...generatedPlan, idempotencyKey: 'plan' })
    const base = { action: 'complete-task-with-evidence', taskId: 'task-runtime-state', conceptId: 'concept-runtime-state', kind: 'explanation', summary: 'evidence', sessionId: 'browser', messageRange: 'manual-submission', confidence: .72 }
    const first = request({ ...base, idempotencyKey: 'complete-a' }, 2), second = request({ ...base, idempotencyKey: 'complete-b' }, 2)
    await Promise.all([run(table, first), run(table, second)])
    expect([first.status(), second.status()].sort()).toEqual([200, 409]); expect(table.state.revision).toBe(3); expect(table.state.evidence).toHaveLength(1); expect(table.state.plans[0]?.stages[0]?.tasks[0]?.status).toBe('completed')
  })
  it.each([
    { taskId: 'task-runtime-state', conceptId: 'concept-runtime-state', kind: 'explanation', summary: '', sessionId: 'browser', messageRange: 'manual-submission', confidence: .72 },
    { taskId: 'task-runtime-state', conceptId: 'concept-runtime-state', kind: 'explanation', summary: 'x', sessionId: 'browser', messageRange: 'manual-submission', confidence: 2 },
    { taskId: 'task-runtime-state', conceptId: 'concept-runtime-state', kind: 'magic', summary: 'x', sessionId: 'browser', messageRange: 'manual-submission', confidence: .72 },
    { conceptId: 'concept-runtime-state', kind: 'explanation', summary: 'x', sessionId: 'browser', messageRange: 'manual-submission', confidence: .72 },
  ])('rejects malformed atomic completion input', async payload => { const call = request({ action: 'complete-task-with-evidence', ...payload }); await run(new Table(), call); expect(call.status()).toBe(400) })
  it('leaves no partial state when atomic completion domain validation fails', async () => {
    const table = new Table(), initialized = request({ action: 'initialize', goal: '学习 Agent', experience: 'RAG', weeklyHours: 10, sessionId: 'session-a', learningPreferences: { mode: 'balanced', practiceCapacity: 'light', explanationDepth: 'standard', exampleDensity: 'standard', additionalNotes: '' }, idempotencyKey: 'init' }); await run(table, initialized); table.state = publishGeneratedPlan(table.state, { ...generatedPlan, idempotencyKey: 'plan' })
    const call = request({ action: 'complete-task-with-evidence', taskId: 'task-runtime-state', conceptId: 'concept-planner-verifier', kind: 'explanation', summary: 'x', sessionId: 'browser', messageRange: 'manual-submission', confidence: .72, idempotencyKey: 'invalid-concept' }, 2); await run(table, call)
    expect(call.status()).toBe(400); expect(table.state.revision).toBe(2); expect(table.state.evidence).toHaveLength(0); expect(table.state.plans[0]?.stages[0]?.tasks[0]?.status).toBe('active')
  })
})
