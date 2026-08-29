import type {Agent} from '@deepseek-ai/dsh-agent'
import type {LearnLoopState} from './types.js'
import {deriveAgentToolPolicy,LEARNLOOP_TOOL_NAMES} from './tool-protocol.js'
import {resolveSessionWorkspace} from './workspace.js'

interface Restriction{fingerprint:string;lift:()=>void}

/** Owns exactly one replaceable, agent-scoped restriction per live Agent. */
export class LearnLoopToolRestrictions{
 private readonly active=new Map<string,Restriction>()
 sync(agent:Agent,state:LearnLoopState){
  const id=String(agent.id),prior=this.active.get(id)
  // Lift first: schemas(agent) must observe the complete inherited live registry.
  prior?.lift();this.active.delete(id)
  const resolution=resolveSessionWorkspace(state,String(agent.id))
  const project=resolution.kind==='resolved'&&resolution.workspace.activeProjectId?resolution.workspace.projects[resolution.workspace.activeProjectId]??null:null
  const policy=deriveAgentToolPolicy(project)
  const registeredNames=new Set(agent.ctx.tools.schemas(agent).map(schema=>schema.name))
  const denied:string[]=LEARNLOOP_TOOL_NAMES.filter(name=>registeredNames.has(name)&&!policy.allowedLearnLoopTools.includes(name))
  if(!policy.allowNativeQuestion&&registeredNames.has('ask_user_question'))denied.push('ask_user_question')
  const fingerprint=[...denied].sort().join('|')||'unrestricted'
  if(!denied.length)return
  const liftRestriction=agent.ctx.tools.restrict({deny:denied})
  this.active.set(id,{fingerprint,lift:liftRestriction})
 }
 dispose(sessionId:string){this.active.get(sessionId)?.lift();this.active.delete(sessionId)}
 disposeAll(){for(const item of this.active.values())item.lift();this.active.clear()}
}
