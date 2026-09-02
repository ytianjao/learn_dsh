import type {IncomingMessage,ServerResponse} from 'node:http'
import {createReadStream} from 'node:fs'
import {z} from 'zod'
import {emptyState,LearnLoopDomainError} from './domain.js'
import {activeProject,attachWorkspaceSession,beginTaskCheck,beginWorkspaceOnboarding,cancelTaskCheck,clearProject,nextAction,pauseTask,restoreSkippedTask,requestWorkspaceProfileRevision,requestWorkspacePlanRevision,confirmWorkspaceProfile,approveWorkspacePlan,resumeTask,skipTask,startTask,workspaceOf} from './workspace.js'
import {settingsSchema, type LearnLoopState, type StateTable} from './types.js'
import type {CanonicalWorkspaceContext} from './workspace-identity.js'
import {articleGenerationReceipt,articleExportReceipt,recordArticleExport,requestArticleGeneration} from './content/generation.js'
import {tasksOfPlan} from './content/capture.js'
import {runLessonCapture} from './content/service.js'
import {lessonDocumentSchema,type ExportRecord,type LessonDocument} from './content/schemas.js'
import {exportLessonPackage,openExportDirectory,sepWithin,type PdfRenderer} from './content/publish/exporter.js'
import {courseIndexHtml,lessonPageHtml} from './content/publish/html.js'
import type {LearnLoopSessionReader} from './dsh-session-adapter.js'
import type {ContentRepository} from './content/repository.js'
import {createRequire} from 'node:module'
import {randomUUID} from 'node:crypto'
const pluginVersion=(createRequire(import.meta.url)('../package.json') as {version:string}).version
export const API_PATH='/learnloop/api/v3/state';export const EXPORT_PATH='/learnloop/api/v3/export';export const MANAGE_PATH='/learnloop/api/v3/manage';export const LESSON_PATH='/learnloop/api/v3/lesson';export const EXPORT_FILE_PATH='/learnloop/api/v3/export-file'
export const BACKUP_FORMAT_VERSION=9
const statusByCode:Partial<Record<string,number>>={WORKSPACE_MISMATCH:403,SESSION_MISMATCH:403,EXPORT_FORBIDDEN:403,PROJECT_NOT_FOUND:404,TASK_NOT_FOUND:404,CANDIDATE_NOT_FOUND:404,WORKSPACE_NOT_FOUND:404,CONTENT_DOCUMENT_NOT_FOUND:404,CONTENT_JOB_NOT_FOUND:404,EXPORT_NOT_FOUND:404,INVALID_PLAN:422,ASSESSMENT_INVALID:422,ANSWER_UNSUPPORTED:422,INVALID_ARGS:422,EXPORT_DIRECTORY_INVALID:422,CONTENT_REFERENCE_UNVERIFIED:422,CONTENT_PRIVACY_VIOLATION:422,CONTENT_MARKDOWN_INVALID:422,SESSION_NOT_LIVE:503,EXPORT_FAILED:500,CONTENT_REPOSITORY_ERROR:500,CONTENT_FILE_INVALID:500}
const domainStatus=(code:LearnLoopDomainError['code'])=>statusByCode[code]??409
const json=(res:ServerResponse,status:number,value:unknown,headers:Record<string,string>={})=>{const body=JSON.stringify(value);res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store',...headers});res.end(body)}

export interface ContentServices{
  sessions:LearnLoopSessionReader
  repositoryFor(workspaceId:string,projectId:string):ContentRepository
  defaultExportDirectory():string
  renderPdf?:PdfRenderer
  openDirectory?(exportDirectory:string):Promise<void>
  /** Wake the owning Agent with a Host instruction so the generation job runs inside the ordinary DSH Agent Loop. */
  wakeAgent?(sessionId:string,instruction:string):boolean
}

export const GENERATION_WAKE_INSTRUCTION='系统指令：文章生成任务已就绪。立即阅读系统提示中的 lessonGeneration 数据，为当前任务撰写文章并调用 learnloop_write_lesson_document；完成后若还有下一个任务则继续。不要向学习者提问。 / System instruction: an article generation job is ready. Read lessonGeneration in the system prompt, write the article, and call learnloop_write_lesson_document for the current task; continue with the next task while the job runs. Do not ask the learner questions.'

export function projectState(state:LearnLoopState,workspaceId:string,content?:Pick<ContentServices,'defaultExportDirectory'>){const workspace=workspaceOf(state,workspaceId),project=workspace.activeProjectId?workspace.projects[workspace.activeProjectId]??null:null,execution=project?.execution;return{pluginVersion,schemaVersion:state.schemaVersion,rootRevision:state.revision,settings:state.settings,workspace,activeProject:project,nextAction:project?nextAction(project):null,availableActions:{canPauseCurrentTask:execution?.phase==='teaching',canSkipCurrentTask:execution?.phase==='teaching',recoverableSkippedTaskId:null},...(content?{contentDefaults:{exportDirectory:content.defaultExportDirectory()}}:{})}}
const common={workspaceId:z.string().trim().min(1),projectId:z.string().trim().min(1),sessionId:z.string().trim().min(1),expectedWorkspaceRevision:z.number().int().nonnegative(),idempotencyKey:z.string().trim().min(1)}
const managementMutation=z.discriminatedUnion('action',[z.object({action:z.literal('update-settings'),expectedRootRevision:z.number().int().nonnegative(),settings:settingsSchema}).strict(),z.object({action:z.literal('clear-project'),workspaceId:common.workspaceId,projectId:common.projectId,expectedWorkspaceRevision:common.expectedWorkspaceRevision,idempotencyKey:common.idempotencyKey}).strict()])
const mutation=z.discriminatedUnion('action',[z.object({action:z.literal('begin-learning-mode'),sessionId:common.sessionId,activationAttemptId:z.string().trim().min(8).max(128)}).strict(),z.object({action:z.literal('attach-session'),workspaceId:common.workspaceId,sessionId:common.sessionId,expectedWorkspaceRevision:common.expectedWorkspaceRevision,idempotencyKey:common.idempotencyKey}).strict(),z.object({action:z.enum(['start-task','pause-task','resume-task','skip-task','restore-skipped-task','begin-task-check','cancel-task-check']),...common,taskId:z.string().trim().min(1)}).strict(),z.object({action:z.literal('confirm-profile'),...common,profileRevision:z.number().int().positive()}).strict(),z.object({action:z.literal('request-profile-revision'),...common,profileRevision:z.number().int().positive(),reason:z.string().trim().min(1).max(2000)}).strict(),z.object({action:z.literal('approve-plan'),...common,planId:z.string().trim().min(1)}).strict(),z.object({action:z.literal('request-plan-revision'),...common,planId:z.string().trim().min(1),reason:z.string().trim().min(1).max(2000)}).strict(),z.object({action:z.literal('generate-articles'),...common,taskId:z.string().trim().min(1).optional()}).strict(),z.object({action:z.literal('export-articles'),...common,scope:z.enum(['lesson','course']),taskId:z.string().trim().min(1).optional(),outputDirectory:z.string().trim().min(1).max(4_096)}).strict(),z.object({action:z.literal('open-export-directory'),...common,exportId:z.string().trim().min(1)}).strict()])
async function body(req:IncomingMessage){const chunks:Buffer[]=[];for await(const c of req)chunks.push(Buffer.from(c));return JSON.parse(Buffer.concat(chunks).toString()) as unknown}
export interface SessionReader{tailSeq(sessionId:string):number|null}
type WorkspaceResolver=(sessionId:string,claimedWorkspaceId?:string)=>CanonicalWorkspaceContext

function errorMessage(error:unknown){return error instanceof Error?error.message.split('\nLEARNLOOP_SAFE_ERROR:')[0]:'Request failed'}

/** Resolve the documents covered by an export request in plan order. */
function exportableDocuments(state:LearnLoopState,workspaceId:string,scope:'lesson'|'course',taskId?:string){
 const project=activeProject(workspaceOf(state,workspaceId))
 const lessons=project.content.lessons
 const finalRef=(id:string)=>{const reference=lessons[id]?.documents.shareable;return reference?.status==='final'?reference:null}
 if(scope==='lesson'){
  if(!taskId)throw new LearnLoopDomainError('CONTENT_TASK_NOT_ELIGIBLE','A lesson export requires a taskId.')
  const reference=finalRef(taskId)
  if(!reference)throw new LearnLoopDomainError('CONTENT_DOCUMENT_NOT_FOUND','This task has no generated article yet.')
  return{project,references:[{taskId,reference}],skipped:[] as string[]}
 }
 const tasks=tasksOfPlan(project)
 const references=tasks.filter(task=>finalRef(task.id)).map(task=>({taskId:task.id,reference:finalRef(task.id)!}))
 if(!references.length)throw new LearnLoopDomainError('CONTENT_DOCUMENT_NOT_FOUND','No generated articles exist for this course yet.')
 const skipped=tasks.filter(task=>task.status==='completed'&&!finalRef(task.id)).map(task=>task.title)
 return{project,references,skipped}
}

export function createLearnLoopHttpHandler(table:StateTable,sessions?:SessionReader,resolveWorkspace?:WorkspaceResolver,onMutation?:(state:LearnLoopState,sessionIds:readonly string[])=>void,content?:ContentServices){return async(req:IncomingMessage,res:ServerResponse)=>{try{
 const url=new URL(req.url??API_PATH,'http://localhost'),state=table.get('singleton')??emptyState()
 const management=(value:LearnLoopState)=>({pluginVersion,schemaVersion:value.schemaVersion,rootRevision:value.revision,settings:value.settings,workspaces:Object.values(value.workspaces).map(w=>({workspaceId:w.workspaceId,workspaceDisplayName:w.workspaceDisplayName,revision:w.revision,activeProjectId:w.activeProjectId,projects:Object.values(w.projects).map(p=>({id:p.id,title:p.title,phase:p.phase,updatedAt:p.updatedAt}))}))})
 if(req.method==='GET'&&url.pathname===MANAGE_PATH){json(res,200,management(state));return}
 if(req.method==='POST'&&url.pathname===MANAGE_PATH){const parsed=managementMutation.parse(await body(req));const before=table.get('singleton')??emptyState(),oldSession=parsed.action==='clear-project'?before.workspaces[parsed.workspaceId]?.activeSessionId:null,updated=await table.update('singleton',current=>{if(parsed.action==='clear-project')return clearProject(current,parsed);if(current.revision!==parsed.expectedRootRevision)throw new LearnLoopDomainError('REVISION_CONFLICT','Root revision changed.');return{...current,revision:current.revision+1,settings:parsed.settings}});onMutation?.(updated,oldSession?[oldSession]:[]);json(res,200,management(updated));return}
 const workspaceId=url.searchParams.get('workspaceId')?.trim()
 if(req.method==='GET'&&url.pathname===EXPORT_PATH){if(!workspaceId)throw new Error('workspaceId required');const workspace=workspaceOf(state,workspaceId);json(res,200,{backupFormatVersion:BACKUP_FORMAT_VERSION,exportedAt:new Date().toISOString(),pluginVersion,settings:state.settings,workspace},{'Content-Disposition':`attachment; filename="learnloop-backup-${workspaceId.replace(/[^\w-]/g,'-')}.json"`});return}
 if(req.method==='GET'&&url.pathname===LESSON_PATH){
  if(!content)throw new LearnLoopDomainError('CONTENT_DOCUMENT_NOT_FOUND','Content services are unavailable.')
  const taskId=url.searchParams.get('taskId')?.trim()
  if(!workspaceId||!taskId)throw new Error('workspaceId and taskId required')
  const project=activeProject(workspaceOf(state,workspaceId)),lesson=project.content.lessons[taskId],reference=lesson?.documents.shareable
  if(!lesson||!reference||reference.status!=='final')throw new LearnLoopDomainError('CONTENT_DOCUMENT_NOT_FOUND','This task has no generated article yet.')
  const document=await content.repositoryFor(workspaceId,project.id).readJson(reference.relativePath,lessonDocumentSchema).catch(()=>{throw new LearnLoopDomainError('CONTENT_FILE_INVALID','The lesson document file is missing or invalid.')})
  const title=project.profile?.goalSubject||project.title
  const html=lessonPageHtml(document,{courseTitle:title,crumb:title,indexHref:'#',nav:[{href:'#',title:document.title,sequence:document.sequence}],showToc:false})
  res.writeHead(200,{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store'});res.end(html);return
 }
 if(req.method==='GET'&&url.pathname===EXPORT_FILE_PATH){
  if(!content)throw new LearnLoopDomainError('EXPORT_NOT_FOUND','Content services are unavailable.')
  const projectId=url.searchParams.get('projectId')?.trim(),exportId=url.searchParams.get('exportId')?.trim()
  if(!workspaceId||!projectId||!exportId)throw new Error('workspaceId, projectId and exportId required')
  const project=activeProject(workspaceOf(state,workspaceId)),record=project.content.exports.find(item=>item.id===exportId)
  if(!record||record.status!=='completed'||!record.zipFileName||record.projectId!==projectId)throw new LearnLoopDomainError('EXPORT_NOT_FOUND','The export record is missing.')
  const target=sepWithin(record.exportDirectory,record.zipFileName)
  if(!target)throw new LearnLoopDomainError('EXPORT_FORBIDDEN','The export file escapes its directory.')
  res.writeHead(200,{'Content-Type':'application/zip','Content-Disposition':`attachment; filename="${record.zipFileName}"`,'Cache-Control':'no-store'})
  await new Promise<void>((resolveStream,reject)=>{const stream=createReadStream(target);stream.on('error',()=>reject(new LearnLoopDomainError('EXPORT_NOT_FOUND','The export file is missing.')));stream.on('end',resolveStream);stream.pipe(res)})
  return
 }
 if(req.method==='GET'&&url.pathname===API_PATH){if(!workspaceId)throw new Error('workspaceId required');json(res,200,projectState(state,workspaceId,content));return}
 if(req.method!=='POST'||url.pathname!==API_PATH)throw new Error('Unsupported LearnLoop route.')
 const parsed=mutation.parse(await body(req));if(!resolveWorkspace)throw new LearnLoopDomainError('WORKSPACE_CONTEXT_MISSING','DSH Workspace resolver is unavailable.');const claimed=parsed.action==='begin-learning-mode'?undefined:parsed.workspaceId,identity=resolveWorkspace(parsed.sessionId,claimed),before=table.get('singleton')??emptyState(),oldSession=before.workspaces[identity.workspaceId]?.activeSessionId
 if(parsed.action==='generate-articles'||parsed.action==='export-articles'||parsed.action==='open-export-directory'){
  if(!content)throw new LearnLoopDomainError('CONTENT_JOB_NOT_FOUND','Content services are unavailable.')
  if(identity.workspaceId!==parsed.workspaceId)throw new LearnLoopDomainError('WORKSPACE_MISMATCH','Claimed Workspace is not canonical.')
  if(parsed.action==='generate-articles'){
   const input={workspaceId:identity.workspaceId,projectId:parsed.projectId,sessionId:identity.sessionId,taskId:parsed.taskId,expectedRevision:parsed.expectedWorkspaceRevision,idempotencyKey:parsed.idempotencyKey}
   let updated=await table.update('singleton',current=>requestArticleGeneration(current,input))
   const receipt=articleGenerationReceipt(updated,identity.workspaceId,parsed.idempotencyKey)
   if(receipt?.started){
    let project=activeProject(updated.workspaces[identity.workspaceId]!),job=project.content.generationJobs.find(item=>item.id===receipt.jobId)
    const capture=job?.currentTaskId?project.content.captureRequests.filter(item=>item.taskId===job.currentTaskId&&item.status==='pending').at(-1):undefined
    if(capture)await runLessonCapture(table,content.sessions,content.repositoryFor(identity.workspaceId,project.id),{workspaceId:identity.workspaceId,projectId:project.id,sessionId:identity.sessionId,captureId:capture.id,idempotencyKey:`capture:${capture.id}:${capture.attempt}`})
    updated=table.get('singleton')??updated
    project=activeProject(updated.workspaces[identity.workspaceId]!)
    job=project.content.generationJobs.find(item=>item.id===receipt.jobId)
    const ready=job?.currentTaskId?project.content.lessons[job.currentTaskId]?.source.status==='ready':false
    if(ready&&job?.status==='running')content.wakeAgent?.(identity.sessionId,GENERATION_WAKE_INSTRUCTION)
   }
   onMutation?.(updated,[identity.sessionId])
   json(res,200,{...projectState(updated,identity.workspaceId,content),generation:receipt?{jobId:receipt.jobId,taskIds:receipt.taskIds,resumed:receipt.resumed,started:receipt.started}:null})
   return
  }
  if(parsed.action==='open-export-directory'){
   const project=activeProject(workspaceOf(before,identity.workspaceId)),record=project.content.exports.find(item=>item.id===parsed.exportId)
   if(!record||record.status!=='completed')throw new LearnLoopDomainError('EXPORT_NOT_FOUND','The export record is missing.')
   await (content.openDirectory??openExportDirectory)(record.exportDirectory)
   json(res,200,{...projectState(before,identity.workspaceId,content),opened:record.exportDirectory})
   return
  }
  const existing=articleExportReceipt(before,identity.workspaceId,parsed.idempotencyKey)
  if(existing?.result?.kind==='articles-exported'){
   const record=activeProject(workspaceOf(before,identity.workspaceId)).content.exports.find(item=>item.idempotencyKey===parsed.idempotencyKey)
   json(res,200,{...projectState(before,identity.workspaceId,content),exportRecord:record??null,replayed:true})
   return
  }
  const {project,references,skipped}=exportableDocuments(before,identity.workspaceId,parsed.scope,parsed.taskId)
  const repository=content.repositoryFor(identity.workspaceId,project.id)
  const documents:LessonDocument[]=[]
  for(const {reference} of references)documents.push(await repository.readJson(reference.relativePath,lessonDocumentSchema).catch(()=>{throw new LearnLoopDomainError('CONTENT_FILE_INVALID','A lesson document file is missing or invalid.')}))
  const courseTitle=project.profile?.goalSubject||project.title
  const outcome=await exportLessonPackage({documents,courseTitle,scope:parsed.scope},parsed.outputDirectory,{renderPdf:content.renderPdf})
  const warnings=[...outcome.warnings,...skipped.map(title=>({code:'EXPORT_TASK_SKIPPED',message:`未生成文章，已跳过 / Skipped (no article): ${title}`}))]
  const record:ExportRecord={id:`export_${randomUUID()}`,workspaceId:identity.workspaceId,projectId:project.id,scope:parsed.scope,taskId:parsed.taskId??null,lessonIds:documents.map(document=>document.id),status:'completed',outputDirectory:parsed.outputDirectory,exportDirectory:outcome.exportDirectory,zipFileName:outcome.zipFileName,files:outcome.files,warnings,error:null,idempotencyKey:parsed.idempotencyKey,createdAt:new Date().toISOString()}
  const updated=await table.update('singleton',current=>recordArticleExport(current,{workspaceId:identity.workspaceId,projectId:project.id,sessionId:identity.sessionId,expectedRevision:parsed.expectedWorkspaceRevision,record}))
  onMutation?.(updated,[identity.sessionId])
  json(res,200,{...projectState(updated,identity.workspaceId,content),exportRecord:record})
  return
 }
 const updated=await table.update('singleton',current=>{if(parsed.action==='begin-learning-mode'){const workspace=current.workspaces[identity.workspaceId];return beginWorkspaceOnboarding(current,{...identity,expectedRevision:workspace?.revision??0,idempotencyKey:`onboarding:${identity.sessionId}:${parsed.activationAttemptId}`})}if(identity.workspaceId!==parsed.workspaceId||identity.sessionId!==parsed.sessionId)throw new LearnLoopDomainError('WORKSPACE_MISMATCH','Claimed Workspace or Session is not canonical.');const canonical:any={...parsed,workspaceId:identity.workspaceId,sessionId:identity.sessionId},expectedRevision=canonical.expectedWorkspaceRevision;if(canonical.action==='attach-session')return attachWorkspaceSession(current,{...canonical,expectedRevision});const input:any={...canonical,expectedRevision,sessionSeq:sessions?.tailSeq(canonical.sessionId)??null};if(canonical.action==='confirm-profile')return confirmWorkspaceProfile(current,input);if(canonical.action==='request-profile-revision')return requestWorkspaceProfileRevision(current,input);if(canonical.action==='approve-plan')return approveWorkspacePlan(current,input);if(canonical.action==='request-plan-revision')return requestWorkspacePlanRevision(current,input);if(canonical.action==='begin-task-check'){const armedAfterSeq=sessions?.tailSeq(canonical.sessionId);if(armedAfterSeq==null)throw new LearnLoopDomainError('SESSION_NOT_LIVE','Session not live.');return beginTaskCheck(current,{...input,armedAfterSeq})}if(canonical.action==='cancel-task-check')return cancelTaskCheck(current,input);if(canonical.action==='start-task')return startTask(current,input);if(canonical.action==='pause-task')return pauseTask(current,input);if(canonical.action==='resume-task')return resumeTask(current,input);if(canonical.action==='skip-task')return skipTask(current,input);return restoreSkippedTask(current,input)});onMutation?.(updated,[...new Set([identity.sessionId,oldSession].filter((id):id is string=>Boolean(id)))]);json(res,200,projectState(updated,identity.workspaceId,content))
 }catch(error){json(res,error instanceof LearnLoopDomainError?domainStatus(error.code):400,{error:{code:error instanceof LearnLoopDomainError?error.code:'REQUEST_FAILED',message:errorMessage(error)}})}}}
