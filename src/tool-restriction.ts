import type {Agent} from '@deepseek-ai/dsh-agent'
import type {LearnLoopState} from './types.js'
import {deriveAgentToolPolicy,LEARNLOOP_TOOL_NAMES} from './tool-protocol.js'
import {resolveSessionWorkspace} from './workspace.js'

interface Restriction{fingerprint:string;lift:()=>void}

/** Owns exactly one replaceable restriction/guard pair per live Agent. */
export class LearnLoopToolRestrictions{
 private readonly active=new Map<string,Restriction>()
 constructor(private readonly registeredNames:ReadonlySet<string>){ }
 sync(agent:Agent,state:LearnLoopState){
  const resolution=resolveSessionWorkspace(state,String(agent.id))
  const project=resolution.kind==='resolved'&&resolution.workspace.activeProjectId?resolution.workspace.projects[resolution.workspace.activeProjectId]??null:null
  const policy=deriveAgentToolPolicy(project)
  const denied:string[]=LEARNLOOP_TOOL_NAMES.filter(name=>this.registeredNames.has(name)&&!policy.allowedLearnLoopTools.includes(name))
  if(!policy.allowNativeQuestion&&this.registeredNames.has('ask_user_question'))denied.push('ask_user_question')
  const fingerprint=[...denied].sort().join('|')||'unrestricted'
  const prior=this.active.get(String(agent.id));if(prior?.fingerprint===fingerprint)return
  prior?.lift()
  if(!denied.length){this.active.delete(String(agent.id));return}
  const liftRestriction=agent.ctx.tools.restrict({deny:denied})
  const liftGuard=agent.ctx.tools.guard(exec=>denied.includes(exec.name)?'LearnLoop phase policy denies this tool.':undefined)
  this.active.set(String(agent.id),{fingerprint,lift:()=>{liftGuard();liftRestriction()}})
 }
 dispose(sessionId:string){this.active.get(sessionId)?.lift();this.active.delete(sessionId)}
 disposeAll(){for(const item of this.active.values())item.lift();this.active.clear()}
}
