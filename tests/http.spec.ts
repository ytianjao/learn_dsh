import { EventEmitter } from 'node:events'
import { describe, expect, it } from 'vitest'
import { createLearnLoopHttpHandler } from '../src/http.js'
import { emptyState } from '../src/domain.js'
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
  it('creates and returns the authoritative project', async () => { const table = new Table(), call = request({ action: 'initialize', goal: '学习 Agent', experience: 'RAG', weeklyHours: 10 }); await run(table, call); expect(call.status()).toBe(200); expect((call.json().project as { goal: string }).goal).toBe('学习 Agent'); expect(table.state.revision).toBe(1) })
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
})
