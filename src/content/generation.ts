import {randomUUID} from 'node:crypto'
import {LearnLoopDomainError} from '../domain.js'
import {toolAllowed} from '../tool-protocol.js'
import type {LearnLoopState,LearningProject,LearningTask} from '../types.js'
import {applyWorkspaceCommand,activeProject,workspaceForSession,workspaceOf} from '../workspace.js'
import {acceptedAssessmentForTask,lessonCaptureForTask,tasksOfPlan} from './capture.js'
import type {CaptureRequest,ExportRecord,GenerationJob,LessonDocument} from './schemas.js'

const now=()=>new Date().toISOString()
const uid=(prefix:string)=>`${prefix}_${randomUUID()}`
const fail=(code:ConstructorParameters<typeof LearnLoopDomainError>[0],message:string):never=>{throw new LearnLoopDomainError(code,message)}

export const activeGenerationJob=(project:LearningProject)=>project.content.generationJobs.find(job=>job.id===project.content.activeGenerationJobId)??null

/** A task may generate an article only after a formally verified pass. */
export function lessonEligibleTasks(project:LearningProject):LearningTask[]{
 return tasksOfPlan(project).filter(task=>task.status==='completed'&&acceptedAssessmentForTask(project,task.id))
}

function resolveTargets(project:LearningProject,taskId:string|undefined):LearningTask[]{
 const eligible=lessonEligibleTasks(project)
 if(taskId){const task=eligible.find(item=>item.id===taskId);if(!task)fail('CONTENT_TASK_NOT_ELIGIBLE','Article generation requires a task that passed formal verification.');return[task]}
 const tasks=eligible.filter(task=>project.content.lessons[task.id]?.documents.shareable?.status!=='final')
 if(!tasks.length)fail('CONTENT_TASK_NOT_ELIGIBLE','Every verified task already has a final article; regenerate a specific task instead.')
 return tasks
}

const latestCapture=(project:LearningProject,taskId:string)=>project.content.captureRequests.filter(request=>request.taskId===taskId).at(-1)

function captureFor(project:LearningProject,workspaceId:string,task:LearningTask,plan:{id:string;version:number},attempt:number,at:string):CaptureRequest{
 const prior=latestCapture(project,task.id)
 const accepted=acceptedAssessmentForTask(project,task.id)!
 return{id:uid('capture'),workspaceId,projectId:project.id,planId:plan.id,planVersion:plan.version,taskId:task.id,conceptId:task.conceptId,assessmentId:accepted.id,sourceSegments:prior?.sourceSegments??[],status:'pending',attempt,sourceSnapshotId:null,sourceHash:null,lastError:null,createdAt:at,updatedAt:at}
}

export interface ArticleGenerationInput{workspaceId:string;projectId:string;sessionId:string;taskId?:string;expectedRevision:number;idempotencyKey:string}

/**
 * Create or resume the single project generation job. Repeating an already-covered request is a
 * recorded no-op (`started:false`) so duplicate clicks never reach the model twice.
 */
export function requestArticleGeneration(state:LearnLoopState,input:ArticleGenerationInput){
 let started=false
 const next=applyWorkspaceCommand(state,{workspaceId:input.workspaceId,projectId:input.projectId,sessionId:input.sessionId,expectedRevision:input.expectedRevision,idempotencyKey:input.idempotencyKey},'content:generate-articles',{taskId:input.taskId??null},(ws,project)=>{
  if(!project)fail('PROJECT_NOT_FOUND','Project missing.')
  if(!['active','completed'].includes(project.phase))fail('INVALID_PROJECT_PHASE','Article generation requires an active learning plan.')
  const at=now(),targets=resolveTargets(project,input.taskId),plan=project.plans.find(item=>item.id===project.activePlanId)!
  const content=project.content,active=activeGenerationJob(project)
  const coveredBy=(job:GenerationJob)=>targets.every(task=>job.pendingTaskIds.includes(task.id)||job.completedTaskIds.includes(task.id)||job.currentTaskId===task.id)
  if(active&&['queued','running'].includes(active.status)){
   if(coveredBy(active))return ws
   fail('CONTENT_JOB_ALREADY_RUNNING','Another article generation is already running for this project.')
  }
  const captureRequests=[...content.captureRequests]
  const ensureCapture=(task:LearningTask)=>{const prior=latestCapture(project,task.id),lesson=project.content.lessons[task.id];if(lesson?.source.status==='ready'&&prior?.status==='ready')return;if(prior?.status==='pending')return;captureRequests.push(captureFor(project,ws.workspaceId,task,plan,(prior?.attempt??0)+1,at))}
  let jobs:GenerationJob[],job:GenerationJob
  const failed=active?.status==='failed'?active:content.generationJobs.filter(item=>item.status==='failed').at(-1)??null
  if(failed&&coveredBy(failed)){
   const remaining=[...(failed.currentTaskId?[failed.currentTaskId]:[]),...failed.pendingTaskIds]
   for(const id of remaining){const task=targets.find(item=>item.id===id)??lessonEligibleTasks(project).find(item=>item.id===id);if(task)ensureCapture(task)}
   job={...failed,status:'running',attempt:failed.attempt+1,lastError:null,currentTaskId:remaining[0]??null,pendingTaskIds:remaining.slice(1),sessionId:input.sessionId,updatedAt:at}
   jobs=content.generationJobs.map(item=>item.id===job.id?job:item);started=true
  }else{
   for(const task of targets)ensureCapture(task)
   job={id:uid('job'),workspaceId:ws.workspaceId,projectId:project.id,planId:plan.id,planVersion:plan.version,sessionId:input.sessionId,audience:'shareable',language:state.settings.language,status:'running',pendingTaskIds:targets.slice(1).map(task=>task.id),completedTaskIds:[],failedItems:[],currentTaskId:targets[0]!.id,attempt:0,lastError:null,createdAt:at,updatedAt:at}
   jobs=[...content.generationJobs,job];started=true
  }
  const lessons={...content.lessons}
  for(const task of targets)if(!lessons[task.id])lessons[task.id]={taskId:task.id,lessonId:uid('lesson'),source:{status:'pending',sourceSnapshotId:null,sourceRelativePath:null,sourceHash:null,lastErrorCode:null},documents:{private:null,shareable:null},updatedAt:at}
  return{...ws,projects:{...ws.projects,[project.id]:{...project,content:{...content,lessons,captureRequests,generationJobs:jobs,activeGenerationJobId:job.id},updatedAt:at}}}
 },workspace=>({kind:'article-generation-requested',jobId:workspace.projects[input.projectId]!.content.activeGenerationJobId!,taskIds:(()=>{const job=workspace.projects[input.projectId]!.content.generationJobs.find(item=>item.id===workspace.projects[input.projectId]!.content.activeGenerationJobId)!;return[...(job.currentTaskId?[job.currentTaskId]:[]),...job.pendingTaskIds]})(),resumed:workspace.projects[input.projectId]!.content.generationJobs.find(item=>item.id===workspace.projects[input.projectId]!.content.activeGenerationJobId)!.attempt>0,started,workspaceRevision:workspace.revision}))
 return next
}

/** Receipt-aware readback for the HTTP layer: did this request start work the chat turn must drive? */
export function articleGenerationReceipt(state:LearnLoopState,workspaceId:string,idempotencyKey:string){
 const receipt=state.commandReceipts.find(item=>item.workspaceId===workspaceId&&item.idempotencyKey===idempotencyKey)
 return receipt?.result?.kind==='article-generation-requested'?receipt.result:null
}

export type LessonCaptureOutcome={status:'ready';sourceSnapshotId:string;sourceHash:string;relativePath:string}|{status:'failed';code:string;message:string}

/** Commit the result of snapshot materialization; failure fails the owning job while preserving completed lessons. */
export function completeLessonCapture(state:LearnLoopState,input:{workspaceId:string;projectId:string;sessionId:string;captureId:string;expectedRevision:number;idempotencyKey:string;outcome:LessonCaptureOutcome}){
 return applyWorkspaceCommand(state,{workspaceId:input.workspaceId,projectId:input.projectId,sessionId:input.sessionId,expectedRevision:input.expectedRevision,idempotencyKey:input.idempotencyKey},'content:lesson-capture',{captureId:input.captureId,status:input.outcome.status},(ws,project)=>{
  if(!project)fail('PROJECT_NOT_FOUND','Project missing.')
  const at=now(),content=project.content,capture=content.captureRequests.find(item=>item.id===input.captureId)
  if(!capture)fail('CONTENT_JOB_NOT_FOUND','The capture request is missing.')
  const outcome=input.outcome,ready=outcome.status==='ready'
  const patch=outcome.status==='ready'?{status:'ready' as const,sourceSnapshotId:outcome.sourceSnapshotId,sourceHash:outcome.sourceHash,lastError:null}:{status:'failed' as const,sourceSnapshotId:null,sourceHash:null,lastError:{code:outcome.code,message:outcome.message}}
  const captureRequests=content.captureRequests.map(item=>item.id===capture.id?{...item,...patch,updatedAt:at}:item)
  const lesson=content.lessons[capture.taskId]
  const sourcePatch=outcome.status==='ready'?{status:'ready' as const,sourceSnapshotId:outcome.sourceSnapshotId,sourceRelativePath:outcome.relativePath,sourceHash:outcome.sourceHash,lastErrorCode:null}:{status:'failed' as const,sourceSnapshotId:null,sourceRelativePath:null,sourceHash:null,lastErrorCode:outcome.code}
  const lessons=lesson?{...content.lessons,[capture.taskId]:{...lesson,source:sourcePatch,updatedAt:at}}:content.lessons
  let generationJobs=content.generationJobs,activeGenerationJobId=content.activeGenerationJobId
  const job=activeGenerationJob(project)
  if(!ready&&job&&job.currentTaskId===capture.taskId&&outcome.status==='failed'){generationJobs=content.generationJobs.map(item=>item.id===job.id?{...item,status:'failed' as const,lastError:{code:outcome.code,message:outcome.message},failedItems:[...item.failedItems,{taskId:capture.taskId,errorCode:outcome.code}],updatedAt:at}:item);activeGenerationJobId=null}
  return{...ws,projects:{...ws.projects,[project.id]:{...project,content:{...content,lessons,captureRequests,generationJobs,activeGenerationJobId},updatedAt:at}}}
 },workspace=>({kind:'lesson-capture-completed',captureId:input.captureId,taskId:workspace.projects[input.projectId]!.content.captureRequests.find(item=>item.id===input.captureId)!.taskId,status:input.outcome.status,sourceSnapshotId:input.outcome.status==='ready'?input.outcome.sourceSnapshotId:null,workspaceRevision:workspace.revision}))
}

/** Startup recovery: interrupted jobs and captures become explicitly failed so the learner can retry. */
export function reconcileContentJobs(state:LearnLoopState):LearnLoopState{
 let next=state
 for(const workspace of Object.values(state.workspaces)){
  for(const project of Object.values(workspace.projects)){
   const content=project.content,job=activeGenerationJob(project)
   const staleJob=job&&['queued','running','paused'].includes(job.status)
   const staleCaptures=content.captureRequests.filter(item=>item.status==='materializing')
   if(!staleJob&&!staleCaptures.length)continue
   const at=now(),interrupted={code:'CONTENT_JOB_NOT_RUNNING',message:'文章生成被重启中断，请重试。 / Article generation was interrupted by a restart; retry.'}
   const current=next.workspaces[workspace.workspaceId]!.projects[project.id]!
   next={...next,workspaces:{...next.workspaces,[workspace.workspaceId]:{...next.workspaces[workspace.workspaceId]!,projects:{...next.workspaces[workspace.workspaceId]!.projects,[project.id]:{...current,content:{...current.content,captureRequests:current.content.captureRequests.map(item=>item.status==='materializing'?{...item,status:'failed' as const,lastError:interrupted,updatedAt:at}:item),generationJobs:current.content.generationJobs.map(item=>staleJob&&item.id===job.id?{...item,status:'failed' as const,lastError:interrupted,updatedAt:at}:item),activeGenerationJobId:staleJob?null:current.content.activeGenerationJobId},updatedAt:at}}}}}
  }
 }
 return next
}

/** Exposed for the UI: per-task article status derived from Host state. */
export function lessonArticleStatus(project:LearningProject,taskId:string):{status:'none'|'capturing'|'ready'|'failed'|'generating'|'final';error:string|null}{
 const lesson=project.content.lessons[taskId],job=activeGenerationJob(project)
 if(job&&['queued','running'].includes(job.status)&&(job.currentTaskId===taskId||job.pendingTaskIds.includes(taskId)))return{status:'generating',error:null}
 if(lesson?.documents.shareable?.status==='final')return{status:'final',error:null}
 const capture=lessonCaptureForTask(project,taskId)
 if(capture?.status==='failed'||lesson?.source.status==='failed')return{status:'failed',error:capture?.lastError?.message??lesson?.source.lastErrorCode??'failed'}
 const failed=project.content.generationJobs.filter(item=>item.status==='failed').flatMap(item=>item.failedItems).find(item=>item.taskId===taskId)
 if(failed)return{status:'failed',error:failed.errorCode}
 if(lesson?.source.status==='ready'&&project.content.generationJobs.some(item=>item.completedTaskIds.includes(taskId)||item.currentTaskId===taskId||item.pendingTaskIds.includes(taskId)))return{status:'ready',error:null}
 return{status:'none',error:null}
}

export const lessonDocumentReceiptKey=(callId:string)=>`lesson-document:${callId}`

/** Persist an export record so retries replay without rewriting files and downloads survive restarts. */
export function recordArticleExport(state:LearnLoopState,input:{workspaceId:string;projectId:string;sessionId:string;expectedRevision:number;record:ExportRecord}){
 return applyWorkspaceCommand(state,{workspaceId:input.workspaceId,projectId:input.projectId,sessionId:input.sessionId,expectedRevision:input.expectedRevision,idempotencyKey:input.record.idempotencyKey},'content:export-articles',{scope:input.record.scope,taskId:input.record.taskId},(ws,project)=>{
  if(!project)fail('PROJECT_NOT_FOUND','Project missing.')
  const at=now()
  return{...ws,projects:{...ws.projects,[project.id]:{...project,content:{...project.content,exports:[...project.content.exports,input.record]},updatedAt:at}}}
 },workspace=>({kind:'articles-exported',exportId:input.record.id,scope:input.record.scope,exportDirectory:input.record.exportDirectory,zipFileName:input.record.zipFileName,lessonIds:input.record.lessonIds,workspaceRevision:workspace.revision}))
}

export const articleExportReceipt=(state:LearnLoopState,workspaceId:string,idempotencyKey:string)=>state.commandReceipts.find(item=>item.workspaceId===workspaceId&&item.idempotencyKey===idempotencyKey&&item.action==='content:export-articles')??null

/** Commit a Host-validated lesson document: update the reference and advance the generation job atomically. */
export function commitLessonDocument(state:LearnLoopState,input:{sessionId:string;callId:string;document:LessonDocument;relativePath:string}){
 const w=workspaceForSession(state,input.sessionId),p=activeProject(w),key=lessonDocumentReceiptKey(input.callId)
 if(!state.commandReceipts.some(r=>r.workspaceId===w.workspaceId&&r.idempotencyKey===key)&&!toolAllowed('learnloop_write_lesson_document',p,'executable'))fail('INVALID_PROJECT_PHASE','This tool is not allowed in the current LearnLoop phase.')
 let committed:{jobId:string;jobStatus:'running'|'completed'|'failed';nextTaskId:string|null}|null=null
 return applyWorkspaceCommand(state,{workspaceId:w.workspaceId,projectId:p.id,sessionId:input.sessionId,expectedRevision:w.revision,idempotencyKey:key},'content:write-lesson',{taskId:input.document.taskId,contentHash:input.document.contentHash,contentRevision:input.document.contentRevision},(ws,project)=>{
  if(!project)fail('PROJECT_NOT_FOUND','Project missing.')
  const at=now(),content=project.content,job=content.generationJobs.find(item=>item.id===content.activeGenerationJobId)
  if(!job||job.status!=='running'||job.currentTaskId!==input.document.taskId)fail('CONTENT_JOB_NOT_RUNNING','The generation job is not running for this task.')
  const lesson=content.lessons[input.document.taskId]
  if(!lesson||lesson.source.status!=='ready')fail('CONTENT_SOURCE_NOT_READY','The lesson source snapshot is not ready.')
  const reference={lessonId:lesson.lessonId,contentRevision:input.document.contentRevision,slug:input.document.slug,relativePath:input.relativePath,sourceHash:lesson.source.sourceHash!,contentHash:input.document.contentHash,status:'final' as const,updatedAt:at}
  const nextTaskId=job.pendingTaskIds[0]??null
  const advanced={...job,status:nextTaskId?'running' as const:'completed' as const,completedTaskIds:[...job.completedTaskIds,input.document.taskId],pendingTaskIds:job.pendingTaskIds.slice(1),currentTaskId:nextTaskId,updatedAt:at}
  committed={jobId:job.id,jobStatus:advanced.status,nextTaskId}
  return{...ws,projects:{...ws.projects,[project.id]:{...project,content:{...content,lessons:{...content.lessons,[input.document.taskId]:{...lesson,documents:{...lesson.documents,shareable:reference},updatedAt:at}},generationJobs:content.generationJobs.map(item=>item.id===job.id?advanced:item),activeGenerationJobId:nextTaskId?job.id:null},updatedAt:at}}}
 },workspace=>({kind:'lesson-document-written',jobId:committed?.jobId??'',taskId:input.document.taskId,lessonId:input.document.id,contentRevision:input.document.contentRevision,jobStatus:committed?.jobStatus??'failed',nextTaskId:committed?.nextTaskId??null,workspaceRevision:workspace.revision}))
}
