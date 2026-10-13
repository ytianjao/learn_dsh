import type {Agent} from '@deepseek-ai/dsh-agent'
import type {LearningProject,LearnLoopState} from './types.js'
import {allowedLearnLoopToolsForPhase,deriveAgentToolPolicy,encodeToolError,LEARNLOOP_TOOL_NAMES,type LearnLoopToolName} from './tool-protocol.js'
import {resolveSessionWorkspace} from './workspace.js'

interface Restriction{fingerprint:string;lift:()=>void}
const projectFor=(state:LearnLoopState|undefined,sessionId:string):LearningProject|null=>{if(!state)return null;const resolution=resolveSessionWorkspace(state,sessionId);return resolution.kind==='resolved'&&resolution.workspace.activeProjectId?resolution.workspace.projects[resolution.workspace.activeProjectId]??null:null}
const isLearnLoopTool=(name:string):name is LearnLoopToolName=>(LEARNLOOP_TOOL_NAMES as readonly string[]).includes(name)

/**
 * Owns exactly one replaceable, agent-scoped restriction per live Agent. A learning session declares
 * every LearnLoop tool for its whole life, so phase changes never rewrite the tool declarations (that
 * broke the provider prefix cache); the guard rejects a tool the current phase does not allow before
 * it runs, reading live state so it never acts on a stale phase.
 */
export class LearnLoopToolRestrictions{
 private readonly active=new Map<string,Restriction>()
 constructor(private readonly readState?:()=>LearnLoopState|undefined){}
 sync(agent:Agent,state:LearnLoopState){
  const id=String(agent.id),prior=this.active.get(id)
  // Lift first: schemas(agent) must observe the complete inherited live registry.
  prior?.lift();this.active.delete(id)
  const policy=deriveAgentToolPolicy(projectFor(state,id))
  const registeredNames=new Set(agent.ctx.tools.schemas(agent).map(schema=>schema.name))
  const denied:string[]=LEARNLOOP_TOOL_NAMES.filter(name=>registeredNames.has(name)&&!policy.declaredLearnLoopTools.includes(name))
  if(!policy.allowNativeQuestion&&registeredNames.has('ask_user_question'))denied.push('ask_user_question')
  const fingerprint=[...denied].sort().join('|')||'unrestricted'
  const liftRestriction=agent.ctx.tools.restrict({deny:denied})
  const liftGuard=agent.ctx.tools.guard(exec=>{
   const project=projectFor(this.readState?.()??state,id)
   // Defence in depth behind the deny list: while interviewing, Profile questions go only through the Host tool.
   if(exec.name==='ask_user_question'&&project?.phase==='interviewing')return encodeToolError({code:'INTERVIEW_TOPIC_MISMATCH',category:'conflict',message:'Profile questions are Host-owned; use learnloop_ask_profile_question.',recovery:{kind:'refresh-state',maxAttempts:0},details:{currentProbe:project.profileInterview.currentProbeId,requiredTool:'learnloop_ask_profile_question'}})
   if(!isLearnLoopTool(exec.name)||!project)return
   const allowed=allowedLearnLoopToolsForPhase(project)
   if(allowed.includes(exec.name))return
   return encodeToolError({code:'INVALID_PROJECT_PHASE',category:'conflict',message:'This LearnLoop tool is not allowed in the current phase.',recovery:{kind:'refresh-state',maxAttempts:0},details:{currentPhase:project.phase==='active'?project.execution?.phase??'inactive':project.phase,allowedTools:allowed}})
  })
  this.active.set(id,{fingerprint,lift:()=>{liftGuard();liftRestriction()}})
 }
 dispose(sessionId:string){this.active.get(sessionId)?.lift();this.active.delete(sessionId)}
 disposeAll(){for(const item of this.active.values())item.lift();this.active.clear()}
}
