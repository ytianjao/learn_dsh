import { defineTool } from '@deepseek-ai/dsh-tools'
import { LearnLoopDomainError } from './domain.js'
import { activeProject, commitWorkspaceProfile, createPlanDraftFromIntent } from './workspace.js'
import type { StateTable } from './types.js'
import type {CanonicalWorkspaceContext} from './workspace-identity.js'
import {encodeToolError,finalizeLearnLoopToolError} from './tool-protocol.js'
type WorkspaceResolver=(sessionId:string,claimedWorkspaceId?:string)=>CanonicalWorkspaceContext
const canonical=(exec:{agent?:{id:unknown}},resolver:WorkspaceResolver,claim?:string)=>{if(!exec.agent)throw new LearnLoopDomainError('WORKSPACE_CONTEXT_MISSING','Tool execution has no DSH Session.');return resolver(String(exec.agent.id),claim)}
const stringItem={type:'string' as const}
const text={...stringItem,required:true as const}, integer={type:'integer' as const,required:true as const}
export function createLearnLoopCommitProfileTool(table:StateTable,resolveWorkspace:WorkspaceResolver){return defineTool({name:'learnloop_commit_profile',description:'Commit only learner-supported structured profile facts. Mentioning relevant or industry examples means standard density plus a note. Use high only for an explicit every-stage, example-dense, or primarily-case-based request. Omit exampleDensity when unstated. Host derives control metadata.',parameters:{goal:text,targetOutcome:text,priorKnowledge:text,experienceLevel:{type:'string',required:true,enum:['beginner','intermediate','advanced']},knowledgeGaps:{type:'array',required:true,items:stringItem},learningMode:{type:'string',required:true,enum:['knowledge-first','balanced','practice-first']},practiceCapacity:{type:'string',required:true,enum:['none','light','full']},explanationDepth:{type:'string',enum:['standard','deep']},exampleDensity:{type:'string',enum:['standard','high']},additionalNotes:{type:'string'},weeklyHours:integer,deadline:{type:'string'},constraints:{type:'array',required:true,items:stringItem},successCriteria:{type:'array',required:true,items:stringItem}},output:{schema:{type:'object',additionalProperties:false,properties:{status:{type:'string',const:'profile-review',required:true},profileRevision:integer}},render:(_a,v)=>[{type:'text',text:`Profile revision ${v.profileRevision} is awaiting explicit learner confirmation.`}]},finalizeContent:finalizeLearnLoopToolError,async execute(args,exec){const identity=canonical(exec,resolveWorkspace,undefined),key=`profile:${exec.callId}`;const updated=await table.update('singleton',state=>{const workspace=state.workspaces[identity.workspaceId]!,project=activeProject(workspace);return commitWorkspaceProfile(state,{...args,workspaceId:identity.workspaceId,projectId:project.id,sessionId:identity.sessionId,expectedRevision:workspace.revision,idempotencyKey:key})});const result=updated.commandReceipts.find(r=>r.workspaceId===identity.workspaceId&&r.idempotencyKey===key)?.result;if(!result||result.kind!=='profile-committed')throw new LearnLoopDomainError('INVALID_PROJECT_PHASE','Canonical profile receipt is missing.');return{status:'profile-review' as const,profileRevision:result.profileRevision}}})}
export function createLearnLoopCreatePlanDraftTool(table:StateTable,resolveWorkspace:WorkspaceResolver){
  const describedText=(title:string,description:string,example:string)=>({type:'string' as const,required:true as const,title,description,examples:[example]})
  const task={type:'object' as const,additionalProperties:false,properties:{
    title:describedText('Task title','A learner-visible title, unique across this plan.','Execution state boundaries'),
    objective:describedText('Learning objective','What the learner will understand or apply.','Distinguish global status from execution state.'),
    activity:{type:'string' as const,required:true as const,enum:['explain','example','apply'] as const,title:'Learning activity',description:'What the learner does in this task. It does not describe the answer format. Allowed values are exactly: explain, example, apply. Never use reflection, short-answer, artifact, implementation, discussion, lesson, worked-example, or free-form values here.',examples:['explain']},
    acceptanceCriteria:{type:'array' as const,required:true as const,title:'Acceptance criteria',description:'One to eight observable criteria verified by the text check.',examples:[['Explain the responsibility of global status.']],items:{type:'string' as const}},
    checkPrompt:describedText('Text verification prompt','A text-only question used to verify every acceptance criterion. Do not request files, uploads, repository changes, or artifacts.','Explain the two most important boundaries in your own words.'),
    estimateMinutes:{type:'integer' as const,required:true as const,title:'Estimated minutes',description:'Whole minutes from 10 through 240.',examples:[40]},
  }}
  const stage={type:'object' as const,additionalProperties:false,properties:{
    title:describedText('Stage title','A learner-visible stage title, unique in the plan.','Agent Runtime Foundations'),
    outcome:describedText('Stage outcome','The understanding achieved after this stage.','Understand execution state and recovery boundaries.'),
    tasks:{type:'array' as const,required:true as const,title:'Stage tasks',description:'One to ten tasks in learning order.',examples:[],items:task},
  }}
  const plan={type:'object' as const,required:true as const,additionalProperties:false,title:'Plan intent',description:'Minimal learning-design intent. The Host generates every identity, dependency, version and status.',examples:[],properties:{stages:{type:'array' as const,required:true as const,title:'Learning stages',description:'One to six ordered stages and two to forty tasks overall.',examples:[],items:stage}}}
  return defineTool({name:'learnloop_create_plan_draft',description:'Create a draft from a minimal Plan Intent. Supply learning design only. Host owns Workspace, Project, revisions, idempotency, IDs, dependencies and status. All checks are text-only; artifact verification is unsupported.',parameters:{plan},output:{schema:{type:'object',additionalProperties:false,properties:{status:{type:'string',const:'draft',required:true},planId:text,planVersion:integer}},render:(_a,v)=>[{type:'text',text:`Plan draft ${v.planVersion} (planId=${v.planId}) awaits explicit learner approval; do not start teaching.`}]},finalizeContent(exec,result){
    if(!result.isError||result.error.info?.code!=='INVALID_ARGS')return finalizeLearnLoopToolError(exec,result)
    const args=exec.arguments
    if(typeof args!=='object'||args===null)return finalizeLearnLoopToolError(exec,result)
    const stages=(args as {plan?:{stages?:unknown}}).plan?.stages
    if(!Array.isArray(stages))return finalizeLearnLoopToolError(exec,result)
    for(const [stageIndex,stage] of stages.entries()){
      if(typeof stage!=='object'||stage===null)continue
      const tasks=(stage as {tasks?:unknown}).tasks
      if(!Array.isArray(tasks))continue
      for(const [taskIndex,task] of tasks.entries()){
        if(typeof task!=='object'||task===null)continue
        const activity=(task as {activity?:unknown}).activity
        if(typeof activity==='string'&&!['explain','example','apply'].includes(activity))return[{type:'text',text:encodeToolError({code:'INVALID_ARGS',retryable:true,message:'Tool arguments were rejected before execution.',path:`plan.stages[${stageIndex}].tasks[${taskIndex}].activity`,received:activity,allowedValues:['explain','example','apply'],semanticHint:'activity describes the learning activity; reflection belongs in checkPrompt.',maxRetries:1})}]
      }
    }
    return finalizeLearnLoopToolError(exec,result)
  },async execute(args,exec){
    const extras=Object.keys(args).filter(name=>name!=='plan')
    if(extras.length)throw new LearnLoopDomainError('INVALID_PLAN',`Only the plan root property is allowed; received: ${extras.join(', ')}.`)
    if(!exec.agent)throw new LearnLoopDomainError('WORKSPACE_CONTEXT_MISSING','Tool execution has no DSH Session.')
    const sessionId=String(exec.agent.id),identity=resolveWorkspace(sessionId)
    if(identity.sessionId!==sessionId)throw new LearnLoopDomainError('SESSION_MISMATCH','Tool call is not from the active Session.')
    const callId=String(exec.callId)
    const updated=await table.update('singleton',state=>createPlanDraftFromIntent(state,{sessionId,callId,plan:args.plan}))
    const workspace=updated.workspaces[identity.workspaceId]!
    const result=updated.commandReceipts.find(receipt=>receipt.workspaceId===identity.workspaceId&&receipt.idempotencyKey===`plan-draft:${callId}`)?.result
    if(!result||result.kind!=='plan-draft-created')throw new LearnLoopDomainError('INVALID_PLAN','Canonical plan draft receipt is missing.')
    return{status:'draft' as const,planId:result.planId,planVersion:result.planVersion}
  }})
}
