import {LearnLoopDomainError} from '../domain.js'
import type {LearnLoopSessionReader} from '../dsh-session-adapter.js'
import type {StateTable} from '../types.js'
import {activeProject,workspaceOf} from '../workspace.js'
import {materializeLessonSource,tasksOfPlan} from './capture.js'
import {completeLessonCapture,type LessonCaptureOutcome} from './generation.js'
import type {ContentRepository} from './repository.js'

/** Materialize one pending capture request: read the Session log, persist the immutable snapshot, commit the outcome. */
export async function runLessonCapture(table:StateTable,sessions:Pick<LearnLoopSessionReader,'assistantTextMessagesInSegments'>,repository:ContentRepository,input:{workspaceId:string;projectId:string;sessionId:string;captureId:string;idempotencyKey:string}):Promise<LessonCaptureOutcome>{
 const state=table.get('singleton')
 if(!state)throw new LearnLoopDomainError('PROJECT_NOT_FOUND','State missing.')
 const workspace=workspaceOf(state,input.workspaceId),project=activeProject(workspace)
 const capture=project.content.captureRequests.find(item=>item.id===input.captureId)
 if(!capture)throw new LearnLoopDomainError('CONTENT_JOB_NOT_FOUND','The capture request is missing.')
 if(capture.status==='ready'&&capture.sourceSnapshotId&&capture.sourceHash)return{status:'ready',sourceSnapshotId:capture.sourceSnapshotId,sourceHash:capture.sourceHash,relativePath:project.content.lessons[capture.taskId]?.source.sourceRelativePath??''}
 const task=tasksOfPlan(project).find(item=>item.id===capture.taskId)
 let outcome:LessonCaptureOutcome
 if(!task)outcome={status:'failed',code:'CONTENT_TASK_NOT_ELIGIBLE',message:'The task is no longer part of the active plan.'}
 else try{
  const {snapshot,relativePath}=await materializeLessonSource(workspace,project,task,capture.sourceSegments,sessions,repository)
  outcome={status:'ready',sourceSnapshotId:snapshot.id,sourceHash:snapshot.sourceHash,relativePath}
 }catch(error){
  outcome={status:'failed',code:error instanceof LearnLoopDomainError?error.code:'CONTENT_SOURCE_INVALID',message:error instanceof Error?error.message.split('\nLEARNLOOP_SAFE_ERROR:')[0]:'Source materialization failed.'}
 }
 await table.update('singleton',current=>completeLessonCapture(current,{workspaceId:input.workspaceId,projectId:input.projectId,sessionId:input.sessionId,captureId:input.captureId,expectedRevision:workspaceOf(current,input.workspaceId).revision,idempotencyKey:input.idempotencyKey,outcome}))
 return outcome
}
