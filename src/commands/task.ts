/** Task state transitions, plan-order selection, and check arming. */
import {closeOpenLessonSegment,openLessonSegment,passedTaskContent,tasksOfPlan} from '../content/capture.js'
import {interviewTopics, learnLoopStateSchema, type Assessment, type CriterionAssessment, type LearnerProfile, type LearningProject, type InterviewTopic, type InterviewProbeId, type LearningTask, type LearnLoopState, type CommandResult, type VerifiedTaskAssessment, type WorkspaceLearningState} from '../types.js'
import {fail,now} from './shared.js'
import {applyWorkspaceCommand} from './bus.js'
/** Statuses that unlock the next Task: verified, skipped, or studied without a check. */
export const DONE_TASK_STATUSES:readonly LearningTask['status'][]=['completed','skipped','studied']
/** Pure plan-order query: the blocked task, else the active task, else the first startable pending task. */
export function nextTaskByPlanOrder(project:LearningProject){const tasks=tasksOfPlan(project),blocked=tasks.find(t=>t.status==='blocked');if(blocked)return blocked;const active=tasks.find(t=>t.status==='active');if(active)return active;return tasks.find((task,index)=>task.status==='pending'&&(index===0||DONE_TASK_STATUSES.includes(tasks[index-1]!.status)))??null}
/** Public alias preserved for the HTTP projection field and existing consumers. */
export const nextAction=nextTaskByPlanOrder
/** Guard: a task may only become active when it is the plan-order successor and no check is unsettled. */
export function assertStartableTask(project:LearningProject,tasks:readonly LearningTask[],task:LearningTask,action:string){
 if(tasks.some(t=>t.id!==task.id&&['active','blocked'].includes(t.status)))fail('TASK_LOCKED','Another current task exists.');
 const index=tasks.findIndex(t=>t.id===task.id);if(index>0&&!DONE_TASK_STATUSES.includes(tasks[index-1]!.status))fail('TASK_LOCKED','Dependencies are incomplete.');
 if(action==='task:start'&&nextTaskByPlanOrder(project)?.id!==task.id)fail('TASK_LOCKED','Only the plan-order next Task can start.');
 if(project.evidenceCandidates.some(c=>c.status==='pending-verification')||project.execution&&['awaiting-answer','verifying','needs-revision'].includes(project.execution.phase))fail('TASK_LOCKED','A check is unsettled.');
}
function taskInput(state:LearnLoopState,input:{workspaceId:string;projectId:string;sessionId:string;taskId:string;expectedRevision:number;idempotencyKey:string;sessionSeq?:number|null},action:string,from:LearningTask['status'][],to:LearningTask['status']){return applyWorkspaceCommand(state,input,action,input,(w,p)=>{if(!p)fail('PROJECT_NOT_FOUND','Project missing.');const tasks=tasksOfPlan(p),task=tasks.find(t=>t.id===input.taskId);if(!task)fail('TASK_NOT_FOUND','Task missing.');if(!from.includes(task.status))fail('INVALID_TASK_TRANSITION',`${task.status} cannot transition to ${to}.`);if(to==='active'){assertStartableTask(p,tasks,task,action)}
 if(['task:pause','task:skip','task:restore'].includes(action)){
  if(p.execution&&['awaiting-answer','verifying'].includes(p.execution.phase))fail('INVALID_TASK_TRANSITION','The current check must settle before changing task state.');
  if(p.evidenceCandidates.some(c=>c.status==='pending-verification'))fail('CANDIDATE_NOT_READY','A verification candidate must settle before changing task state.');
 }
 if(action==='task:restore'){
  const later=tasks.slice(tasks.findIndex(t=>t.id===task.id)+1);
  const unsafe=later.some(t=>['active','blocked','completed','studied'].includes(t.status))||p.assessments.some(a=>later.some(t=>t.id===a.taskId))||p.evidence.some(e=>{const assessment=p.assessments.find(a=>a.id===e.assessmentId);return Boolean(assessment&&later.some(t=>t.id===assessment.taskId))});
  if(unsafe)fail('TASK_LOCKED','A dependent task has already advanced; restoring this task would reverse causality.');
 }
 const at=now(),plans=p.plans.map(plan=>plan.id===p.activePlanId?{...plan,stages:plan.stages.map(stage=>({...stage,tasks:stage.tasks.map(t=>t.id===task.id?{...t,status:to}:t)}))}:plan);
 const priorSegments=p.execution?.taskId===task.id?p.execution.sourceSegments:[];
 const execution=to==='active'?{taskId:task.id,phase:'teaching' as const,isReview:false,attempt:p.execution?.taskId===task.id?p.execution.attempt:0,armedAfterSeq:null,candidateId:null,lastAssessmentId:p.execution?.taskId===task.id?p.execution.lastAssessmentId:null,sourceSegments:openLessonSegment(priorSegments,input.sessionId,'teaching',input.sessionSeq??null,at),updatedAt:at}:p.execution?.taskId===task.id?{...p.execution,phase:'paused' as const,armedAfterSeq:null,sourceSegments:input.sessionSeq==null?p.execution.sourceSegments:closeOpenLessonSegment(p.execution.sourceSegments,input.sessionSeq),updatedAt:at}:p.execution;
 return{...w,projects:{...w.projects,[p.id]:{...p,plans,execution,updatedAt:at}}}})}
export const startTask=(s:LearnLoopState,i:Parameters<typeof taskInput>[1])=>taskInput(s,i,'task:start',['pending'],'active');
export const pauseTask=(s:LearnLoopState,i:Parameters<typeof taskInput>[1])=>taskInput(s,i,'task:pause',['active'],'blocked');
export const resumeTask=(s:LearnLoopState,i:Parameters<typeof taskInput>[1])=>taskInput(s,i,'task:resume',['blocked'],'active');
export const skipTask=(s:LearnLoopState,i:Parameters<typeof taskInput>[1])=>taskInput(s,i,'task:skip',['active','blocked'],'skipped');
export const restoreSkippedTask=(s:LearnLoopState,i:Parameters<typeof taskInput>[1])=>taskInput(s,i,'task:restore',['skipped'],'pending');
/** Takes the check of a studied Task later: it becomes the current Task again, in teaching. */
export const recheckTask=(s:LearnLoopState,i:Parameters<typeof taskInput>[1])=>taskInput(s,i,'task:recheck',['studied'],'active');
/**
 * The learner finishes the current Task without a check: it unlocks the next Task like a pass, but
 * writes no assessment, evidence, or mastery, so the concept stays at its current level.
 */
export function finishTaskWithoutCheck(state:LearnLoopState,input:Parameters<typeof taskInput>[1]){
 return applyWorkspaceCommand(state,input,'task:finish-without-check',input,(w,p)=>{
  if(!p?.execution||p.execution.taskId!==input.taskId)fail('TASK_NOT_FOUND','Current task missing.')
  const tasks=tasksOfPlan(p),task=tasks.find(t=>t.id===input.taskId)
  if(!task||task.status!=='active')fail('INVALID_TASK_TRANSITION','Only the active task can be finished without a check.')
  if(!['teaching','awaiting-answer','needs-revision'].includes(p.execution.phase)||p.execution.candidateId||p.evidenceCandidates.some(c=>c.status==='pending-verification'))fail('CANDIDATE_NOT_READY','A captured answer must settle first.')
  const at=now()
  const plans=p.plans.map(plan=>plan.id===p.activePlanId?{...plan,stages:plan.stages.map(stage=>({...stage,tasks:stage.tasks.map(t=>t.id===task.id?{...t,status:'studied' as const}:t)}))}:plan)
  return{...w,projects:{...w.projects,[p.id]:{...p,plans,execution:{...p.execution,phase:'studied' as const,armedAfterSeq:null,candidateId:null,sourceSegments:input.sessionSeq==null?p.execution.sourceSegments:closeOpenLessonSegment(p.execution.sourceSegments,input.sessionSeq),updatedAt:at},updatedAt:at}}}
 })
}
export function beginTaskCheck(state:LearnLoopState,input:Parameters<typeof taskInput>[1]&{armedAfterSeq:number}){
 return applyWorkspaceCommand(state,input,'task:begin-check',input,(w,p)=>{
  if(!p?.execution||p.execution.taskId!==input.taskId)fail('TASK_NOT_FOUND','Current task missing.')
  const tasks=tasksOfPlan(p),task=tasks.find(t=>t.id===input.taskId)
  const isReview=p.execution.isReview
  if(!task)fail('TASK_NOT_FOUND','Task missing.')
  if(!isReview&&(task.status!=='active'||tasks.filter(t=>t.status==='active').length!==1))fail('INVALID_TASK_TRANSITION','Check requires the unique active task.')
  if(isReview&&task.status!=='completed')fail('INVALID_TASK_TRANSITION','Review check requires a completed task.')
  if(!['teaching','needs-revision'].includes(p.execution.phase)||p.evidenceCandidates.some(c=>c.status==='pending-verification'))fail('CHECK_ALREADY_ARMED','A check is already in progress.')
  if(!task.acceptanceCriteria.length)fail('ASSESSMENT_INVALID','Task has no criteria.')
  const project={...p,execution:{...p.execution,phase:'awaiting-answer' as const,armedAfterSeq:input.armedAfterSeq,candidateId:null,sourceSegments:closeOpenLessonSegment(p.execution.sourceSegments,input.armedAfterSeq),updatedAt:now()}}
  return{...w,projects:{...w.projects,[p.id]:project}}
 })
}
export function cancelTaskCheck(state:LearnLoopState,input:Parameters<typeof taskInput>[1]){
 return applyWorkspaceCommand(state,input,'task:cancel-check',input,(w,p)=>{
  if(!p?.execution||p.execution.taskId!==input.taskId||p.execution.phase!=='awaiting-answer'||p.execution.candidateId||p.evidenceCandidates.some(c=>c.status==='pending-verification'))fail('INVALID_TASK_TRANSITION','Only an unanswered check can be cancelled.')
  return{...w,projects:{...w.projects,[p.id]:{...p,execution:{...p.execution,phase:'teaching',armedAfterSeq:null,sourceSegments:openLessonSegment(p.execution.sourceSegments,input.sessionId,'teaching',input.sessionSeq??null),updatedAt:now()}}}}
 })
}
