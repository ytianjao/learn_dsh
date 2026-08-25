import { defineTool } from '@deepseek-ai/dsh-tools'
import { LearnLoopDomainError } from './domain.js'
import { activeProject, approveWorkspacePlan, beginWorkspaceOnboarding, commitWorkspaceProfile, confirmWorkspaceProfile, createPlanDraftFromIntent } from './workspace.js'
import type { StateTable } from './types.js'
import type {CanonicalWorkspaceContext} from './workspace-identity.js'
type WorkspaceResolver=(sessionId:string,claimedWorkspaceId?:string)=>CanonicalWorkspaceContext
const canonical=(exec:{agent?:{id:unknown}},resolver:WorkspaceResolver,claim:string)=>{if(!exec.agent)throw new LearnLoopDomainError('WORKSPACE_CONTEXT_MISSING','Tool execution has no DSH Session.');return resolver(String(exec.agent.id),claim)}
const stringItem={type:'string' as const}
const text={...stringItem,required:true as const}, integer={type:'integer' as const,required:true as const}
const key={...text,description:'Stable lowercase key; never a database id.'}
const workspaceRevision={...integer,description:'Current workspace revision from GET /learnloop/api/v3/state at workspace.revision; this is not the top-level state revision.'}
const workspaceClaim={...text,description:'Compatibility declaration only. The Host derives the canonical UUID from the current Session and rejects a mismatch.'}
export function createLearnLoopBeginOnboardingTool(table:StateTable,resolveWorkspace:WorkspaceResolver){return defineTool({name:'learnloop_begin_onboarding',description:'Begin an explicitly requested guided interview in the current Session DSH Workspace; the Host validates its canonical UUID. Ask one native user question after this command.',parameters:{workspaceId:workspaceClaim,expectedRevision:workspaceRevision,idempotencyKey:text},output:{schema:{type:'object',additionalProperties:false,properties:{status:{type:'string',const:'interviewing',required:true},projectId:text,revision:integer}},render:(_a,v)=>[{type:'text',text:`Interview started (projectId=${v.projectId}, revision=${v.revision}). Ask exactly one core question with ask_user_question.`}]},async execute(args,exec){const identity=canonical(exec,resolveWorkspace,args.workspaceId);const updated=await table.update('singleton',state=>beginWorkspaceOnboarding(state,{...args,...identity}));const workspace=updated.workspaces[identity.workspaceId]!;return{status:'interviewing' as const,projectId:workspace.activeProjectId!,revision:workspace.revision}}})}
export function createLearnLoopCommitProfileTool(table:StateTable,resolveWorkspace:WorkspaceResolver){return defineTool({name:'learnloop_commit_profile',description:'Commit only learner-supported structured profile facts to the current stable workspace. This creates no active plan.',parameters:{workspaceId:text,projectId:text,expectedRevision:workspaceRevision,idempotencyKey:text,goal:text,priorKnowledge:text,experienceLevel:{type:'string',required:true,enum:['beginner','intermediate','advanced']},knowledgeGaps:{type:'array',required:true,items:stringItem},learningMode:{type:'string',required:true,enum:['knowledge-first','balanced','practice-first']},practiceCapacity:{type:'string',required:true,enum:['none','light','full']},weeklyHours:integer,deadline:{type:'string'},constraints:{type:'array',required:true,items:stringItem},successCriteria:{type:'array',required:true,items:stringItem},unansweredQuestions:{type:'array',required:true,items:stringItem}},output:{schema:{type:'object',additionalProperties:false,properties:{status:{type:'string',const:'profile-review',required:true},revision:integer,profileRevision:integer}},render:(_a,v)=>[{type:'text',text:`Profile revision ${v.profileRevision} is awaiting explicit learner confirmation (revision=${v.revision}).`}]},async execute(args,exec){const identity=canonical(exec,resolveWorkspace,args.workspaceId);const updated=await table.update('singleton',state=>commitWorkspaceProfile(state,{...args,workspaceId:identity.workspaceId}));const workspace=updated.workspaces[identity.workspaceId]!;return{status:'profile-review' as const,revision:workspace.revision,profileRevision:activeProject(workspace).profileRevision}}})}
export function createLearnLoopConfirmProfileTool(table:StateTable,resolveWorkspace:WorkspaceResolver){return defineTool({name:'learnloop_confirm_profile',description:'Confirm the current profile revision only after the learner explicitly approved the displayed profile in the native question dialog.',parameters:{workspaceId:text,projectId:text,profileRevision:integer,expectedRevision:workspaceRevision,idempotencyKey:text},output:{schema:{type:'object',additionalProperties:false,properties:{status:{type:'string',const:'planning',required:true},revision:integer,profileRevision:integer}},render:(_a,v)=>[{type:'text',text:`Profile revision ${v.profileRevision} is confirmed (revision=${v.revision}). Generate and publish the plan draft next.`}]},async execute(args,exec){const identity=canonical(exec,resolveWorkspace,args.workspaceId);const updated=await table.update('singleton',state=>confirmWorkspaceProfile(state,{...args,workspaceId:identity.workspaceId}));const workspace=updated.workspaces[identity.workspaceId]!;return{status:'planning' as const,revision:workspace.revision,profileRevision:activeProject(workspace).profileRevision}}})}
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
  return defineTool({name:'learnloop_create_plan_draft',description:'Create a draft from a minimal Plan Intent. Supply learning design only. Host owns Workspace, Project, revisions, idempotency, IDs, dependencies and status. All checks are text-only; artifact verification is unsupported.',parameters:{plan},output:{schema:{type:'object',additionalProperties:false,properties:{status:{type:'string',const:'draft',required:true},revision:integer,planId:text,planVersion:integer}},render:(_a,v)=>[{type:'text',text:`Plan draft ${v.planVersion} (planId=${v.planId}, revision=${v.revision}) awaits explicit learner approval; do not start teaching.`}]},finalizeContent(exec,result){
    if(!result.isError||result.error.info?.code!=='INVALID_ARGS')return undefined
    const args=exec.arguments
    if(typeof args!=='object'||args===null)return undefined
    const stages=(args as {plan?:{stages?:unknown}}).plan?.stages
    if(!Array.isArray(stages))return undefined
    for(const [stageIndex,stage] of stages.entries()){
      if(typeof stage!=='object'||stage===null)continue
      const tasks=(stage as {tasks?:unknown}).tasks
      if(!Array.isArray(tasks))continue
      for(const [taskIndex,task] of tasks.entries()){
        if(typeof task!=='object'||task===null)continue
        const activity=(task as {activity?:unknown}).activity
        if(typeof activity==='string'&&!['explain','example','apply'].includes(activity))return[{type:'text',text:`Tool arguments were rejected before execution.\n\nPath:\nplan.stages[${stageIndex}].tasks[${taskIndex}].activity\n\nReceived:\n${JSON.stringify(activity)}\n\nAllowed:\n"explain", "example", "apply"\n\nSemantic note:\nactivity describes the learning activity. Reflection belongs in the natural-language checkPrompt, not in the activity enum.\n\nCorrect only the invalid field and retry this logical operation once. Do not regenerate unrelated stages or tasks.`}]
      }
    }
    return undefined
  },async execute(args,exec){
    const extras=Object.keys(args).filter(name=>name!=='plan')
    if(extras.length)throw new LearnLoopDomainError('INVALID_PLAN',`Only the plan root property is allowed; received: ${extras.join(', ')}.`)
    if(!exec.agent)throw new LearnLoopDomainError('WORKSPACE_CONTEXT_MISSING','Tool execution has no DSH Session.')
    const sessionId=String(exec.agent.id),identity=resolveWorkspace(sessionId)
    if(identity.sessionId!==sessionId)throw new LearnLoopDomainError('SESSION_MISMATCH','Tool call is not from the active Session.')
    const callId=String(exec.callId)
    const updated=await table.update('singleton',state=>createPlanDraftFromIntent(state,{sessionId,callId,plan:args.plan}))
    const workspace=updated.workspaces[identity.workspaceId]!,draft=activeProject(workspace).plans.find(value=>value.status==='draft')!
    return{status:'draft' as const,revision:workspace.revision,planId:draft.id,planVersion:draft.version}
  }})
}
export function createLearnLoopApprovePlanTool(table:StateTable,resolveWorkspace:WorkspaceResolver){return defineTool({name:'learnloop_approve_plan',description:'Activate a draft only after the learner explicitly selected approve in the native question dialog.',parameters:{workspaceId:text,projectId:text,planId:text,expectedRevision:workspaceRevision,idempotencyKey:text},output:{schema:{type:'object',additionalProperties:false,properties:{status:{type:'string',const:'active',required:true},revision:integer}},render:(_a,v)=>[{type:'text',text:`The approved plan is active (revision=${v.revision}).`}]},async execute(args,exec){const identity=canonical(exec,resolveWorkspace,args.workspaceId);const updated=await table.update('singleton',state=>approveWorkspacePlan(state,{...args,workspaceId:identity.workspaceId,sessionId:identity.sessionId}));return{status:'active' as const,revision:updated.workspaces[identity.workspaceId]!.revision}}})}
