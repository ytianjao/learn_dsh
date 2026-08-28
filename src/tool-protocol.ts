import type {ContentBlock} from '@deepseek-ai/dsh-llm'
import type {ToolExecution,ToolExecutionResult} from '@deepseek-ai/dsh-tools'
import type {LearningProject,LearnLoopErrorCode} from './types.js'

export const LEARNLOOP_TOOL_ERROR_MARKER='LEARNLOOP_TOOL_ERROR_V1'
export type LearnLoopToolName='learnloop_commit_profile'|'learnloop_confirm_profile'|'learnloop_create_plan_draft'|'learnloop_request_plan_revision'|'learnloop_approve_plan'|'learnloop_assess_answer'
export function allowedLearnLoopToolsForPhase(project:LearningProject|null):readonly LearnLoopToolName[]{
 if(!project)return[]
 if(project.phase==='interviewing')return['learnloop_commit_profile']
 if(project.phase==='profile_review')return['learnloop_commit_profile','learnloop_confirm_profile']
 if(project.phase==='planning')return['learnloop_create_plan_draft']
 if(project.phase==='plan_review')return['learnloop_request_plan_revision','learnloop_approve_plan']
 if(project.phase==='active'&&project.execution?.phase==='verifying')return['learnloop_assess_answer']
 return[]
}
interface SafeToolError{code:string;retryable:boolean;message:string;[key:string]:unknown}
export const encodeToolError=(error:SafeToolError)=>`${LEARNLOOP_TOOL_ERROR_MARKER}\n<learnloop-tool-error-json>\n${JSON.stringify(error)}\n</learnloop-tool-error-json>`
export function finalizeLearnLoopToolError(_exec:Readonly<ToolExecution>,result:Readonly<ToolExecutionResult>):ContentBlock[]|undefined{
 if(!result.isError)return undefined
 const code=result.error.info?.code??'UNKNOWN';let payload:SafeToolError={code,retryable:code==='INVALID_ARGS',message:result.error.message,maxRetries:code==='INVALID_ARGS'?1:0}
 const tagged=result.error.message.match(/LEARNLOOP_SAFE_ERROR:(\{.*\})$/s);if(tagged)try{payload=JSON.parse(tagged[1]!) as SafeToolError}catch{/* use generic safe payload */}
 return[{type:'text',text:encodeToolError(payload)}]
}
export function invalidPhase(toolName:string,project:LearningProject,allowedPhases:readonly string[]){return{code:'INVALID_PROJECT_PHASE' as LearnLoopErrorCode,retryable:false,message:'This tool is not allowed in the current LearnLoop phase.',currentPhase:project.execution?.phase??project.phase,allowedPhases,toolName,nextAction:'Use only the allowed LearnLoop tools listed in the current system policy.'}}
