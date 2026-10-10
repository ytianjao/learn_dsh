import {defineTool} from '@deepseek-ai/dsh-tools'
import type {Agent} from '@deepseek-ai/dsh-agent'
import {LearnLoopDomainError,payloadHash} from './domain.js'
import {questionContract} from './interview-answer.js'
import {probeDefinition} from './interview-probes.js'
import {finalizeLearnLoopToolError} from './tool-protocol.js'
import type {LearnLoopSessionReader} from './dsh-session-adapter.js'
import type {CommandResult,LearnLoopState,StateTable} from './types.js'
import {activeProject,commandResultFor,prepareProfileInterviewQuestion,recordProfileInterviewAnswer,releaseProfileInterviewQuestion,resolveSessionWorkspace,workspaceForSession} from './workspace.js'

interface AskProfileQuestionArgs{questionToken:string;probeId?:unknown;question?:unknown;options?:unknown;assume?:unknown;followUp?:unknown;addProbes?:unknown}
interface NativeQuestionService{ask(request:{questions:Array<{id:string;question:string;detail?:string;header?:string;options?:Array<{label:string;description?:string}>;multiSelect?:boolean}>;agent?:Agent;signal?:AbortSignal}):Promise<{answers:Array<{id:string;selected:string[];custom?:string}>}>}
export const liveProfileQuestionCalls=new Set<string>()
export const INTERVIEW_QUESTION_TOOL_CONTRACT='learnloop-profile-question-v3'
/** Raw-argument fingerprint: the Host never rewrites model input before deciding what it means. */
export function interviewQuestionRequestFingerprint(args:Record<string,unknown>){return payloadHash({tool:'learnloop_ask_profile_question',contract:INTERVIEW_QUESTION_TOOL_CONTRACT,args})}
const releaseReason=(error:unknown)=>{const code=typeof error==='object'&&error!==null&&'code' in error?String(error.code):'';return code==='INTERVIEW_QUESTION_CONTRACT_INVALID'?'contract-invalid' as const:code==='ASK_ABORTED'?'ask-aborted' as const:code==='CALLER_NOT_LIVE'?'caller-not-live' as const:code==='DELEGATED_CALLER'?'delegated-caller' as const:code==='NO_PROVIDER'?'provider-unavailable' as const:'provider-error' as const}
const currentInterview=(state:LearnLoopState|undefined,sessionId:string)=>{if(!state)return null;const resolution=resolveSessionWorkspace(state,sessionId);if(resolution.kind!=='resolved'||!resolution.workspace.activeProjectId)return null;return resolution.workspace.projects[resolution.workspace.activeProjectId]?.profileInterview??null}

/** Tool result: the Host's step outcome plus the contract for the next question, so a model never has to guess. */
function stepResult(result:Extract<CommandResult,{kind:'interview-answer-recorded'}>,state:LearnLoopState,sessionId:string){
 const interview=currentInterview(state,sessionId),language=state.settings.language,current=interview?.pendingQuestion?.token===result.nextQuestionToken&&interview
 const fallback=result.status==='fallback-to-chat'&&interview?[...interview.optionSnapshots].reverse().find(snapshot=>snapshot.probeId===result.probeId)?.options.map(option=>option.label)??[]:[]
 const multi=probeDefinition(result.probeId).kind==='multi'
 return{status:result.status,probeId:result.probeId,...result.nextProbeId?{nextProbeId:result.nextProbeId}:{},...result.nextQuestionToken?{nextQuestionToken:result.nextQuestionToken}:{},...current?{nextQuestion:questionContract(current,language)}:{},enhancement:result.enhancement,...(result.status==='fallback-to-chat'?{prompt:language==='en'?`Ask the learner to reply in chat${fallback.length?` with ${multi?'one or more':'one'} of: ${fallback.join(' / ')}`:''}.`:`请让学习者直接在聊天中回复${fallback.length?`${multi?'（可多选，用顿号分隔）':''}：${fallback.join(' / ')}`:'。'}`,allowedReplies:fallback}:{})}
}

const labelItem={type:'object' as const,additionalProperties:true,properties:{code:{type:'string' as const},label:{type:'string' as const},description:{type:'string' as const}}}
export function createLearnLoopProfileQuestionTool(table:StateTable,userQuestions:NativeQuestionService,sessions:LearnLoopSessionReader){return defineTool({name:'learnloop_ask_profile_question',
 description:'Ask the current Host-owned Profile question. The Host defines a short baseline interview — every question, its options, and whether it is single- or multi-select; a call with only `questionToken` is always complete and valid. `addProbes` adds optional Host-defined questions (currentQuestion.optionalProbes, within addBudget) when what the learner said gives a reason, e.g. an exam date makes time-budget.deadline worth asking; they are asked next. Other optional enhancements, each validated and dropped (and reported under `enhancement.rejected`) when unusable: `question` rewords it for the learner; `options` relabels existing Host codes for the subject (never invent, drop, or reorder codes; multi-select Probes accept up to 3 extra labels per Probe that reuse an existing code); `assume` records an assumption instead of asking, only when currentQuestion.inferable and the learner already made it clear — it is shown to the learner for confirmation; `followUp` asks one extra question about the previous answer before this Probe, only when currentQuestion.followUp.allowed. Precedence: followUp, then assume, then ask. Echo `probeId` to bind the enhancements to the Probe you wrote them for.',
 parameters:{
  questionToken:{type:'string' as const,required:true as const,description:'Copy currentQuestion.token (or the previous result\'s nextQuestionToken).'},
  probeId:{type:'string' as const,description:'The Probe these enhancements were written for; on mismatch they are ignored.'},
  question:{type:'string' as const,description:'Optional rewording in the learner\'s language, referring to what they actually said.'},
  options:{type:'array' as const,items:labelItem,description:'Optional subject-specific labels for existing Host codes: [{code,label,description?}].'},
  assume:{type:'object' as const,additionalProperties:true,description:'Optional assumption instead of asking: {codes, reason} or {date, reason} for a deadline.',properties:{codes:{type:'array' as const,items:{type:'string' as const}},date:{type:'string' as const},reason:{type:'string' as const}}},
  addProbes:{type:'array' as const,items:{type:'string' as const},description:'Optional Host-defined Probes to ask next, from currentQuestion.optionalProbes.'},
  followUp:{type:'object' as const,additionalProperties:true,description:'Optional follow-up about the previous answer: {question, options?:[{label,description?}], multiSelect?}.',properties:{question:{type:'string' as const},multiSelect:{type:'boolean' as const},options:{type:'array' as const,items:{type:'object' as const,additionalProperties:true,properties:{label:{type:'string' as const},description:{type:'string' as const}}}}}},
 },
 output:{schema:{type:'object',additionalProperties:false,properties:{status:{type:'string',required:true,enum:['next-question-ready','follow-up-recorded','clarification-required','retry-native-question','fallback-to-chat','profile-review']},probeId:{type:'string',required:true},nextProbeId:{type:'string'},nextQuestionToken:{type:'string'},nextQuestion:{type:'json'},enhancement:{type:'json'},prompt:{type:'string'},allowedReplies:{type:'array',items:{type:'string'}}}},render:(_args,value)=>[{type:'text',text:JSON.stringify(value)}]},
 // Schema-level mistakes recover on their own: the error carries the token to retry with.
 finalizeContent:(exec,result)=>{const token=result.isError&&result.error.info?.code==='INVALID_ARGS'&&exec.agent?currentInterview(table.get('singleton'),String(exec.agent.id))?.pendingQuestion?.token:undefined;return finalizeLearnLoopToolError(exec,result,token?{retryWith:{questionToken:token}}:undefined)},
 async execute(rawArgs,exec){const args=rawArgs as unknown as AskProfileQuestionArgs
 if(!exec.agent)throw new LearnLoopDomainError('WORKSPACE_CONTEXT_MISSING','Tool execution has no DSH Session.')
 const sessionId=String(exec.agent.id),callId=String(exec.callId),workspace=workspaceForSession(table.get('singleton')!,sessionId)
 const requestFingerprint=interviewQuestionRequestFingerprint(args as unknown as Record<string,unknown>)
 const prior=commandResultFor(table.get('singleton')!,workspace.workspaceId,`interview:${callId}`,'interview-answer-recorded')
 if(prior){if(prior.requestFingerprint!==requestFingerprint)throw new LearnLoopDomainError('IDEMPOTENCY_KEY_REUSED','The Interview callId was reused with different request semantics.');return stepResult(prior,table.get('singleton')!,sessionId)}
 const released=commandResultFor(table.get('singleton')!,workspace.workspaceId,`interview-release:${callId}`,'interview-question-released');if(released)throw new LearnLoopDomainError('INTERVIEW_QUESTION_RELEASED','This Profile question call already reached its released terminal state.')
 const projectBefore=activeProject(workspace),liveKey=`${workspace.workspaceId}:${projectBefore.id}:${callId}`;liveProfileQuestionCalls.add(liveKey)
 try{let current
  try{current=await table.update('singleton',state=>prepareProfileInterviewQuestion(state,{sessionId,callId,questionToken:args.questionToken,requestFingerprint,enhancement:{probeId:args.probeId,question:args.question,options:args.options,assume:args.assume,followUp:args.followUp,addProbes:args.addProbes}}))}catch(error){if(error instanceof LearnLoopDomainError)throw error;throw new LearnLoopDomainError('INVALID_ARGS','The Profile question request is structurally invalid.')}
  // An accepted assumption settles the Probe without asking the learner.
  const assumed=commandResultFor(current,workspace.workspaceId,`interview:${callId}`,'interview-answer-recorded');if(assumed)return stepResult(assumed,current,sessionId)
  const snapshot=activeProject(workspaceForSession(current,sessionId)).profileInterview.activeQuestion;if(!snapshot||snapshot.callId!==callId)throw new LearnLoopDomainError('INTERVIEW_QUESTION_STALE','The Profile question token is no longer current.')
  let updated
  try{const response=await userQuestions.ask({questions:[{id:snapshot.questionId,question:snapshot.question,header:snapshot.header,...snapshot.detail?{detail:snapshot.detail}:{},...(snapshot.options.length?{options:snapshot.options.map(option=>({label:option.label,...option.description?{description:option.description}:{}}))}:{}),multiSelect:snapshot.multiSelect}],agent:exec.agent,signal:exec.signal});if(response.answers.length!==1)throw new LearnLoopDomainError('INTERVIEW_QUESTION_CONTRACT_INVALID','Native question service returned an invalid answer count.');const answer=response.answers[0]!,tail=sessions.tailSeq(sessionId);updated=await table.update('singleton',state=>recordProfileInterviewAnswer(state,{sessionId,callId,questionId:answer.id,selected:answer.selected,custom:answer.custom,...tail==null?{}:{fallbackAfterSeq:tail}}))}catch(error){const committed=table.get('singleton')?.commandReceipts.some(r=>r.workspaceId===workspace.workspaceId&&r.idempotencyKey===`interview:${callId}`&&r.result?.kind==='interview-answer-recorded');if(!committed)await table.update('singleton',state=>releaseProfileInterviewQuestion(state,{sessionId,callId,reason:releaseReason(error)}));throw error}
  const result=commandResultFor(updated,workspace.workspaceId,`interview:${callId}`,'interview-answer-recorded');if(!result)throw new LearnLoopDomainError('INTERVIEW_QUESTION_CONTRACT_INVALID','Canonical Interview receipt is missing.')
  return stepResult(result,updated,sessionId)
 }finally{liveProfileQuestionCalls.delete(liveKey)}}})}
