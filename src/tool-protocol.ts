import type {ContentBlock} from '@deepseek-ai/dsh-llm'
import type {ToolExecution,ToolExecutionResult} from '@deepseek-ai/dsh-tools'
import type {LearningProject,LearnLoopErrorCode} from './types.js'

export const LEARNLOOP_TOOL_ERROR_MARKER='LEARNLOOP_TOOL_ERROR_V2'
export type RecoveryKind='correct-and-retry'|'ask-follow-up'|'fallback-to-chat'|'refresh-state'|'wait-for-user'|'do-not-retry'
export interface LearnLoopToolErrorEnvelope{version:2;code:string;category:'pre-execution'|'domain'|'conflict'|'infrastructure';message:string;recovery:{kind:RecoveryKind;maxAttempts:number};details?:Record<string,unknown>}
export type LearnLoopToolName='learnloop_create_plan_draft'|'learnloop_assess_answer'|'learnloop_write_lesson_document'
export const LEARNLOOP_TOOL_NAMES:readonly LearnLoopToolName[]=['learnloop_create_plan_draft','learnloop_assess_answer','learnloop_write_lesson_document']
export interface LearnLoopToolContract{visibleProjectPhases:readonly string[];visibleExecutionPhases?:readonly string[];executableProjectPhases:readonly string[];executableExecutionPhases?:readonly string[]}
export const LEARNLOOP_TOOL_CONTRACTS:Readonly<Record<LearnLoopToolName,LearnLoopToolContract>>={
 learnloop_create_plan_draft:{visibleProjectPhases:['planning'],executableProjectPhases:['planning']},
 learnloop_assess_answer:{visibleProjectPhases:['active'],visibleExecutionPhases:['awaiting-answer','verifying'],executableProjectPhases:['active'],executableExecutionPhases:['verifying']},
 learnloop_write_lesson_document:{visibleProjectPhases:['active','completed'],executableProjectPhases:['active','completed']}}
const contractAllows=(contract:LearnLoopToolContract,project:LearningProject,mode:'visible'|'executable')=>{const projects=mode==='visible'?contract.visibleProjectPhases:contract.executableProjectPhases,executions=mode==='visible'?contract.visibleExecutionPhases:contract.executableExecutionPhases;return projects.includes(project.phase)&&(!executions||executions.includes(project.execution?.phase??''))}
export const toolAllowed=(name:LearnLoopToolName,project:LearningProject,mode:'visible'|'executable')=>contractAllows(LEARNLOOP_TOOL_CONTRACTS[name],project,mode)&&(name!=='learnloop_write_lesson_document'||Boolean(project.content.activeGenerationJobId))
export const executablePhasesForTool=(name:LearnLoopToolName)=>LEARNLOOP_TOOL_CONTRACTS[name].executableExecutionPhases??LEARNLOOP_TOOL_CONTRACTS[name].executableProjectPhases
export interface AgentToolPolicy{allowedLearnLoopTools:readonly LearnLoopToolName[];allowNativeQuestion:boolean}
export function deriveAgentToolPolicy(project:LearningProject|null):AgentToolPolicy{if(!project)return{allowedLearnLoopTools:[],allowNativeQuestion:true};return{allowedLearnLoopTools:LEARNLOOP_TOOL_NAMES.filter(name=>toolAllowed(name,project,'visible')),allowNativeQuestion:project.phase==='interviewing'&&project.profileInterview.status==='collecting'&&!project.profileInterview.awaitingChatProbeId}}
export const allowedLearnLoopToolsForPhase=(project:LearningProject|null)=>deriveAgentToolPolicy(project).allowedLearnLoopTools
const directive=(code:string):Pick<LearnLoopToolErrorEnvelope,'category'|'recovery'>=>code==='INVALID_ARGS'||code==='INTERVIEW_QUESTION_CONTRACT_INVALID'?{category:'pre-execution',recovery:{kind:'correct-and-retry',maxAttempts:1}}:code==='REVISION_CONFLICT'?{category:'conflict',recovery:{kind:'refresh-state',maxAttempts:0}}:{category:code==='INTERNAL_ERROR'?'infrastructure':'domain',recovery:{kind:'do-not-retry',maxAttempts:0}}
export const encodeToolError=(error:Omit<LearnLoopToolErrorEnvelope,'version'>)=>`${LEARNLOOP_TOOL_ERROR_MARKER}\n<learnloop-tool-error-json>\n${JSON.stringify({version:2,...error})}\n</learnloop-tool-error-json>`
export function finalizeLearnLoopToolError(_exec:Readonly<ToolExecution>,result:Readonly<ToolExecutionResult>):ContentBlock[]|undefined{if(!result.isError)return undefined;const code=result.error.info?.code??'INTERNAL_ERROR',base=directive(code);return[{type:'text',text:encodeToolError({code,...base,message:code==='INVALID_ARGS'?'The tool arguments are invalid.':'LearnLoop could not complete this operation.'})}]}
export function invalidPhase(toolName:string,project:LearningProject,allowedPhases:readonly string[]){return{code:'INVALID_PROJECT_PHASE' as LearnLoopErrorCode,version:2,category:'domain' as const,recovery:{kind:'do-not-retry' as const,maxAttempts:0},message:'This tool is not allowed in the current LearnLoop phase.',details:{currentPhase:project.execution?.phase??project.phase,allowedPhases,toolName}}}
