/** LearnLoop Host plugin: durable verified-answer state and same-origin API. */
import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-host-webserver'
import type {} from '@deepseek-ai/dsh-storage-domain'
import type {} from '@deepseek-ai/dsh-tools'
import type {} from '@deepseek-ai/dsh-system-prompt'
import type {} from '@deepseek-ai/dsh-workspace'
import type {} from '@deepseek-ai/dsh-user-questions'
import { emptyState, ensureState, learnLoopDomainSpec } from './domain.js'
import { API_PATH, EXPORT_PATH, MANAGE_PATH, createLearnLoopHttpHandler } from './http.js'
import type { StateTable } from './types.js'
import { createLearnLoopCreatePlanDraftTool } from './tool.js'
import {LearnLoopToolRestrictions} from './tool-restriction.js'
import { createLearnLoopAssessmentTool } from './assessment-tool.js'
import { renderLearnLoopSystemSection, sessionIdFromAssembleContext } from './prompt.js'
import { capturePreStepAnswer, enrichCandidateEvent } from './evidence-bridge.js'
import {consumeProfileFallbackMessage} from './workspace.js'
import { resolveCanonicalWorkspace } from './workspace-identity.js'
import {createDshSessionReader} from './dsh-session-adapter.js'
import {createLearnLoopProfileQuestionTool} from './interview-tool.js'

export * from './workspace-identity.js'
export * from './domain.js'
export * from './http.js'
export * from './types.js'
export * from './tool.js'
export * from './tool-protocol.js'
export * from './prompt.js'
export * from './assessment-tool.js'
export * from './evidence-bridge.js'
export * from './workspace.js'
export * from './plan-intent.js'
export * from './dsh-session-adapter.js'
export * from './interview-probes.js'
export * from './profile-compiler.js'
export * from './interview-tool.js'

export const name = 'learnloop'
export const inject = ['storageDomain', 'webServer', 'tools', 'systemPrompt', 'agents', 'sessions', 'workspaceRegistry', 'userQuestions']

export async function apply(ctx: Context): Promise<void> {
  const domain = await ctx.storageDomain.open(learnLoopDomainSpec)
  const table = domain.table('state') as StateTable
  await ensureState(table)
  const workspaceResolver = (sessionId: string, claim?: string) => resolveCanonicalWorkspace(ctx.workspaceRegistry, sessionId, claim)
  ctx.effect(() => ctx.systemPrompt.section({ name: 'learnloop-runtime', order: 50, text: context => {
    const sessionId=sessionIdFromAssembleContext(context)
    if(!sessionId)ctx.logger('learnloop').debug({code:'PROMPT_AGENT_CONTEXT_MISSING'},'Runtime prompt omitted: agent context missing')
    return renderLearnLoopSystemSection(table.get('singleton') ?? emptyState(),sessionId)
  } }), 'learnloop.systemPrompt()')
  ctx.effect(() => ctx.tools.register(createLearnLoopCreatePlanDraftTool(table, workspaceResolver)), 'learnloop.createPlanDraftTool()')
  const sessionReader=createDshSessionReader(ctx.sessions)
  ctx.effect(() => ctx.tools.register(createLearnLoopProfileQuestionTool(table,ctx.userQuestions,sessionReader)), 'learnloop.profileQuestionTool()')
  ctx.effect(() => ctx.tools.register(createLearnLoopAssessmentTool(table, sessionReader)), 'learnloop.assessmentTool()')
  let eventWrites = Promise.resolve()
  ctx.on('agent/pre-step', async (payload, next) => {await eventWrites;return capturePreStepAnswer(table, String(payload.agent.id), payload.signal, next)})
  ctx.on('session/event', (session, event) => {
    if (event.type !== 'user/message') return
    eventWrites = eventWrites.then(() => table.update('singleton', state => {const enriched=enrichCandidateEvent(state,String(session.id),event.data,event.seq);if(event.data.source.kind!=='user')return enriched;const text=event.data.content.filter(block=>block.type==='text').map(block=>block.text).join('\n').trim();return consumeProfileFallbackMessage(enriched,{sessionId:String(session.id),messageId:String(event.data.id),eventSeq:event.seq,text})})).then(state=>{sync(state,[String(session.id)])},error => { ctx.logger('learnloop').error(error, 'Failed to consume user message provenance') })
  })
  const restrictions=new LearnLoopToolRestrictions()
  let syncing=false,scheduled=false
  const sync=(state=table.get('singleton')??emptyState(),sessionIds?:readonly string[])=>{syncing=true;try{for(const agent of ctx.agents.list())if(!sessionIds||sessionIds.includes(String(agent.id)))restrictions.sync(agent,state)}finally{syncing=false}}
  const scheduleSync=()=>{if(syncing||scheduled)return;scheduled=true;queueMicrotask(()=>{scheduled=false;sync()})}
  ctx.on('tools/change',scheduleSync)
  ctx.on('agent/created',({agent})=>restrictions.sync(agent,table.get('singleton')??emptyState()))
  ctx.on('agent/session-start',({agent})=>restrictions.sync(agent,table.get('singleton')??emptyState()))
  ctx.on('agent/disposed',({agent})=>restrictions.dispose(String(agent.id)))
  ctx.on('tools/result',(exec)=>{if(exec.agent&&exec.name.startsWith('learnloop_'))restrictions.sync(exec.agent,table.get('singleton')??emptyState())})
  sync()
  ctx.effect(()=>()=>restrictions.disposeAll(),'learnloop.toolRestrictions()')
  const handler = createLearnLoopHttpHandler(table, sessionReader, workspaceResolver,(state,sessions)=>sync(state,sessions))
  ctx.effect(() => ctx.webServer.register({ kind: 'exact', path: API_PATH, handler }), 'learnloop.stateRoute()')
  ctx.effect(() => ctx.webServer.register({ kind: 'exact', path: EXPORT_PATH, handler }), 'learnloop.exportRoute()')
  ctx.effect(() => ctx.webServer.register({ kind: 'exact', path: MANAGE_PATH, handler }), 'learnloop.manageRoute()')
  ctx.effect(() => async () => { await domain.close() }, 'learnloop.storage()')
}
