import type {ContentBlock} from '@deepseek-ai/dsh-llm'
import type {ToolExecution,ToolExecutionResult} from '@deepseek-ai/dsh-tools'
import type {LearningProject,LearnLoopErrorCode} from './types.js'

export const LEARNLOOP_TOOL_ERROR_MARKER='LEARNLOOP_TOOL_ERROR_V1'
export type LearnLoopToolName='learnloop_commit_profile'|'learnloop_confirm_profile'|'learnloop_revise_profile_preferences'|'learnloop_create_plan_draft'|'learnloop_request_plan_revision'|'learnloop_approve_plan'|'learnloop_assess_answer'
export const LEARNLOOP_TOOL_NAMES:readonly LearnLoopToolName[]=['learnloop_commit_profile','learnloop_confirm_profile','learnloop_revise_profile_preferences','learnloop_create_plan_draft','learnloop_request_plan_revision','learnloop_approve_plan','learnloop_assess_answer']
export interface AgentToolPolicy{allowedLearnLoopTools:readonly LearnLoopToolName[];allowNativeQuestion:boolean}
export function deriveAgentToolPolicy(project:LearningProject|null):AgentToolPolicy{
 if(!project)return{allowedLearnLoopTools:[],allowNativeQuestion:true}
 if(project.phase==='interviewing')return{allowedLearnLoopTools:['learnloop_commit_profile'],allowNativeQuestion:true}
 if(project.phase==='profile_review')return{allowedLearnLoopTools:['learnloop_commit_profile','learnloop_confirm_profile','learnloop_revise_profile_preferences'],allowNativeQuestion:true}
 if(project.phase==='planning')return{allowedLearnLoopTools:['learnloop_create_plan_draft','learnloop_revise_profile_preferences'],allowNativeQuestion:false}
 if(project.phase==='plan_review')return{allowedLearnLoopTools:['learnloop_request_plan_revision','learnloop_revise_profile_preferences','learnloop_approve_plan'],allowNativeQuestion:true}
 if(project.phase==='active'&&['awaiting-answer','verifying'].includes(project.execution?.phase??''))return{allowedLearnLoopTools:['learnloop_assess_answer'],allowNativeQuestion:false}
 return{allowedLearnLoopTools:[],allowNativeQuestion:false}
}
export const allowedLearnLoopToolsForPhase=(project:LearningProject|null)=>deriveAgentToolPolicy(project).allowedLearnLoopTools
interface SafeToolError{code:string;retryable:boolean;message:string;[key:string]:unknown}
export const encodeToolError=(error:SafeToolError)=>`${LEARNLOOP_TOOL_ERROR_MARKER}\n<learnloop-tool-error-json>\n${JSON.stringify(error)}\n</learnloop-tool-error-json>`
export function finalizeLearnLoopToolError(_exec:Readonly<ToolExecution>,result:Readonly<ToolExecutionResult>):ContentBlock[]|undefined{
 if(!result.isError)return undefined
 const code=result.error.info?.code??'INTERNAL_ERROR';let payload:SafeToolError={code,retryable:code==='INVALID_ARGS',message:code==='INVALID_ARGS'?'The tool arguments are invalid.':'LearnLoop could not complete this operation.',maxRetries:code==='INVALID_ARGS'?1:0}
 const tagged=result.error.message.match(/LEARNLOOP_SAFE_ERROR:(\{.*\})$/s);if(tagged)try{const details=JSON.parse(tagged[1]!) as Record<string,unknown>;payload={...details,code,retryable:code==='INVALID_ARGS',message:typeof details.message==='string'?details.message:payload.message}}catch{/* use generic safe payload */}
 return[{type:'text',text:encodeToolError(payload)}]
}
export function invalidPhase(toolName:string,project:LearningProject,allowedPhases:readonly string[]){return{code:'INVALID_PROJECT_PHASE' as LearnLoopErrorCode,retryable:false,message:'This tool is not allowed in the current LearnLoop phase.',currentPhase:project.execution?.phase??project.phase,allowedPhases,toolName,nextAction:'Use only the allowed LearnLoop tools listed in the current system policy.'}}
