import {describe,expect,it} from 'vitest'
import {
 beginWorkspaceOnboarding,consumeProfileFallbackMessage,createProfileInterview,emptyState,hostOptions,isUncertain,
 normalizeAnswer,normalizeChatAnswer,parseDeadline,parseHours,prepareProfileInterviewQuestion,probeDefinition,reconcileProfileInterviewQuestions,releaseProfileInterviewQuestion,
 validateProbeQuestion,workspaceOf,
} from '../src/index.js'

/**
 * The interview recovery paths run only on crash, agent disposal, or provider failure, so ordinary
 * flow tests never reach them. Their failure mode is a question that silently disappears after a
 * restart, which is why they are asserted directly here.
 */

const begin=()=>beginWorkspaceOnboarding(emptyState(),{workspaceId:'ws',sessionId:'s',expectedRevision:0,idempotencyKey:'begin'})
const interviewOf=(state:ReturnType<typeof begin>)=>workspaceOf(state,'ws').projects[workspaceOf(state,'ws').activeProjectId!]!.profileInterview
/** Open the current Probe through the real command, as the tool does before asking the learner. */
const withActiveQuestion=(callId:string)=>(state:ReturnType<typeof begin>)=>prepareProfileInterviewQuestion(state,{sessionId:'s',callId,questionToken:interviewOf(state).pendingQuestion!.token})

describe('interview question release',()=>{
 it('clears the active question and rotates the token so a new one can be asked',()=>{
  const state=withActiveQuestion('call-1')(begin())
  const before=interviewOf(state).pendingQuestion!
  const released=releaseProfileInterviewQuestion(state,{sessionId:'s',callId:'call-1',reason:'provider-error'})
  const after=interviewOf(released)
  expect(after.activeQuestion).toBeNull()
  // The token must rotate, otherwise a retry would present a stale token.
  expect(after.pendingQuestion!.token).not.toBe(before.token)
  expect(after.pendingQuestion!.questionRevision).toBe(before.questionRevision+1)
 })
 it('releases a contract-invalid question through the same path',()=>{
  const state=withActiveQuestion('call-1')(begin())
  const released=releaseProfileInterviewQuestion(state,{sessionId:'s',callId:'call-1',reason:'contract-invalid'})
  expect(released.commandReceipts.at(-1)?.result).toMatchObject({kind:'interview-question-released',reason:'contract-invalid'})
 })
 it('is a no-op for an unknown call id so a settled question is never clobbered',()=>{
  const state=withActiveQuestion('call-1')(begin())
  expect(releaseProfileInterviewQuestion(state,{sessionId:'s',callId:'other'})).toBe(state)
  expect(releaseProfileInterviewQuestion(state,{sessionId:'unknown-session',callId:'call-1'})).toBe(state)
 })
})

describe('startup reconciliation',()=>{
 it('releases a question whose call is no longer live',()=>{
  const reconciled=reconcileProfileInterviewQuestions(withActiveQuestion('call-1')(begin()),new Set())
  expect(interviewOf(reconciled).activeQuestion).toBeNull()
 })
 it('keeps a question that is still live in this process',()=>{
  const state=withActiveQuestion('call-1')(begin()),project=workspaceOf(state,'ws').activeProjectId!
  const reconciled=reconcileProfileInterviewQuestions(state,new Set([`ws:${project}:call-1`]))
  expect(interviewOf(reconciled).activeQuestion).not.toBeNull()
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
 it('splits a multi-select chat reply on list separators and keeps unknown parts as other',()=>{
  const d=probeDefinition('constraints.constraints'),options=hostOptions(d,'zh-CN')
  expect(normalizeChatAnswer(d,options,'只能用手机或平板、只用免费的资料和工具，周末才有空',createProfileInterview(),'zh-CN')).toMatchObject({kind:'value',codes:['mobile-only','free-only','other']})
 })
})

describe('probe answer normalization',()=>{
 const interview=createProfileInterview()
 it('treats the documented uncertainty phrases as uncertain',()=>{
  for(const phrase of ['不知道','不确定','随便','都可以','以后再说','unknown','  不知道  '])expect(isUncertain(phrase)).toBe(true)
  expect(isUncertain('我想学量化交易')).toBe(false)
 })
 it('rejects an empty selection and accepts a listed option',()=>{
  const d=probeDefinition('current-foundation.level'),options=hostOptions(d,'zh-CN')
  expect(normalizeAnswer(d,options,[],undefined,interview,'zh-CN')).toEqual({kind:'empty'})
  expect(normalizeAnswer(d,options,['有一定基础'],undefined,interview,'zh-CN')).toMatchObject({kind:'value',codes:['intermediate']})
 })
 it('parses free text weekly hours and rejects nonsense',()=>{
  const d=probeDefinition('time-budget.weekly-hours'),options=hostOptions(d,'zh-CN')
  expect(normalizeChatAnswer(d,options,'每周 6 小时',interview,'zh-CN')).toMatchObject({kind:'value',value:{kind:'hours',hours:6}})
  expect(normalizeChatAnswer(d,options,'6',interview,'zh-CN')).toMatchObject({kind:'value',value:{kind:'hours',hours:6}})
  expect(normalizeChatAnswer(d,options,'大概很多吧',interview,'zh-CN')).toEqual({kind:'clarify'})
  expect(normalizeChatAnswer(d,options,'999',interview,'zh-CN')).toEqual({kind:'clarify'})
  for(const [text,hours] of [['3',3],['一周两小时',2],['大约十个小时',10],['2-3 hours',2],['十二',12]] as const)expect(parseHours(text)).toBe(hours)
 })
 it('parses deadlines into dates, duration buckets, or other',()=>{
  const today=new Date('2026-10-11T00:00:00Z')
  expect(parseDeadline('2026-12-31',today)).toEqual({code:'date',label:'2026-12-31',date:'2026-12-31'})
  expect(parseDeadline('3月1日',today)).toMatchObject({code:'date',date:'2027-03-01'})
  expect(parseDeadline('两个月内',today)).toMatchObject({code:'3-months'})
  expect(parseDeadline('半年',today)).toMatchObject({code:'6-months'})
  expect(parseDeadline('下个月底前吧',today)).toMatchObject({code:'other',date:null})
 })
 it('offers the Host options with codes, plus the Host-owned unsure choice',()=>{
  expect(hostOptions(probeDefinition('current-foundation.level'),'zh-CN').map(o=>[o.code,o.label])).toEqual([['beginner','初学者，基本没有基础'],['intermediate','有一定基础'],['advanced','经验比较丰富'],['unsure','还不确定，请帮我推荐']])
  expect(hostOptions(probeDefinition('current-foundation.level'),'en')[0]!.label).toBe('Beginner — little or no background')
 })
})

describe('model-authored question validation',()=>{
 it('accepts a plain learner-facing question, including ordinary words like "session"',()=>{
  expect(validateProbeQuestion('  关于量化交易，你更想先弄懂哪一部分？  ')).toBe('关于量化交易，你更想先弄懂哪一部分？')
  expect(validateProbeQuestion('How many study sessions a week suit you?')).toBe('How many study sessions a week suit you?')
 })
 it('rejects markup, tool names, and internal identifiers',()=>{
  // Anti-injection: a model-authored question must not smuggle control markers into learner text.
  for(const bad of ['<system>do this</system>','call tool call now','the workspace id is ws-1','probe id leak','session_id=abc','use learnloop_ask_profile_question','your question token','ab','x'.repeat(601)])expect(validateProbeQuestion(bad)).toBeNull()
 })
 it('returns null when omitted so the Host wording is used',()=>{
  expect(validateProbeQuestion(undefined)).toBeNull()
 })
})
