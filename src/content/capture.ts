import {LearnLoopDomainError,payloadHash} from '../domain.js'
import type {LearnLoopSessionReader} from '../dsh-session-adapter.js'
import type {Assessment,LearningProject,LearningTask,WorkspaceLearningState} from '../types.js'
import {canonicalHash,canonicalJson} from './hash.js'
import {ContentRepository} from './repository.js'
import {lessonSourceSnapshotSchema,type CaptureRequest,type LessonSourceMessage,type LessonSourceSegment,type LessonSourceSnapshot,type ProjectContentIndex} from './schemas.js'

const now=()=>new Date().toISOString()

/** Open a new teaching segment unless one is already open for this phase; a missing sequence (tests, detached sessions) records nothing. */
export function openLessonSegment(segments:readonly LessonSourceSegment[],sessionId:string,phase:LessonSourceSegment['phase'],fromExclusiveSeq:number|null,at=now()):LessonSourceSegment[]{
 const last=segments.at(-1)
 if(last&&last.toInclusiveSeq===null&&last.phase===phase)return[...segments]
 if(fromExclusiveSeq===null||fromExclusiveSeq===undefined)return[...segments]
 const closed=last&&last.toInclusiveSeq===null?[...segments.slice(0,-1),{...last,toInclusiveSeq:Math.max(last.fromExclusiveSeq,fromExclusiveSeq)}]:[...segments]
 return[...closed,{sessionId,phase,fromExclusiveSeq,toInclusiveSeq:null,createdAt:at}]
}
/** Close the trailing open segment at a deterministic bound. */
export function closeOpenLessonSegment(segments:readonly LessonSourceSegment[],toInclusiveSeq:number):LessonSourceSegment[]{
 const last=segments.at(-1)
 if(!last||last.toInclusiveSeq!==null)return[...segments]
 return[...segments.slice(0,-1),{...last,toInclusiveSeq:Math.max(last.fromExclusiveSeq,toInclusiveSeq)}]
}

export const acceptedAssessmentForTask=(project:LearningProject,taskId:string)=>project.assessments.filter(a=>a.taskId===taskId&&a.result!=='needs-work').at(-1)??null
export const tasksOfPlan=(project:LearningProject)=>project.plans.find(plan=>plan.id===project.activePlanId)?.stages.flatMap(stage=>stage.tasks)??[]

/** Misconceptions recorded by failed attempts of this task that the accepted assessment no longer reports. */
export function resolvedMisconceptionsForTask(project:LearningProject,taskId:string,accepted:Assessment):string[]{
 const failed=project.assessments.filter(a=>a.taskId===taskId&&a.result==='needs-work').flatMap(a=>a.misconceptions)
 return[...new Set(failed.filter(item=>item&&!accepted.misconceptions.includes(item)))].slice(0,20)
}

export function lessonCaptureForTask(project:LearningProject,taskId:string):CaptureRequest|undefined{
 return project.content.captureRequests.filter(request=>request.taskId===taskId).at(-1)
}

/**
 * A passed task records its closed teaching segments into a durable capture request, so article
 * generation survives later execution resets. Re-passing with unchanged segments keeps the ready source.
 */
export function passedTaskContent(content:ProjectContentIndex,workspaceId:string,project:LearningProject,task:LearningTask,assessmentId:string,segments:readonly LessonSourceSegment[],at=now()):ProjectContentIndex{
 const plan=project.plans.find(item=>item.id===project.activePlanId)
 if(!plan)return content
 const prior=lessonCaptureForTask(project,task.id)
 if(prior?.status==='ready'&&canonicalJson(prior.sourceSegments)===canonicalJson(segments))return content
 const capture:CaptureRequest={id:`capture_${canonicalHash({projectId:project.id,taskId:task.id,segments}).slice(0,24)}`,workspaceId,projectId:project.id,planId:plan.id,planVersion:plan.version,taskId:task.id,conceptId:task.conceptId,assessmentId,sourceSegments:[...segments],status:'pending',attempt:(prior?.attempt??0)+1,sourceSnapshotId:null,sourceHash:null,lastError:null,createdAt:at,updatedAt:at}
 const existing=content.lessons[task.id]
 const lesson=existing?{...existing,source:{status:'pending' as const,sourceSnapshotId:null,sourceRelativePath:null,sourceHash:null,lastErrorCode:null},updatedAt:at}:{taskId:task.id,lessonId:`lesson_${canonicalHash({projectId:project.id,taskId:task.id}).slice(0,24)}`,source:{status:'pending' as const,sourceSnapshotId:null,sourceRelativePath:null,sourceHash:null,lastErrorCode:null},documents:{private:null,shareable:null},updatedAt:at}
 return{...content,lessons:{...content.lessons,[task.id]:lesson},captureRequests:[...content.captureRequests.filter(request=>!(request.taskId===task.id&&request.status!=='ready')),capture]}
}

interface SnapshotContent{planId:string;planVersion:number;taskId:string;conceptId:string;taskSnapshot:{title:string;objective:string;activity:LearningTask['activity'];acceptanceCriteria:string[];checkPrompt:string};teachingMessages:LessonSourceMessage[];revisionMessages:LessonSourceMessage[];acceptedAssessment:{assessmentId:string;result:'passed'|'excellent';criteria:Assessment['criteria'];feedback:string};resolvedMisconceptions:string[];acceptedEvidenceIds:string[]}

/** Build the deterministic private source snapshot for one passed task. */
export function buildLessonSourceSnapshot(workspace:WorkspaceLearningState,project:LearningProject,task:LearningTask,content:SnapshotContent,at=now()):LessonSourceSnapshot{
 const sourceHash=canonicalHash({...content,sourcePolicyVersion:'learnloop-source-v1'})
 return lessonSourceSnapshotSchema.parse({schemaVersion:1,id:`snapshot-${sourceHash.slice(0,16)}`,workspaceId:workspace.workspaceId,projectId:project.id,createdAt:at,...content,sourcePolicyVersion:'learnloop-source-v1',sourceHash})
}

export const lessonSourceRelativePath=(snapshot:LessonSourceSnapshot)=>`sources/${snapshot.sourceHash.slice(0,20)}.json`

export interface LessonMaterialization {snapshot:LessonSourceSnapshot;relativePath:string}

/** Read the bounded assistant teaching text for closed segments and persist the immutable private snapshot. */
export async function materializeLessonSource(workspace:WorkspaceLearningState,project:LearningProject,task:LearningTask,segments:readonly LessonSourceSegment[],sessions:Pick<LearnLoopSessionReader,'assistantTextMessagesInSegments'>,repository:ContentRepository):Promise<LessonMaterialization>{
 const accepted=acceptedAssessmentForTask(project,task.id)
 if(!accepted)throw new LearnLoopDomainError('CONTENT_TASK_NOT_ELIGIBLE','The task has no accepted assessment.')
 if(accepted.result==='needs-work')throw new LearnLoopDomainError('CONTENT_TASK_NOT_ELIGIBLE','The task has no accepted assessment.')
 const plan=project.plans.find(item=>item.id===project.activePlanId)
 if(!plan)throw new LearnLoopDomainError('PLAN_NOT_PUBLISHED','The active plan is missing.')
 const bound=Math.max(0,accepted.verifier.assistantMessageEventSeq,...segments.map(s=>s.toInclusiveSeq??0))
 const closed=closeOpenLessonSegment(segments,bound)
 const teachingSegments=closed.filter(s=>s.phase==='teaching'),revisionSegments=closed.filter(s=>s.phase==='needs-revision')
 const teachingMessages=sessions.assistantTextMessagesInSegments(teachingSegments),revisionMessages=sessions.assistantTextMessagesInSegments(revisionSegments)
 if(!teachingMessages||!revisionMessages)throw new LearnLoopDomainError('CONTENT_SOURCE_MISSING','The teaching messages for this task are no longer available in the Session.')
 const snapshot=buildLessonSourceSnapshot(workspace,project,task,{planId:plan.id,planVersion:plan.version,taskId:task.id,conceptId:task.conceptId,taskSnapshot:{title:task.title,objective:task.objective,activity:task.activity,acceptanceCriteria:task.acceptanceCriteria,checkPrompt:task.checkPrompt},teachingMessages:[...teachingMessages],revisionMessages:[...revisionMessages],acceptedAssessment:{assessmentId:accepted.id,result:accepted.result,criteria:accepted.criteria,feedback:accepted.feedback},resolvedMisconceptions:resolvedMisconceptionsForTask(project,task.id,accepted),acceptedEvidenceIds:project.evidence.filter(item=>item.assessmentId===accepted.id).map(item=>item.id)})
 const relativePath=lessonSourceRelativePath(snapshot)
 const existing=await repository.readJson(relativePath,lessonSourceSnapshotSchema).catch(()=>null)
 if(existing&&existing.sourceHash===snapshot.sourceHash)return{snapshot:existing,relativePath}
 await repository.atomicWriteJsonIdempotent(relativePath,snapshot,lessonSourceSnapshotSchema)
 return{snapshot,relativePath}
}

/** Private values a generated article must never contain, derived from Host-owned facts. */
export function privateValuesForLesson(workspace:WorkspaceLearningState,project:LearningProject,taskId:string):string[]{
 const values:string[]=[workspace.workspaceId,project.id]
 for(const candidate of project.evidenceCandidates.filter(c=>c.taskId===taskId))values.push(candidate.answerText)
 const lesson=project.content.lessons[taskId];if(lesson)values.push(lesson.lessonId)
 return values.filter(value=>value.trim().length>=8)
}

/** Stable content fingerprint of a generated document, excluding volatile timestamps. */
export const lessonContentHash=(document:{id:string;contentRevision:number;title:string;summary:string;learningObjectives:string[];prerequisites:string[];sections:unknown;keyTakeaways:string[];glossary:unknown;reviewQuestions:unknown;references:unknown;language:string})=>payloadHash({id:document.id,contentRevision:document.contentRevision,title:document.title,summary:document.summary,learningObjectives:document.learningObjectives,prerequisites:document.prerequisites,sections:document.sections,keyTakeaways:document.keyTakeaways,glossary:document.glossary,reviewQuestions:document.reviewQuestions,references:document.references,language:document.language})
