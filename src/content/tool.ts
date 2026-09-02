import {randomUUID} from 'node:crypto'
import {defineTool} from '@deepseek-ai/dsh-tools'
import {LearnLoopDomainError} from '../domain.js'
import type {LearnLoopSessionReader} from '../dsh-session-adapter.js'
import {finalizeLearnLoopToolError} from '../tool-protocol.js'
import type {StateTable} from '../types.js'
import {activeProject,workspaceForSession} from '../workspace.js'
import {privateValuesForLesson,tasksOfPlan} from './capture.js'
import {deriveLessonDocument,lessonDocumentRelativePath,validateLessonDocumentIntent} from './document.js'
import {activeGenerationJob,commitLessonDocument,lessonDocumentReceiptKey} from './generation.js'
import type {ContentRepository} from './repository.js'
import {lessonDocumentSchema,lessonSourceSnapshotSchema,type LessonDocumentIntent} from './schemas.js'
import {runLessonCapture} from './service.js'

const kinds=['introduction','motivation','concept','explanation','example','comparison','workflow','pitfall','misconception','application','summary','further-reading'] as const
const text=(title:string,description:string)=>({type:'string' as const,required:true as const,title,description})
const textArray=(title:string,description:string)=>({type:'array' as const,required:true as const,title,description,items:{type:'string' as const}})
const parameters={document:{type:'object' as const,required:true as const,additionalProperties:false,title:'Lesson document intent',description:'Reader-facing teaching article content only. The Host owns every identity, sequence, revision, provenance and path. Never include learner answers, internal identifiers, tool payloads, or links absent from the verified teaching content.',properties:{
 title:text('Article title','A clear standalone article title.'),
 subtitle:{type:'string' as const,title:'Subtitle',description:'Optional one-line subtitle.'},
 summary:text('Summary','A self-contained summary of the article.'),
 learningObjectives:textArray('Learning objectives','One to eight objectives the reader will achieve.'),
 prerequisites:textArray('Prerequisites','Prior knowledge the reader needs; empty array when none.'),
 sections:{type:'array' as const,required:true as const,title:'Sections',description:'Four to sixteen ordered sections; at least one concept or explanation and one summary.',items:{type:'object' as const,additionalProperties:false,properties:{kind:{type:'string' as const,required:true as const,enum:kinds},title:{type:'string' as const,required:true as const},markdown:{type:'string' as const,required:true as const}}}},
 keyTakeaways:textArray('Key takeaways','Three to twelve takeaways.'),
 glossary:{type:'array' as const,required:true as const,title:'Glossary',description:'Term and definition pairs; empty array when none.',items:{type:'object' as const,additionalProperties:false,properties:{term:{type:'string' as const,required:true as const},definition:{type:'string' as const,required:true as const}}}},
 reviewQuestions:{type:'array' as const,required:true as const,title:'Review questions',description:'Two to ten review questions with optional answer guides.',items:{type:'object' as const,additionalProperties:false,properties:{question:{type:'string' as const,required:true as const},answerGuide:{type:'string' as const}}}},
 references:{type:'array' as const,required:true as const,title:'References',description:'Only references whose URL literally appears in the verified teaching content; empty array when none were mentioned.',items:{type:'object' as const,additionalProperties:false,properties:{title:{type:'string' as const,required:true as const},url:{type:'string' as const},note:{type:'string' as const}}}},
}}}
const outputSchema={type:'object' as const,additionalProperties:false,properties:{status:{type:'string' as const,required:true as const,enum:['written','already-written']},taskId:{type:'string' as const,required:true as const},lessonId:{type:'string' as const,required:true as const},contentRevision:{type:'integer' as const,required:true as const},jobStatus:{type:'string' as const,required:true as const,enum:['running','completed','failed']},nextTaskId:{type:'string' as const},nextTaskTitle:{type:'string' as const},failure:{type:'string' as const}}}
interface ToolResult{status:'written'|'already-written';taskId:string;lessonId:string;contentRevision:number;jobStatus:'running'|'completed'|'failed';nextTaskId?:string;nextTaskTitle?:string;failure?:string}

export function createLearnLoopWriteLessonDocumentTool(table:StateTable,sessions:LearnLoopSessionReader,repositoryFor:(workspaceId:string,projectId:string)=>ContentRepository){
 const resultView=(result:{taskId:string;lessonId:string;contentRevision:number;jobStatus:'running'|'completed'|'failed';nextTaskId?:string|null},status:ToolResult['status'],project:ReturnType<typeof activeProject>,failure?:string):ToolResult=>({status,taskId:result.taskId,lessonId:result.lessonId,contentRevision:result.contentRevision,jobStatus:result.jobStatus,...(result.nextTaskId?{nextTaskId:result.nextTaskId,nextTaskTitle:tasksOfPlan(project).find(item=>item.id===result.nextTaskId)?.title}:{}),...(failure?{failure}:{})})
 return defineTool({name:'learnloop_write_lesson_document',description:'Write the article for the current generation task. Submit only the LessonDocumentIntent content; the Host derives identity, sequence, revision, provenance and storage. Call exactly once per task while a generation job is running.',parameters,output:{schema:outputSchema,render:(_args,value)=>{
  const v=value as ToolResult
  if(v.jobStatus==='failed')return[{type:'text',text:`The article was handled, but the generation job failed${v.failure?`: ${v.failure}`:'.'} Stop generating; the learner can retry from the LearnLoop UI.`}]
  if(v.jobStatus==='completed')return[{type:'text',text:'The article was written and the generation job is complete. Tell the learner the article is ready in the LearnLoop view.'}]
  return[{type:'text',text:`The article was written. Continue the generation job: call learnloop_write_lesson_document exactly once for the next task${v.nextTaskTitle?` (${v.nextTaskTitle})`:''} using its source material from the system prompt. Do not stop until the job completes.`}]
 }},finalizeContent:finalizeLearnLoopToolError,async execute(args,exec){
  if(!exec.agent)throw new LearnLoopDomainError('WORKSPACE_CONTEXT_MISSING','Tool execution has no DSH Session.')
  const sessionId=String(exec.agent.id),callId=String(exec.callId)
  const before=table.get('singleton')
  if(!before)throw new LearnLoopDomainError('PROJECT_NOT_FOUND','State missing.')
  const workspace=workspaceForSession(before,sessionId),project=activeProject(workspace)
  const receipt=before.commandReceipts.find(item=>item.workspaceId===workspace.workspaceId&&item.idempotencyKey===lessonDocumentReceiptKey(callId))
  if(receipt){
   if(receipt.action!=='content:write-lesson')throw new LearnLoopDomainError('IDEMPOTENCY_KEY_REUSED','The lesson document callId was reused with different content.')
   if(receipt.result?.kind!=='lesson-document-written')throw new LearnLoopDomainError('CONTENT_DOCUMENT_NOT_FOUND','Canonical lesson receipt is missing.')
   return resultView(receipt.result,'already-written',project,receipt.result.jobStatus==='failed'?'The follow-up capture failed.':undefined)
  }
  const job=activeGenerationJob(project)
  if(!job||job.status!=='running'||!job.currentTaskId)throw new LearnLoopDomainError('CONTENT_JOB_NOT_RUNNING','No article generation job is running for this project.')
  if(job.sessionId!==sessionId)throw new LearnLoopDomainError('SESSION_MISMATCH','The generation job belongs to another Session.')
  const taskId=job.currentTaskId
  const lesson=project.content.lessons[taskId]
  if(job.completedTaskIds.includes(taskId)&&lesson?.documents.shareable){const next=job.pendingTaskIds[0]??null;return resultView({taskId,lessonId:lesson.lessonId,contentRevision:lesson.documents.shareable.contentRevision,jobStatus:'running',nextTaskId:next},'already-written',project)}
  if(!lesson||lesson.source.status!=='ready'||!lesson.source.sourceRelativePath||!lesson.source.sourceHash)throw new LearnLoopDomainError('CONTENT_SOURCE_NOT_READY','The lesson source snapshot is not ready; wait for capture to finish.')
  const task=tasksOfPlan(project).find(item=>item.id===taskId)
  if(!task)throw new LearnLoopDomainError('CONTENT_TASK_NOT_ELIGIBLE','The task is no longer part of the active plan.')
  const repository=repositoryFor(workspace.workspaceId,project.id)
  const snapshot=await repository.readJson(lesson.source.sourceRelativePath,lessonSourceSnapshotSchema).catch(()=>{throw new LearnLoopDomainError('CONTENT_FILE_INVALID','The lesson source snapshot file is missing or invalid.')})
  if(snapshot.sourceHash!==lesson.source.sourceHash)throw new LearnLoopDomainError('CONTENT_DOCUMENT_STALE','The lesson source changed after the snapshot reference was recorded.')
  const intent:LessonDocumentIntent=validateLessonDocumentIntent((args as {document:unknown}).document,snapshot,privateValuesForLesson(workspace,project,taskId))
  const header=sessions.requestHeader(sessionId,callId,'learnloop_write_lesson_document')
  if(!header)throw new LearnLoopDomainError('CONTENT_TOOL_NOT_CALLED','The generation request header is missing from the Session.')
  const plan=project.plans.find(item=>item.id===project.activePlanId)!
  const sequence=tasksOfPlan(project).findIndex(item=>item.id===taskId)+1
  const stageTitle=plan.stages.find(stage=>stage.tasks.some(item=>item.id===taskId))?.title??''
  const existingSlugs=Object.values(project.content.lessons).filter(item=>item.taskId!==taskId&&item.documents.shareable).map(item=>item.documents.shareable!.slug)
  const document=deriveLessonDocument(intent,snapshot,{workspaceId:workspace.workspaceId,project,plan,task,lessonId:lesson.lessonId,stageTitle,sequence,contentRevision:(lesson.documents.shareable?.contentRevision??0)+1,language:job.language,generatedBy:{provider:header.provider,model:header.model,toolCallId:callId,requestEventSeq:header.seq},existingSlugs,now:()=>new Date().toISOString(),newId:prefix=>`${prefix}_${randomUUID()}`})
  const relativePath=lessonDocumentRelativePath(document)
  await repository.atomicWriteJsonIdempotent(relativePath,document,lessonDocumentSchema)
  const updated=await table.update('singleton',state=>commitLessonDocument(state,{sessionId,callId,document,relativePath}))
  const result=updated.commandReceipts.find(item=>item.workspaceId===workspace.workspaceId&&item.idempotencyKey===lessonDocumentReceiptKey(callId))?.result
  if(!result||result.kind!=='lesson-document-written')throw new LearnLoopDomainError('CONTENT_DOCUMENT_NOT_FOUND','Canonical lesson receipt is missing.')
  let failure:string|undefined,jobStatus=result.jobStatus
  if(result.jobStatus==='running'&&result.nextTaskId){
   const fresh=table.get('singleton')!,freshProject=activeProject(workspaceForSession(fresh,sessionId)),capture=freshProject.content.captureRequests.filter(item=>item.taskId===result.nextTaskId&&item.status!=='ready').at(-1)
   if(capture){
    const outcome=await runLessonCapture(table,sessions,repository,{workspaceId:workspace.workspaceId,projectId:project.id,sessionId,captureId:capture.id,idempotencyKey:`capture:${capture.id}:${capture.attempt}`})
    if(outcome.status==='failed'){jobStatus='failed';failure=outcome.message}
   }
  }
  return resultView({taskId,lessonId:result.lessonId,contentRevision:result.contentRevision,jobStatus,nextTaskId:result.nextTaskId},'written',project,failure)
 }})
}
