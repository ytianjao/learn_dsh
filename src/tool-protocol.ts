import type {ContentBlock} from '@deepseek-ai/dsh-llm'
import type {ToolExecution,ToolExecutionResult} from '@deepseek-ai/dsh-tools'
import type {LearningProject,LearnLoopErrorCode} from './types.js'

export const LEARNLOOP_TOOL_ERROR_MARKER='LEARNLOOP_TOOL_ERROR_V1'
export type LearnLoopToolName='learnloop_commit_profile'|'learnloop_create_plan_draft'|'learnloop_assess_answer'
export const LEARNLOOP_TOOL_NAMES:readonly LearnLoopToolName[]=['learnloop_commit_profile','learnloop_create_plan_draft','learnloop_assess_answer']
export interface LearnLoopToolContract{visibleProjectPhases:readonly string[];visibleExecutionPhases?:readonly string[];executableProjectPhases:readonly string[];executableExecutionPhases?:readonly string[]}
export const LEARNLOOP_TOOL_CONTRACTS:Readonly<Record<LearnLoopToolName,LearnLoopToolContract>>={
 learnloop_commit_profile:{visibleProjectPhases:['interviewing'],executableProjectPhases:['interviewing']},
 learnloop_create_plan_draft:{visibleProjectPhases:['planning'],executableProjectPhases:['planning']},
 learnloop_assess_answer:{visibleProjectPhases:['active'],visibleExecutionPhases:['awaiting-answer','verifying'],executableProjectPhases:['active'],executableExecutionPhases:['verifying']}}
const contractAllows=(contract:LearnLoopToolContract,project:LearningProject,mode:'visible'|'executable')=>{const projects=mode==='visible'?contract.visibleProjectPhases:contract.executableProjectPhases,executions=mode==='visible'?contract.visibleExecutionPhases:contract.executableExecutionPhases;return projects.includes(project.phase)&&(!executions||executions.includes(project.execution?.phase??''))}
export const toolAllowed=(name:LearnLoopToolName,project:LearningProject,mode:'visible'|'executable')=>contractAllows(LEARNLOOP_TOOL_CONTRACTS[name],project,mode)
export const executablePhasesForTool=(name:LearnLoopToolName)=>LEARNLOOP_TOOL_CONTRACTS[name].executableExecutionPhases??LEARNLOOP_TOOL_CONTRACTS[name].executableProjectPhases
export interface AgentToolPolicy{allowedLearnLoopTools:readonly LearnLoopToolName[];allowNativeQuestion:boolean}
export function deriveAgentToolPolicy(project:LearningProject|null):AgentToolPolicy{
 if(!project)return{allowedLearnLoopTools:[],allowNativeQuestion:true}
 const tools=LEARNLOOP_TOOL_NAMES.filter(name=>toolAllowed(name,project,'visible')).filter(name=>name!=='learnloop_commit_profile'||project.profileInterview.status==='ready-to-draft'); return{allowedLearnLoopTools:tools,allowNativeQuestion:project.phase==='interviewing'&&project.profileInterview.status==='collecting'&&!project.profileInterview.awaitingChatTopic}
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
