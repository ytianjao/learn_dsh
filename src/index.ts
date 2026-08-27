/** LearnLoop Host plugin: durable verified-answer state and same-origin API. */
import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-host-webserver'
import type {} from '@deepseek-ai/dsh-storage-domain'
import type {} from '@deepseek-ai/dsh-tools'
import type {} from '@deepseek-ai/dsh-system-prompt'
import type {} from '@deepseek-ai/dsh-workspace'
import { emptyState, ensureState, learnLoopDomainSpec } from './domain.js'
import { API_PATH, EXPORT_PATH, MANAGE_PATH, createLearnLoopHttpHandler } from './http.js'
import type { StateTable } from './types.js'
import { createLearnLoopApprovePlanTool, createLearnLoopBeginOnboardingTool, createLearnLoopCommitProfileTool, createLearnLoopConfirmProfileTool, createLearnLoopCreatePlanDraftTool, createLearnLoopRequestPlanRevisionTool } from './tool.js'
import { createLearnLoopAssessmentTool } from './assessment-tool.js'
import { renderLearnLoopSystemSection } from './prompt.js'
import { capturePreStepAnswer, enrichCandidateEvent, type AuthoritativeUserMessage } from './evidence-bridge.js'
import { resolveCanonicalWorkspace } from './workspace-identity.js'

export * from './workspace-identity.js'
export * from './domain.js'
export * from './http.js'
export * from './types.js'
export * from './tool.js'
export * from './prompt.js'
export * from './assessment-tool.js'
export * from './evidence-bridge.js'
export * from './workspace.js'
export * from './plan-intent.js'

export const name = 'learnloop'
export const inject = ['storageDomain', 'webServer', 'tools', 'systemPrompt', 'agents', 'sessions', 'workspaceRegistry']

export async function apply(ctx: Context): Promise<void> {
  const domain = await ctx.storageDomain.open(learnLoopDomainSpec)
  const table = domain.table('state') as StateTable
  await ensureState(table)
  const workspaceResolver = (sessionId: string, claim?: string) => resolveCanonicalWorkspace(ctx.workspaceRegistry, sessionId, claim)
  ctx.effect(() => ctx.systemPrompt.section({ name: 'learnloop-runtime', order: 50, text: context => renderLearnLoopSystemSection(table.get('singleton') ?? emptyState(), context.agent?.id) }), 'learnloop.systemPrompt()')
  ctx.effect(() => ctx.tools.register(createLearnLoopBeginOnboardingTool(table, workspaceResolver)), 'learnloop.beginOnboardingTool()')
  ctx.effect(() => ctx.tools.register(createLearnLoopCommitProfileTool(table, workspaceResolver)), 'learnloop.commitProfileTool()')
  ctx.effect(() => ctx.tools.register(createLearnLoopConfirmProfileTool(table, workspaceResolver)), 'learnloop.confirmProfileTool()')
  ctx.effect(() => ctx.tools.register(createLearnLoopCreatePlanDraftTool(table, workspaceResolver)), 'learnloop.createPlanDraftTool()')
  ctx.effect(() => ctx.tools.register(createLearnLoopRequestPlanRevisionTool(table, workspaceResolver)), 'learnloop.requestPlanRevisionTool()')
  ctx.effect(() => ctx.tools.register(createLearnLoopApprovePlanTool(table, workspaceResolver)), 'learnloop.approvePlanTool()')
  const sessionReader = {
    tailSeq: (id: string) => ctx.sessions.list().find(item => String(item.id) === id)?.seq ?? null,
    requestHeader: (id: string, callId: string) => {
      const session = ctx.sessions.list().find(item => String(item.id) === id)
      if (!session) return null
      const events = session.events as readonly any[]
      const calls = events.filter(event => event.type === 'tool/call' && String(event.data.callId) === callId)
      if (calls.length !== 1) return null
      const call = calls[0]!
      if (call.data.name !== 'learnloop_assess_answer') return null
      const assistants = events.filter(event => event.type === 'assistant/message' && event.data.turn === call.data.turn && event.data.step === call.data.step && event.data.message.content.some((block: any) => block.type === 'tool-call' && String(block.id) === callId))
      if (assistants.length !== 1) return null
      const start = events.find(event => event.type === 'step/start' && event.data.turn === call.data.turn && event.data.step === call.data.step)
      if (!start) return null
      const headerEvent = events.filter(event => event.type === 'request/header' && event.seq > start.seq && event.seq < assistants[0]!.seq).at(-1)
      if (!headerEvent || headerEvent.type !== 'request/header') return null
      return { provider: headerEvent.data.header.config.provider, model: headerEvent.data.header.config.model, seq: headerEvent.seq, assistantMessageEventSeq: assistants[0]!.seq, turn: call.data.turn, step: call.data.step }
    },
    userMessages: (id: string, messageIds: readonly string[]) => {
      const session = ctx.sessions.list().find(item => String(item.id) === id)
      if (!session) return null
      const wanted = new Set(messageIds)
      const found: AuthoritativeUserMessage[] = []
      for (const event of session.events) if (event.type === 'user/message' && event.data.source.kind === 'user' && wanted.has(String(event.data.id))) found.push({ seq: event.seq, message: event.data })
      return found
    },
  }
  ctx.effect(() => ctx.tools.register(createLearnLoopAssessmentTool(table, sessionReader)), 'learnloop.assessmentTool()')
  ctx.on('agent/pre-step', (payload, next) => capturePreStepAnswer(table, String(payload.agent.id), payload.signal, next))
  let eventWrites = Promise.resolve()
  ctx.on('session/event', (session, event) => {
    if (event.type !== 'user/message') return
    eventWrites = eventWrites.then(() => table.update('singleton', state => enrichCandidateEvent(state, String(session.id), event.data, event.seq))).then(() => undefined, error => { ctx.logger('learnloop').error(error, 'Failed to enrich candidate provenance') })
  })
  const handler = createLearnLoopHttpHandler(table, sessionReader, workspaceResolver)
  ctx.effect(() => ctx.webServer.register({ kind: 'exact', path: API_PATH, handler }), 'learnloop.stateRoute()')
  ctx.effect(() => ctx.webServer.register({ kind: 'exact', path: EXPORT_PATH, handler }), 'learnloop.exportRoute()')
  ctx.effect(() => ctx.webServer.register({ kind: 'exact', path: MANAGE_PATH, handler }), 'learnloop.manageRoute()')
  ctx.effect(() => async () => { await domain.close() }, 'learnloop.storage()')
}
