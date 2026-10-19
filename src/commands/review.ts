/** Spaced-review commands: start and cancel a review session for a completed task. */
import {tasksOfPlan} from '../content/capture.js'
import type {LearnLoopState, LearningProject, Mastery} from '../types.js'
import {fail,now,workspaceForSession,activeProject} from './shared.js'
import {applyWorkspaceCommand} from './bus.js'
import {nextReviewIso} from '../review-policy.js'

export {REVIEW_POLICY_VERSION} from '../review-policy.js'

/**
 * Start a spaced review for a completed task.
 *
 * The task stays `completed`; execution is set to a review execution (isReview: true)
 * so the standard check flow (begin-task-check → answer → assess) runs against it.
 * The task may not have an active or pending check. A review cannot preempt teaching.
 */
export function startReview(state:LearnLoopState,input:{sessionId:string;taskId:string;expectedWorkspaceRevision:number;idempotencyKey:string}){
 const w=workspaceForSession(state,input.sessionId),p=activeProject(w)
 if(p.phase!=='active'&&p.phase!=='paused')fail('INVALID_PROJECT_PHASE','Reviews require an active or paused project.')
 if(p.execution&&!['passed','studied'].includes(p.execution.phase))fail('REVIEW_CONFLICT','A task is already in progress; complete or pause it first.')
 if(p.evidenceCandidates.some(c=>c.status==='pending-verification'))fail('REVIEW_CONFLICT','A pending verification must settle before starting a review.')
 if(p.activeReviewTaskId)fail('REVIEW_CONFLICT','Another review is already active.')
 return applyWorkspaceCommand(state,{workspaceId:w.workspaceId,projectId:p.id,sessionId:input.sessionId,expectedRevision:input.expectedWorkspaceRevision,idempotencyKey:input.idempotencyKey},'review:start',{taskId:input.taskId},(ws,project)=>{
  const tasks=tasksOfPlan(project!)
  const task=tasks.find(t=>t.id===input.taskId)
  if(!task)fail('TASK_NOT_FOUND','Task not found.')
  if(task.status!=='completed')fail('REVIEW_NOT_ELIGIBLE','Only completed tasks can be reviewed.')
  if(!task.acceptanceCriteria.length)fail('ASSESSMENT_INVALID','Task has no acceptance criteria.')
  const at=now()
  const execution={taskId:task.id,phase:'teaching' as const,isReview:true,attempt:0,armedAfterSeq:null,candidateId:null,lastAssessmentId:null,sourceSegments:[],updatedAt:at}
  return{...ws,projects:{...ws.projects,[project!.id]:{...project!,execution,activeReviewTaskId:task.id,updatedAt:at}}}
 })
}

/**
 * Cancel an active review without recording any outcome.
 * The task stays completed and nextReviewAt is unchanged.
 */
export function cancelReview(state:LearnLoopState,input:{sessionId:string;expectedWorkspaceRevision:number;idempotencyKey:string}){
 const w=workspaceForSession(state,input.sessionId),p=activeProject(w)
 if(!p.activeReviewTaskId||!p.execution?.isReview)fail('REVIEW_CONFLICT','No review is active.')
 return applyWorkspaceCommand(state,{workspaceId:w.workspaceId,projectId:p.id,sessionId:input.sessionId,expectedRevision:input.expectedWorkspaceRevision,idempotencyKey:input.idempotencyKey},'review:cancel',{},(ws,project)=>{
  const at=now()
  return{...ws,projects:{...ws.projects,[project!.id]:{...project!,execution:null,activeReviewTaskId:null,updatedAt:at}}}
 })
}

/**
 * Update nextReviewAt after a review assessment settled (called from assessCurrentCandidate).
 * Does not touch the task status; clears activeReviewTaskId.
 * evidenceCount: total evidence items for the concept *after* the new one was appended.
 */
export function applyReviewSchedule(mastery:readonly Mastery[],conceptId:string,passed:boolean,evidenceCount:number,at:string):Mastery[]{
 return mastery.map(row=>{
  if(row.conceptId!==conceptId)return row
  // On needs-work: reset to 1-day interval (evidenceCount=0). On pass/excellent: use full count.
  const countForSchedule=passed?evidenceCount:0
  return{...row,nextReviewAt:nextReviewIso(countForSchedule,at),updatedAt:at}
 })
}

