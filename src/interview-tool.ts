import {defineTool} from '@deepseek-ai/dsh-tools'
import type {Agent} from '@deepseek-ai/dsh-agent'
import {LearnLoopDomainError} from './domain.js'
import {probeDefinition,questionForProbe} from './interview-probes.js'
import {finalizeLearnLoopToolError} from './tool-protocol.js'
import type {LearnLoopSessionReader} from './dsh-session-adapter.js'
import type {StateTable} from './types.js'
import {activeProject,prepareProfileInterviewQuestion,recordProfileInterviewAnswer,releaseInvalidProfileQuestion,releaseProfileInterviewQuestion,workspaceForSession} from './workspace.js'

interface NativeQuestionService{ask(request:{questions:Array<{id:string;question:string;header?:string;options?:Array<{label:string;description?:string}>;multiSelect?:boolean}>;agent?:Agent;signal?:AbortSignal}):Promise<{answers:Array<{id:string;selected:string[];custom?:string}>}>}

export function createLearnLoopProfileQuestionTool(table:StateTable,userQuestions:NativeQuestionService,sessions:LearnLoopSessionReader){
 return defineTool({name:'learnloop_ask_profile_question',description:'Ask exactly the current LearnLoop Profile Probe. The Host owns the question, choices, identity, normalization, persistence, and progression; this tool accepts no arguments.',parameters:{},output:{schema:{type:'object',additionalProperties:false,properties:{status:{type:'string',required:true,enum:['answered','empty','fallback-to-chat','follow-up-required']},probeId:{type:'string',required:true},nextProbeId:{type:'string'}}},render:(_args,value)=>[{type:'text',text:JSON.stringify(value)}]},finalizeContent:finalizeLearnLoopToolError,async execute(_args,exec){
  if(!exec.agent)throw new LearnLoopDomainError('WORKSPACE_CONTEXT_MISSING','Tool execution has no DSH Session.')
  const sessionId=String(exec.agent.id),callId=String(exec.callId)
  let current=table.get('singleton')!
  const workspace=workspaceForSession(current,sessionId),prior=current.commandReceipts.find(item=>item.workspaceId===workspace.workspaceId&&item.idempotencyKey===`interview:${callId}`)?.result
  if(prior?.kind==='interview-answer-recorded')return{status:prior.status,probeId:prior.probeId,...prior.nextProbeId?{nextProbeId:prior.nextProbeId}:{}}
  current=await table.update('singleton',state=>prepareProfileInterviewQuestion(state,{sessionId,callId}))
  const project=activeProject(workspaceForSession(current,sessionId)),snapshot=project.profileInterview.activeQuestion
  if(!snapshot||snapshot.callId!==callId)throw new LearnLoopDomainError('INTERVIEW_TOPIC_MISMATCH','The Host question snapshot is no longer active.')
  const definition=probeDefinition(snapshot.probeId)
  let updated
  try{
   const response=await userQuestions.ask({questions:[{id:snapshot.questionId,question:questionForProbe(snapshot.probeId,project.profileInterview),header:'学习档案',...(snapshot.options.length?{options:snapshot.options.map(option=>({label:option.label}))}:{}),multiSelect:definition.inputMode==='multi-select'}],agent:exec.agent,signal:exec.signal})
   if(response.answers.length!==1)throw new LearnLoopDomainError('INTERVIEW_QUESTION_CONTRACT_INVALID','Native question service returned an invalid answer count.')
   const answer=response.answers[0]!
   const tail=sessions.tailSeq(sessionId)
   updated=await table.update('singleton',state=>recordProfileInterviewAnswer(state,{sessionId,callId,questionId:answer.id,selected:answer.selected,custom:answer.custom,...tail==null?{}:{fallbackAfterSeq:tail}}))
  }catch(error){
   const committed=table.get('singleton')?.commandReceipts.some(item=>item.workspaceId===workspace.workspaceId&&item.idempotencyKey===`interview:${callId}`&&item.result?.kind==='interview-answer-recorded')
   if(!committed)await table.update('singleton',state=>error instanceof LearnLoopDomainError&&['INTERVIEW_QUESTION_CONTRACT_INVALID','INTERVIEW_TOPIC_MISMATCH'].includes(error.code)?releaseInvalidProfileQuestion(state,{sessionId,callId}):releaseProfileInterviewQuestion(state,{sessionId,callId}))
   throw error
  }
  const result=updated.commandReceipts.find(item=>item.workspaceId===workspace.workspaceId&&item.idempotencyKey===`interview:${callId}`)?.result
  if(!result||result.kind!=='interview-answer-recorded')throw new LearnLoopDomainError('INTERVIEW_QUESTION_CONTRACT_INVALID','Canonical Interview receipt is missing.')
  return{status:result.status,probeId:result.probeId,...result.nextProbeId?{nextProbeId:result.nextProbeId}:{}}
 }})
}
