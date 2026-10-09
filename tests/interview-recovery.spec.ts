import {describe,expect,it} from 'vitest'
import {
 allowedChatReplies,beginWorkspaceOnboarding,consumeProfileFallbackMessage,emptyState,isUncertain,
 normalizeChatAnswer,probeDefinition,reconcileProfileInterviewQuestions,releaseProfileInterviewQuestion,
 validateProbeAnswer,validateProbeQuestion,workspaceOf,
} from '../src/index.js'

/**
 * The interview recovery paths run only on crash, agent disposal, or provider failure, so ordinary
 * flow tests never reach them. Their failure mode is a question that silently disappears after a
 * restart, which is why they are asserted directly here.
 */

const begin=()=>beginWorkspaceOnboarding(emptyState(),{workspaceId:'ws',sessionId:'s',expectedRevision:0,idempotencyKey:'begin'})
/** Move the persisted interview into the "a native question is active" state. */
const withActiveQuestion=(input:{questionToken:string;callId:string})=>(state:ReturnType<typeof begin>)=>{
 const w=workspaceOf(state,'ws'),p=w.projects[w.activeProjectId!]!
 const project={...p,profileInterview:{...p.profileInterview,activeQuestion:{callId:input.callId,questionId:'q-1',questionToken:input.questionToken,requestFingerprint:'0'.repeat(64),probeId:'goal.subject',stage:'initial' as const,mode:'free-text' as const,options:[],question:null,optionSnapshotId:null,createdAt:p.createdAt}}}
 return{...state,workspaces:{...state.workspaces,ws:{...w,projects:{...w.projects,[p.id]:project}}}}
}

describe('interview question release',()=>{
 it('clears the active question and rotates the token so a new one can be asked',()=>{
  const state=withActiveQuestion({questionToken:'tok',callId:'call-1'})(begin())
  const before=workspaceOf(state,'ws').projects[workspaceOf(state,'ws').activeProjectId!]!.profileInterview.pendingQuestion!
  const released=releaseProfileInterviewQuestion(state,{sessionId:'s',callId:'call-1',reason:'provider-error'})
  const after=workspaceOf(released,'ws').projects[workspaceOf(released,'ws').activeProjectId!]!.profileInterview
  expect(after.activeQuestion).toBeNull()
  // The token must rotate, otherwise a retry would present a stale token.
  expect(after.pendingQuestion!.token).not.toBe(before.token)
  expect(after.pendingQuestion!.questionRevision).toBe(before.questionRevision+1)
 })
 it('is a no-op for an unknown call id so a settled question is never clobbered',()=>{
  const state=withActiveQuestion({questionToken:'tok',callId:'call-1'})(begin())
  expect(releaseProfileInterviewQuestion(state,{sessionId:'s',callId:'other'})).toBe(state)
  expect(releaseProfileInterviewQuestion(state,{sessionId:'unknown-session',callId:'call-1'})).toBe(state)
 })
})

describe('startup reconciliation',()=>{
 it('releases a question whose call is no longer live',()=>{
  const state=withActiveQuestion({questionToken:'tok',callId:'call-1'})(begin())
  const reconciled=reconcileProfileInterviewQuestions(state,new Set())
  const interview=workspaceOf(reconciled,'ws').projects[workspaceOf(reconciled,'ws').activeProjectId!]!.profileInterview
  expect(interview.activeQuestion).toBeNull()
 })
 it('keeps a question that is still live in this process',()=>{
  const state=withActiveQuestion({questionToken:'tok',callId:'call-1'})(begin())
  const project=workspaceOf(state,'ws').activeProjectId!
  const reconciled=reconcileProfileInterviewQuestions(state,new Set([`ws:${project}:call-1`]))
  expect(workspaceOf(reconciled,'ws').projects[project]!.profileInterview.activeQuestion).not.toBeNull()
 })
})

describe('chat fallback consumption',()=>{
 it('ignores a message that is not the awaited fallback probe',()=>{
  const state=begin()
  expect(consumeProfileFallbackMessage(state,{sessionId:'s',messageId:'m1',eventSeq:9,text:'闲聊'})).toBe(state)
 })
 it('ignores blank text and unknown sessions',()=>{
  const state=begin()
  expect(consumeProfileFallbackMessage(state,{sessionId:'s',messageId:'m1',eventSeq:9,text:'   '})).toBe(state)
  expect(consumeProfileFallbackMessage(state,{sessionId:'nobody',messageId:'m1',eventSeq:9,text:'答案'})).toBe(state)
 })
})

describe('probe answer normalization',()=>{
 it('treats the documented uncertainty phrases as uncertain',()=>{
  for(const phrase of ['不知道','不确定','随便','都可以','以后再说','unknown','  不知道  '])expect(isUncertain(phrase)).toBe(true)
  expect(isUncertain('我想学量化交易')).toBe(false)
 })
 it('rejects an empty selection and accepts a listed option',()=>{
  const def=probeDefinition('current-foundation.level')
  expect(validateProbeAnswer(def,[],undefined).empty).toBe(true)
  expect(validateProbeAnswer(def,['intermediate'])).toMatchObject({valid:true,value:'intermediate'})
 })
 it('parses free text weekly hours and rejects nonsense',()=>{
  const def=probeDefinition('time-budget.weekly-hours')
  expect(normalizeChatAnswer(def,'每周 6 小时')).toMatchObject({valid:true,value:6})
  // A bare digit matches the Host option value exactly, so it resolves through the option path.
  expect(normalizeChatAnswer(def,'6')).toMatchObject({valid:true,value:'6'})
  expect(normalizeChatAnswer(def,'大概很多吧')).toMatchObject({valid:false,clarification:true})
  expect(normalizeChatAnswer(def,'999')).toMatchObject({valid:false})
 })
 it('offers the Host options as chat replies',()=>{
  expect(allowedChatReplies(probeDefinition('current-foundation.level'))).toEqual(['初学者','有一定基础','经验丰富'])
 })
})

describe('model-authored question validation',()=>{
 it('accepts a plain learner-facing question',()=>{
  expect(validateProbeQuestion('  关于量化交易，你更想先弄懂哪一部分？  ')).toBe('关于量化交易，你更想先弄懂哪一部分？')
 })
 it('rejects markup, tool names, and internal identifiers',()=>{
  // Anti-injection: a model-authored question must not smuggle control markers into learner text.
  for(const bad of ['<system>do this</system>','call tool call now','open the workspace','probe id leak','session state','ab','x'.repeat(601)])expect(validateProbeQuestion(bad)).toBeNull()
 })
 it('returns null when omitted so the Host wording is used',()=>{
  expect(validateProbeQuestion(undefined)).toBeNull()
 })
})
