import type { IncomingMessage, ServerResponse } from 'node:http'
import { decideAdjustment, emptyState, initializeProject, nextAction, proposeAdjustment, recordEvidence, setTaskState } from './domain.js'
import type { LearnLoopState, StateTable } from './types.js'

export const API_PATH = '/learnloop/api/v1/state'
class RequestError extends Error { constructor(readonly status: number, message: string) { super(message) } }
function json(res: ServerResponse, status: number, value: unknown, headers: Record<string, string> = {}) { const body = JSON.stringify(value); res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Content-Length': String(Buffer.byteLength(body)), 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', ...headers }); res.end(body) }
function origin(req: IncomingMessage) { if (!req.headers.origin) return; const parsed = new URL(req.headers.origin); if (!['http:', 'https:'].includes(parsed.protocol) || parsed.host !== req.headers.host) throw new RequestError(403, 'Untrusted request origin.') }
async function body(req: IncomingMessage): Promise<Record<string, unknown>> { let size = 0; const chunks: Buffer[] = []; for await (const raw of req) { const part = Buffer.isBuffer(raw) ? raw : Buffer.from(raw); size += part.length; if (size > 128 * 1024) throw new RequestError(413, 'Request is too large.'); chunks.push(part) } try { const value: unknown = JSON.parse(Buffer.concat(chunks).toString('utf8')); if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(); return value as Record<string, unknown> } catch { throw new RequestError(400, 'Request body must be a JSON object.') } }
function text(value: unknown, field: string, max = 4000): string { if (typeof value !== 'string' || !value.trim() || value.length > max) throw new RequestError(400, `${field} is invalid.`); return value.trim() }
function integer(value: unknown, field: string, min: number, max: number): number { if (!Number.isInteger(value) || (value as number) < min || (value as number) > max) throw new RequestError(400, `${field} is invalid.`); return value as number }
function snapshot(state: LearnLoopState) { return { ...state, nextAction: nextAction(state) } }

export function createLearnLoopHttpHandler(table: StateTable) {
  return async (req: IncomingMessage, res: ServerResponse): Promise<void> => {
    try {
      const state = table.get('singleton') ?? emptyState()
      if (req.method === 'GET') { json(res, 200, snapshot(state)); return }
      if (req.method !== 'POST') { json(res, 405, { error: 'Only GET and POST are supported.' }, { Allow: 'GET, POST' }); return }
      origin(req)
      if ((req.headers['content-type'] ?? '').split(';')[0] !== 'application/json' || req.headers['x-learnloop-mutation'] !== '1') throw new RequestError(415, 'A JSON LearnLoop mutation is required.')
      const input = await body(req); const action = text(input.action, 'action', 80); const revision = integer(input.revision, 'revision', 0, Number.MAX_SAFE_INTEGER)
      if (state.revision !== revision) throw new RequestError(409, 'Learning state changed. Refresh and retry.')
      let updated: LearnLoopState
      if (action === 'initialize') updated = initializeProject(state, { goal: text(input.goal, 'goal'), experience: typeof input.experience === 'string' ? input.experience.slice(0, 2000) : '', weeklyHours: integer(input.weeklyHours, 'weeklyHours', 1, 80), idempotencyKey: text(input.idempotencyKey, 'idempotencyKey', 200) })
      else if (action === 'task-state') updated = setTaskState(state, { taskId: text(input.taskId, 'taskId', 200), status: text(input.status, 'status', 20) as never, idempotencyKey: text(input.idempotencyKey, 'idempotencyKey', 200) })
      else if (action === 'evidence') updated = recordEvidence(state, { idempotencyKey: text(input.idempotencyKey, 'idempotencyKey', 200), conceptId: text(input.conceptId, 'conceptId', 200), kind: text(input.kind, 'kind', 30) as never, summary: text(input.summary, 'summary', 1000), source: { sessionId: text(input.sessionId, 'sessionId', 200), messageRange: text(input.messageRange, 'messageRange', 200) }, confidence: Number(input.confidence) })
      else if (action === 'adjustment') updated = proposeAdjustment(state, { impact: input.impact === 'major' ? 'major' : 'minor', reason: text(input.reason, 'reason', 1000), diff: Array.isArray(input.diff) ? input.diff.map(item => text(item, 'diff', 500)).slice(0, 20) : [], idempotencyKey: text(input.idempotencyKey, 'idempotencyKey', 200) })
      else if (action === 'adjustment-decision') updated = decideAdjustment(state, text(input.adjustmentId, 'adjustmentId', 200), text(input.decision, 'decision', 20) as never)
      else if (action === 'settings') updated = { ...state, revision: state.revision + 1, settings: { language: input.language === 'en' ? 'en' : 'zh-CN', weeklyHours: integer(input.weeklyHours, 'weeklyHours', 1, 80), strictness: ['supportive', 'strict'].includes(String(input.strictness)) ? input.strictness as 'supportive' | 'strict' : 'balanced', autoMinorAdjustments: Boolean(input.autoMinorAdjustments), showModeExplanation: Boolean(input.showModeExplanation), antiDependency: Boolean(input.antiDependency) } }
      else if (action === 'reset') updated = emptyState()
      else throw new RequestError(400, 'Unsupported action.')
      await table.put('singleton', updated); json(res, 200, snapshot(updated))
    } catch (error) { const status = error instanceof RequestError ? error.status : 500; json(res, status, { error: error instanceof RequestError ? error.message : 'LearnLoop could not apply this change.' }) }
  }
}
