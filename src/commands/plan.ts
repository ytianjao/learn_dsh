/** Plan versions: draft creation from Intent, Host review, approval, revision requests. */
import {LearnLoopDomainError, payloadHash} from '../domain.js'
import { compilePlanIntent, validatePlanIntent, type PlanIntent } from '../plan-intent.js'
import {interviewTopics, learnLoopStateSchema, type Assessment, type CriterionAssessment, type LearnerProfile, type LearningProject, type InterviewTopic, type InterviewProbeId, type LearningTask, type LearnLoopState, type CommandResult, type VerifiedTaskAssessment, type WorkspaceLearningState} from '../types.js'
import {activeProject,fail,now,requireToolPhase,workspaceForSession,workspaceOf} from './shared.js'
import {applyWorkspaceCommand} from './bus.js'
import {masteryRowsForPlan} from './mastery.js'
export function requestWorkspacePlanRevision(state:LearnLoopState,input:{workspaceId:string;projectId:string;sessionId:string;expectedRevision:number;planId:string;idempotencyKey:string;reason:string}){return applyWorkspaceCommand(state,input,'workspace:request-plan-revision',input,(w,p)=>{if(!p||p.phase!=='plan_review'||!input.reason.trim())fail('PLAN_REVISION_REQUEST_INVALID','A current Draft and revision reason are required.');const draft=p.plans.find(x=>x.status==='draft');if(!draft||draft.id!==input.planId)fail('PLAN_REVISION_REQUEST_INVALID','Plan revision does not match current Draft.');const at=now();return{...w,projects:{...w.projects,[p.id]:{...p,phase:'planning',plans:p.plans.map(x=>x.id===draft.id?{...x,status:'archived' as const}:x),pendingPlanRevisionRequest:{reason:input.reason.trim(),requestedAt:at},updatedAt:at}}}})}
export function createPlanDraftFromIntent(state: LearnLoopState, input: { sessionId: string; callId: string; plan: PlanIntent }) {
 const workspace = workspaceForSession(state, input.sessionId)
 const project = activeProject(workspace)
 const idempotencyKey = `plan-draft:${input.callId}`
 if(!state.commandReceipts.some(r=>r.workspaceId===workspace.workspaceId&&r.idempotencyKey===idempotencyKey))requireToolPhase(project,'learnloop_create_plan_draft')
 const context = { workspaceId: workspace.workspaceId, projectId: project.id, sessionId: input.sessionId, expectedRevision: workspace.revision, idempotencyKey }
 return applyWorkspaceCommand(state, context, 'workspace:create-plan-draft', input.plan, (current, active) => {
  if (!active || active.phase !== 'planning') fail(active?.plans.some(plan => plan.status === 'draft') ? 'PLAN_ALREADY_PUBLISHED' : 'INVALID_PLAN', 'The active project is not accepting a plan draft.')
  if (!active.profile?.confirmedAt || active.profile.revision !== active.profileRevision) fail('REVISION_CONFLICT', 'The confirmed profile changed.')
  if (active.plans.some(plan => plan.status === 'draft' || plan.status === 'active')) fail('PLAN_ALREADY_PUBLISHED', 'A draft or active plan already exists.')
  const intent = validatePlanIntent(input.plan, active.profile)
  // Reuse the concept identity of any concept the project already tracks so mastery rows and
  // their evidence keep accumulating across plan revisions instead of restarting.
  const conceptKeyByConceptId = new Map<string, string>()
  for (const version of active.plans) for (const stage of version.stages) for (const task of stage.tasks) {
    if (task.conceptKey) conceptKeyByConceptId.set(task.conceptKey.trim().toLowerCase(), task.conceptId)
  }
  const plan = compilePlanIntent(intent, active.profile, { planVersion: Math.max(0, ...active.plans.map(value => value.version)) + 1, conceptIds: conceptKeyByConceptId })
  const changed = { ...active, plans: [...active.plans, plan], pendingPlanRevisionRequest:null, phase: 'plan_review' as const, updatedAt: plan.createdAt }
  return { ...current, projects: { ...current.projects, [changed.id]: changed } }
 }, current => {
  const draft = current.projects[project.id]!.plans.at(-1)!
  return { kind: 'plan-draft-created', planId: draft.id, planVersion: draft.version, workspaceRevision: current.revision }
 })
}
export function requestPlanDraftRevision(state:LearnLoopState,input:{sessionId:string;callId:string;reason:string}){
 const workspace=workspaceForSession(state,input.sessionId),project=activeProject(workspace)
 const replayKey=`plan-revision:${input.callId}`
 if(!state.commandReceipts.some(r=>r.workspaceId===workspace.workspaceId&&r.idempotencyKey===replayKey))if(project.phase!=='plan_review')fail('INVALID_PROJECT_PHASE','Plan revision requires review.')
 const context={workspaceId:workspace.workspaceId,projectId:project.id,sessionId:input.sessionId,expectedRevision:workspace.revision,idempotencyKey:`plan-revision:${input.callId}`}
 return applyWorkspaceCommand(state,context,'workspace:request-plan-revision',{reason:input.reason},(current,active)=>{
  if(!active||active.phase!=='plan_review')fail('INVALID_PLAN','A revision can only be requested for the current draft during plan review.')
  const draft=active.plans.find(plan=>plan.status==='draft')
  if(!draft)fail('PLAN_NOT_PUBLISHED','Current draft not found.')
  const at=now(),changed={...active,phase:'planning' as const,plans:active.plans.map(plan=>plan.id===draft.id?{...plan,status:'archived' as const}:plan),updatedAt:at}
  return{...current,projects:{...current.projects,[changed.id]:changed}}
 },current=>{const archived=current.projects[project.id]!.plans.find(plan=>plan.status==='archived'&&plan.id===project.plans.find(plan=>plan.status==='draft')!.id)!;return{kind:'plan-draft-revision-requested',planId:archived.id,planVersion:archived.version,workspaceRevision:current.revision}})
}
export function approveWorkspacePlan(state:LearnLoopState,input:{workspaceId:string;projectId:string;sessionId:string;expectedRevision:number;idempotencyKey:string;planId:string}){const current=activeProject(workspaceOf(state,input.workspaceId));if(!state.commandReceipts.some(r=>r.workspaceId===input.workspaceId&&r.idempotencyKey===input.idempotencyKey)&&current.phase!=='plan_review')fail('PLAN_REVIEW_NOT_READY','Plan is not ready for Host review.');return applyWorkspaceCommand(state,input,'workspace:approve-plan',input,(w,p)=>{if(!p)fail('PROJECT_NOT_FOUND','Project missing.');const draft=p.plans.find(x=>x.id===input.planId&&x.status==='draft');if(!draft)throw new LearnLoopDomainError('PLAN_APPROVAL_MISMATCH','The approved plan does not match the current draft.',{receivedPlanId:input.planId});const at=now(),plans=p.plans.map(x=>x.id===draft.id?{...x,status:'active' as const}:x.status==='active'?{...x,status:'superseded' as const}:x);const project={...p,plans,activePlanId:draft.id,phase:'active' as const,mastery:masteryRowsForPlan(draft,at),execution:null,updatedAt:at};return{...w,activeSessionId:input.sessionId,projects:{...w.projects,[p.id]:project}}},()=>({kind:'plan-approved',planId:input.planId,planVersion:current.plans.find(p=>p.id===input.planId)!.version}))}

/**
 * Propose a plan revision while the plan is already active. The model supplies only a plan
 * revision intent; the Host compiles a new immutable plan version as a draft and leaves the
 * active version untouched until the learner approves it. This is how "adjust the plan as we go"
 * happens without silent replacement.
 */
export function proposePlanAdjustment(state:LearnLoopState,input:{sessionId:string;callId:string;reason:string;plan:PlanIntent}){
 const workspace=workspaceForSession(state,input.sessionId),project=activeProject(workspace)
 const replayKey=`plan-adjustment:${input.callId}`
 if(!state.commandReceipts.some(r=>r.workspaceId===workspace.workspaceId&&r.idempotencyKey===replayKey))requireToolPhase(project,'learnloop_propose_plan_adjustment')
 const context={workspaceId:workspace.workspaceId,projectId:project.id,sessionId:input.sessionId,expectedRevision:workspace.revision,idempotencyKey:replayKey}
 return applyWorkspaceCommand(state,context,'workspace:propose-plan-adjustment',{reason:input.reason,plan:input.plan},(current,active)=>{
  if(!active)fail('PROJECT_NOT_FOUND','Project missing.')
  // A pending adjustment must settle before another one is proposed.
  if(active.plans.some(plan=>plan.status==='draft'))fail('PLAN_ALREADY_PUBLISHED','An unapproved plan version already exists.')
  if(!input.reason.trim())fail('INVALID_PLAN','A plan adjustment requires a stated reason.')
  if(!active.profile)return fail('PROJECT_NOT_FOUND','Profile missing.')
  const intent=validatePlanIntent(input.plan,active.profile)
  const conceptKeyByConceptId=new Map<string,string>()
  for(const version of active.plans)for(const stage of version.stages)for(const task of stage.tasks)if(task.conceptKey)conceptKeyByConceptId.set(task.conceptKey.trim().toLowerCase(),task.conceptId)
  const plan=compilePlanIntent(intent,active.profile,{planVersion:Math.max(0,...active.plans.map(value=>value.version))+1,conceptIds:conceptKeyByConceptId})
  const at=now()
  // Tasks already completed stay completed: a revision may not un-complete verified work.
  const completed=new Map(active.plans.find(v=>v.id===active.activePlanId)?.stages.flatMap(s=>s.tasks).filter(t=>t.status==='completed'||t.status==='skipped').map(t=>[t.title.trim().toLowerCase(),t.status])??[])
  const reconciled={...plan,stages:plan.stages.map(stage=>({...stage,tasks:stage.tasks.map(task=>({...task,status:completed.get(task.title.trim().toLowerCase())??task.status}))}))}
  const changed={...active,plans:[...active.plans,reconciled],pendingPlanAdjustment:{reason:input.reason.trim(),proposedAt:at,planId:reconciled.id},updatedAt:at}
  return{...current,projects:{...current.projects,[changed.id]:changed}}
 },current=>{const added=current.projects[project.id]!.plans.at(-1)!;return{kind:'plan-adjustment-proposed',planId:added.id,planVersion:added.version,workspaceRevision:current.revision}})
}

/** Approve a proposed adjustment: the new version becomes active, the previous one is superseded. */
export function approvePlanAdjustment(state:LearnLoopState,input:{workspaceId:string;projectId:string;sessionId:string;expectedRevision:number;idempotencyKey:string;planId:string}){
 return applyWorkspaceCommand(state,input,'workspace:approve-plan-adjustment',input,(w,p)=>{
  if(!p)fail('PROJECT_NOT_FOUND','Project missing.')
  const draft=p.plans.find(plan=>plan.id===input.planId&&plan.status==='draft')
  if(!draft)throw new LearnLoopDomainError('PLAN_APPROVAL_MISMATCH','The approved adjustment does not match the pending draft.',{receivedPlanId:input.planId})
  if(!p.pendingPlanAdjustment||p.pendingPlanAdjustment.planId!==draft.id)fail('PLAN_REVIEW_NOT_READY','No adjustment is awaiting approval.')
  const at=now()
  const plans=p.plans.map(plan=>plan.id===draft.id?{...plan,status:'active' as const}:plan.status==='active'?{...plan,status:'superseded' as const}:plan)
  // Keep accumulated mastery for concepts that survive, introduce rows for new concepts, and
  // drop rows for concepts the revision removed.
  const conceptIds=new Set(draft.stages.flatMap(stage=>stage.tasks).map(task=>task.conceptId))
  const kept=p.mastery.filter(row=>conceptIds.has(row.conceptId))
  const known=new Set(kept.map(row=>row.conceptId))
  const introduced=masteryRowsForPlan(draft,at).filter(row=>!known.has(row.conceptId))
  // A superseded plan invalidates an execution that pointed at a removed task.
  const stillPresent=draft.stages.flatMap(stage=>stage.tasks).some(task=>task.id===p.execution?.taskId)
  const project={...p,plans,activePlanId:draft.id,mastery:[...kept,...introduced],pendingPlanAdjustment:null,execution:stillPresent?p.execution:null,updatedAt:at}
  return{...w,projects:{...w.projects,[p.id]:project}}
 },current=>({kind:'plan-adjustment-approved',planId:input.planId,planVersion:current.projects[input.projectId]!.plans.find(plan=>plan.id===input.planId)!.version,workspaceRevision:current.revision}))
}

/** Discard a pending adjustment without activating it, so the plan can be adjusted again later. */
export function discardPlanAdjustment(state:LearnLoopState,input:{workspaceId:string;projectId:string;sessionId:string;expectedRevision:number;idempotencyKey:string;planId:string}){
 return applyWorkspaceCommand(state,input,'workspace:discard-plan-adjustment',input,(w,p)=>{
  if(!p)fail('PROJECT_NOT_FOUND','Project missing.')
  const draft=p.plans.find(plan=>plan.id===input.planId&&plan.status==='draft')
  if(!draft)fail('PLAN_APPROVAL_MISMATCH','The discarded adjustment does not match the pending draft.')
  if(!p.pendingPlanAdjustment||p.pendingPlanAdjustment.planId!==draft.id)fail('PLAN_REVIEW_NOT_READY','No adjustment is awaiting approval.')
  const at=now(),project={...p,plans:p.plans.map(plan=>plan.id===draft.id?{...plan,status:'archived' as const}:plan),pendingPlanAdjustment:null,updatedAt:at}
  return{...w,projects:{...w.projects,[p.id]:project}}
 },current=>({kind:'plan-adjustment-discarded',planId:input.planId,workspaceRevision:current.revision}))
}
