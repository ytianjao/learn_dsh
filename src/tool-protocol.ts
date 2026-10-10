import type {ContentBlock} from '@deepseek-ai/dsh-llm'
import type {ToolExecution,ToolExecutionResult} from '@deepseek-ai/dsh-tools'
import type {LearningProject} from './types.js'

export const LEARNLOOP_TOOL_ERROR_MARKER='LEARNLOOP_TOOL_ERROR_V2'
/** Marker the domain error constructor uses before its serialized safe payload. */
export const LEARNLOOP_SAFE_ERROR_MARKER='LEARNLOOP_SAFE_ERROR:'
export type RecoveryKind='correct-and-retry'|'ask-follow-up'|'fallback-to-chat'|'refresh-state'|'wait-for-user'|'do-not-retry'
export interface LearnLoopToolErrorEnvelope{version:2;code:string;category:'pre-execution'|'domain'|'conflict'|'infrastructure';message:string;recovery:{kind:RecoveryKind;maxAttempts:number};details?:Record<string,unknown>}
export type LearnLoopToolName='learnloop_ask_profile_question'|'learnloop_create_plan_draft'|'learnloop_assess_answer'|'learnloop_write_lesson_document'|'learnloop_propose_plan_adjustment'
export const LEARNLOOP_TOOL_NAMES:readonly LearnLoopToolName[]=['learnloop_ask_profile_question','learnloop_create_plan_draft','learnloop_assess_answer','learnloop_write_lesson_document','learnloop_propose_plan_adjustment']
export interface LearnLoopToolContract{visibleProjectPhases:readonly string[];visibleExecutionPhases?:readonly string[];executableProjectPhases:readonly string[];executableExecutionPhases?:readonly string[]}
export const LEARNLOOP_TOOL_CONTRACTS:Readonly<Record<LearnLoopToolName,LearnLoopToolContract>>={
 learnloop_ask_profile_question:{visibleProjectPhases:['interviewing'],executableProjectPhases:['interviewing']},
 learnloop_create_plan_draft:{visibleProjectPhases:['planning'],executableProjectPhases:['planning']},
 learnloop_assess_answer:{visibleProjectPhases:['active'],visibleExecutionPhases:['awaiting-answer','verifying'],executableProjectPhases:['active'],executableExecutionPhases:['verifying']},
 learnloop_write_lesson_document:{visibleProjectPhases:['active','completed'],executableProjectPhases:['active','completed']},
 learnloop_propose_plan_adjustment:{visibleProjectPhases:['active'],executableProjectPhases:['active']}}
const contractAllows=(contract:LearnLoopToolContract,project:LearningProject,mode:'visible'|'executable')=>{const projects=mode==='visible'?contract.visibleProjectPhases:contract.executableProjectPhases,executions=mode==='visible'?contract.visibleExecutionPhases:contract.executableExecutionPhases;return projects.includes(project.phase)&&(!executions||executions.includes(project.execution?.phase??''))}
export const toolAllowed=(name:LearnLoopToolName,project:LearningProject,mode:'visible'|'executable')=>contractAllows(LEARNLOOP_TOOL_CONTRACTS[name],project,mode)&&(name!=='learnloop_write_lesson_document'||Boolean(project.content.activeGenerationJobId))
export const executablePhasesForTool=(name:LearnLoopToolName)=>LEARNLOOP_TOOL_CONTRACTS[name].executableExecutionPhases??LEARNLOOP_TOOL_CONTRACTS[name].executableProjectPhases
export interface AgentToolPolicy{allowedLearnLoopTools:readonly LearnLoopToolName[];allowNativeQuestion:boolean}
export function deriveAgentToolPolicy(project:LearningProject|null):AgentToolPolicy{if(!project)return{allowedLearnLoopTools:[],allowNativeQuestion:false};return{allowedLearnLoopTools:LEARNLOOP_TOOL_NAMES.filter(name=>toolAllowed(name,project,'visible')&&(name!=='learnloop_ask_profile_question'||Boolean(project.profileInterview.pendingQuestion&&!project.profileInterview.awaitingChatProbeId&&!project.profileInterview.activeQuestion))),allowNativeQuestion:false}}
export const allowedLearnLoopToolsForPhase=(project:LearningProject|null)=>deriveAgentToolPolicy(project).allowedLearnLoopTools
const RETRYABLE_DOMAIN_CODES=['ASSESSMENT_INVALID','INVALID_PLAN','CANDIDATE_NOT_READY','CANDIDATE_SOURCE_MISSING','EVIDENCE_MISMATCH','EMPTY_PROFILE_PATCH','PLAN_APPROVAL_MISMATCH','INVALID_ARGS']
const STATE_CODES=['INTERVIEW_QUESTION_STALE','INTERVIEW_TOPIC_MISMATCH','INTERVIEW_QUESTION_RELEASED','INTERVIEW_QUESTION_CONTRACT_INVALID','INTERVIEW_BATCH_NOT_ALLOWED','REVISION_CONFLICT','INVALID_PROJECT_PHASE','TASK_LOCKED','INVALID_TASK_TRANSITION','CHECK_NOT_ARMED','CHECK_ALREADY_ARMED','PROJECT_NOT_FOUND','TASK_NOT_FOUND','CANDIDATE_NOT_FOUND','WORKSPACE_NOT_FOUND']
const INFRASTRUCTURE_CODES=['CALLER_NOT_LIVE','DELEGATED_CALLER','NO_PROVIDER','INTERNAL_ERROR']
type ToolErrorPolicy=Pick<LearnLoopToolErrorEnvelope,'category'|'recovery'>
const directive=(code:string):ToolErrorPolicy=>{const candidates:Array<ToolErrorPolicy|null>=[
 // The model can repair its own arguments and rubric coverage in one more attempt.
 RETRYABLE_DOMAIN_CODES.includes(code)?{category:'domain',recovery:{kind:'correct-and-retry',maxAttempts:1}}:null,
 // Content safety violations are repairable once with the offending part removed.
 ['CONTENT_REFERENCE_UNVERIFIED','CONTENT_PRIVACY_VIOLATION','CONTENT_MARKDOWN_INVALID'].includes(code)?{category:'domain',recovery:{kind:'correct-and-retry',maxAttempts:1}}:null,
 code==='ASK_ABORTED'?{category:'domain',recovery:{kind:'wait-for-user',maxAttempts:0}}:null,
 // Host state moved underneath the call: re-read the assembled state, do not repeat verbatim.
 STATE_CODES.includes(code)?{category:'conflict',recovery:{kind:'refresh-state',maxAttempts:0}}:null,
 INFRASTRUCTURE_CODES.includes(code)?{category:'infrastructure',recovery:{kind:'do-not-retry',maxAttempts:0}}:null,
 ];return candidates.find((candidate):candidate is ToolErrorPolicy=>candidate!==null)??{category:'domain',recovery:{kind:'do-not-retry',maxAttempts:0}}}
export const encodeToolError=(error:Omit<LearnLoopToolErrorEnvelope,'version'>)=>`${LEARNLOOP_TOOL_ERROR_MARKER}\n<learnloop-tool-error-json>\n${JSON.stringify({version:2,...error})}\n</learnloop-tool-error-json>`
/**
 * Recover the Host-authored details a `LearnLoopDomainError` serialized into its message, so the
 * model can act on them (for example `allowedPhases`, `missingTopics`, `failedCriteria`). The
 * payload is written by the error constructor and never contains credentials or learner text.
 */
export function domainErrorDetails(message:string|undefined):Record<string,unknown>|undefined{
 if(!message)return undefined
 const payload=message.split(`${LEARNLOOP_SAFE_ERROR_MARKER}`)[1]
 if(!payload)return undefined
 try{const parsed=JSON.parse(payload.trim()) as Record<string,unknown>;if(!parsed||typeof parsed!=='object')return undefined;const {code:_c,retryable:_r,message:_m,...details}=parsed;return Object.keys(details).length?details:undefined}catch{return undefined}
}
export function finalizeLearnLoopToolError(_exec:Readonly<ToolExecution>,result:Readonly<ToolExecutionResult>,extraDetails?:Record<string,unknown>):ContentBlock[]|undefined{if(!result.isError)return undefined;const code=result.error.info?.code??'INTERNAL_ERROR',base=directive(code),parsed=domainErrorDetails(result.error.message),details=parsed||extraDetails?{...parsed,...extraDetails}:undefined;return[{type:'text',text:encodeToolError({code,...base,...(details?{details}:{}),message:code==='INTERVIEW_QUESTION_STALE'?'The Profile question token is no longer current.':code==='INVALID_ARGS'||code==='INTERVIEW_QUESTION_CONTRACT_INVALID'?'The Profile question request is structurally invalid.':code==='ASK_ABORTED'?'The learner dismissed or cancelled the question.':['CALLER_NOT_LIVE','NO_PROVIDER'].includes(code)?'The Profile question provider is unavailable.':'LearnLoop could not complete this operation.'})}]}
