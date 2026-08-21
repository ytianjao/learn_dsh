import type { IncomingMessage, ServerResponse } from 'node:http'
import { z } from 'zod'
import { bindProjectSession, completeTaskWithEvidence, decideAdjustment, discardCurrentProject, emptyState, initializeProject, nextAction, proposeAdjustment, recordEvidence, resetState, setTaskState, startTask, updateSettings } from './domain.js'
import type { LearnLoopState, StateTable } from './types.js'

export const API_PATH = '/learnloop/api/v1/state'
class RequestError extends Error { constructor(readonly status: number, message: string) { super(message) } }
function json(res: ServerResponse, status: number, value: unknown, headers: Record<string, string> = {}) { const responseBody = JSON.stringify(value); res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Content-Length': String(Buffer.byteLength(responseBody)), 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', ...headers }); res.end(responseBody) }
function checkOrigin(req: IncomingMessage) { if (!req.headers.origin) return; let parsed: URL; try { parsed = new URL(req.headers.origin) } catch { throw new RequestError(403, 'Untrusted request origin. / 请求来源不可信。') } if (!['http:', 'https:'].includes(parsed.protocol) || parsed.host !== req.headers.host) throw new RequestError(403, 'Untrusted request origin. / 请求来源不可信。') }
async function readBody(req: IncomingMessage): Promise<unknown> { let size = 0; const chunks: Buffer[] = []; for await (const raw of req) { const part = Buffer.isBuffer(raw) ? raw : Buffer.from(raw); size += part.length; if (size > 128 * 1024) throw new RequestError(413, 'Request is too large. / 请求体过大。'); chunks.push(part) } try { return JSON.parse(Buffer.concat(chunks).toString('utf8')) as unknown } catch { throw new RequestError(400, 'Request body must be valid JSON. / 请求体必须是有效 JSON。') } }
function snapshot(state: LearnLoopState) { return { ...state, nextAction: nextAction(state) } }

const idempotencyKey = z.string().trim().min(1).max(200)
const common = { revision: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER), idempotencyKey }
const taskState = z.enum(['pending', 'active', 'blocked', 'completed', 'skipped'])
const learningPreferences = z.object({ mode: z.enum(['knowledge-first', 'balanced', 'practice-first']), practiceCapacity: z.enum(['none', 'light', 'full']), explanationDepth: z.enum(['standard', 'deep']), exampleDensity: z.enum(['standard', 'high']), additionalNotes: z.string().max(2000) }).strict()
const operation = z.discriminatedUnion('type', [
  z.object({ type: z.literal('update-task'), taskId: z.string().trim().min(1).max(200), patch: z.object({ title: z.string().trim().min(1).max(500).optional(), objective: z.string().trim().min(1).max(2000).optional(), acceptanceCriteria: z.array(z.string().trim().min(1).max(500)).max(20).optional(), estimateMinutes: z.number().int().min(1).max(10_000).optional(), status: taskState.optional() }).strict().refine(value => Object.keys(value).length > 0, 'patch must not be empty') }).strict(),
  z.object({ type: z.literal('move-task'), taskId: z.string().trim().min(1).max(200), toStageId: z.string().trim().min(1).max(200), beforeTaskId: z.string().trim().min(1).max(200).optional() }).strict().refine(value => value.beforeTaskId !== value.taskId, 'a task cannot be moved before itself'),
])
const mutationSchema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('initialize'), ...common, goal: z.string().trim().min(1).max(4000), experience: z.string().trim().min(1).max(2000), weeklyHours: z.number().int().min(1).max(80), sessionId: z.string().trim().min(1).max(200), learningPreferences }).strict(),
  z.object({ action: z.literal('bind-session'), ...common, sessionId: z.string().trim().min(1).max(200) }).strict(),
  z.object({ action: z.literal('start-task'), ...common, taskId: z.string().trim().min(1).max(200) }).strict(),
  z.object({ action: z.literal('task-state'), ...common, taskId: z.string().trim().min(1).max(200), status: taskState }).strict(),
  z.object({ action: z.literal('evidence'), ...common, conceptId: z.string().trim().min(1).max(200), kind: z.enum(['explanation', 'pseudocode', 'implementation', 'hypothesis', 'assessment', 'reflection']), summary: z.string().trim().min(1).max(1000), sessionId: z.string().trim().min(1).max(200), messageRange: z.string().trim().min(1).max(200), confidence: z.number().finite().min(0).max(1) }).strict(),
  z.object({ action: z.literal('complete-task-with-evidence'), ...common, taskId: z.string().trim().min(1).max(200), conceptId: z.string().trim().min(1).max(200), kind: z.enum(['explanation', 'pseudocode', 'implementation', 'hypothesis', 'assessment', 'reflection']), summary: z.string().trim().min(1).max(1000), sessionId: z.string().trim().min(1).max(200), messageRange: z.string().trim().min(1).max(200), confidence: z.number().finite().min(0).max(1) }).strict(),
  z.object({ action: z.literal('adjustment'), ...common, impact: z.enum(['minor', 'major']), reason: z.string().trim().min(1).max(1000), diff: z.array(z.string().trim().min(1).max(500)).min(1).max(20), operations: z.array(operation).min(1).max(20) }).strict(),
  z.object({ action: z.literal('adjustment-decision'), ...common, adjustmentId: z.string().trim().min(1).max(200), decision: z.enum(['apply', 'reject', 'revert']) }).strict(),
  z.object({ action: z.literal('settings'), ...common, language: z.enum(['zh-CN', 'en']), weeklyHours: z.number().int().min(1).max(80), strictness: z.enum(['supportive', 'balanced', 'strict']), autoMinorAdjustments: z.boolean(), showModeExplanation: z.boolean(), antiDependency: z.boolean() }).strict(),
  z.object({ action: z.literal('discard-project'), ...common }).strict(),
  z.object({ action: z.literal('reset'), ...common }).strict(),
])

/** Same-origin, revision-fenced API handler. / 同源、版本栅栏保护的 API 处理器。 */
export function createLearnLoopHttpHandler(table: StateTable) {
  return async (req: IncomingMessage, res: ServerResponse): Promise<void> => {
    try {
      if (req.method === 'GET') { json(res, 200, snapshot(table.get('singleton') ?? emptyState())); return }
      if (req.method !== 'POST') { json(res, 405, { error: 'Only GET and POST are supported. / 仅支持 GET 和 POST。' }, { Allow: 'GET, POST' }); return }
      checkOrigin(req)
      if ((req.headers['content-type'] ?? '').split(';')[0]?.trim().toLowerCase() !== 'application/json' || req.headers['x-learnloop-mutation'] !== '1') throw new RequestError(415, 'A JSON LearnLoop mutation is required. / 必须提交 LearnLoop JSON 变更请求。')
      const parsed = mutationSchema.safeParse(await readBody(req)); if (!parsed.success) throw new RequestError(400, `Invalid mutation: ${z.prettifyError(parsed.error)} / 变更请求无效。`)
      const input = parsed.data
      const updated = await table.update('singleton', current => {
        // A retried mutation returns its committed projection even with its original revision. / 重试请求即使携带原 revision，也返回已提交投影。
        if (current.events.some(item => item.stableId === input.idempotencyKey)) return current
        if (current.revision !== input.revision) throw new RequestError(409, 'Learning state changed. Refresh and retry. / 学习状态已变化，请刷新后重试。')
        if (input.action === 'initialize') return initializeProject(current, input)
        if (input.action === 'bind-session') return bindProjectSession(current, input)
        if (input.action === 'start-task') return startTask(current, input)
        if (input.action === 'task-state') return setTaskState(current, input)
        if (input.action === 'evidence') return recordEvidence(current, { idempotencyKey: input.idempotencyKey, conceptId: input.conceptId, kind: input.kind, summary: input.summary, source: { sessionId: input.sessionId, messageRange: input.messageRange }, confidence: input.confidence })
        if (input.action === 'complete-task-with-evidence') return completeTaskWithEvidence(current, { idempotencyKey: input.idempotencyKey, taskId: input.taskId, conceptId: input.conceptId, kind: input.kind, summary: input.summary, source: { sessionId: input.sessionId, messageRange: input.messageRange }, confidence: input.confidence })
        if (input.action === 'adjustment') return proposeAdjustment(current, input)
        if (input.action === 'adjustment-decision') return decideAdjustment(current, input.adjustmentId, input.decision, input.idempotencyKey)
        if (input.action === 'settings') return updateSettings(current, { language: input.language, weeklyHours: input.weeklyHours, strictness: input.strictness, autoMinorAdjustments: input.autoMinorAdjustments, showModeExplanation: input.showModeExplanation, antiDependency: input.antiDependency }, input.idempotencyKey)
        if (input.action === 'discard-project') return discardCurrentProject(current, input.idempotencyKey)
        return resetState(current, input.idempotencyKey)
      })
      json(res, 200, snapshot(updated))
    } catch (error) {
      const status = error instanceof RequestError ? error.status : error instanceof Error && ['project', 'task', 'concept', 'adjustment'].some(prefix => error.message.startsWith(prefix)) ? 400 : 500
      json(res, status, { error: error instanceof RequestError ? error.message : status === 400 && error instanceof Error ? `${error.message} / 请求无法应用。` : 'LearnLoop could not apply this change. / LearnLoop 无法应用此变更。' })
    }
  }
}
