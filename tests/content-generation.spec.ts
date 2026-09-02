import {describe,expect,it} from 'vitest'
import {readFile} from 'node:fs/promises'
import {join} from 'node:path'
import {activeProject,workspaceOf} from '../src/index.js'
import {activeGenerationJob,lessonArticleStatus,reconcileContentJobs,requestArticleGeneration} from '../src/content/generation.js'
import {createLearnLoopWriteLessonDocumentTool} from '../src/content/tool.js'
import {lessonDocumentSchema} from '../src/content/schemas.js'
import {runLessonCapture} from '../src/content/service.js'
import {fakeSessionReader,fakeTable,lessonIntentFixture,readyContentState,tempRepo} from './content-fixture.js'

const execContext=(callId:string)=>({agent:{id:'s'},callId,signal:new AbortController().signal}) as never
const toolArgs=(intent:unknown)=>({document:intent}) as never

describe('article generation jobs',()=>{
 it('creates one job per click batch and dedupes repeated requests',async()=>{
  const{state,projectId,taskIds}=readyContentState()
  const rev=()=>workspaceOf(state,'ws').revision
  const first=requestArticleGeneration(state,{workspaceId:'ws',projectId,sessionId:'s',taskId:taskIds[0],expectedRevision:rev(),idempotencyKey:'gen-1'})
  const job=activeGenerationJob(activeProject(workspaceOf(first,'ws')))
  expect(job?.status).toBe('running');expect(job?.currentTaskId).toBe(taskIds[0])
  const receipt=first.commandReceipts.at(-1)?.result
  expect(receipt).toMatchObject({kind:'article-generation-requested',started:true,taskIds:[taskIds[0]]})
  const repeat=requestArticleGeneration(first,{workspaceId:'ws',projectId,sessionId:'s',taskId:taskIds[0],expectedRevision:workspaceOf(first,'ws').revision,idempotencyKey:'gen-2'})
  expect(repeat.commandReceipts.at(-1)?.result).toMatchObject({kind:'article-generation-requested',started:false,jobId:job!.id})
  const replay=requestArticleGeneration(first,{workspaceId:'ws',projectId,sessionId:'s',taskId:taskIds[0],expectedRevision:workspaceOf(first,'ws').revision,idempotencyKey:'gen-1'})
  expect(replay).toBe(first)
 })
 it('rejects ineligible tasks and wrong phases',()=>{
  const{state,projectId}=readyContentState()
  expect(()=>requestArticleGeneration(state,{workspaceId:'ws',projectId,sessionId:'s',taskId:'task-missing',expectedRevision:workspaceOf(state,'ws').revision,idempotencyKey:'gen-x'})).toThrowError(expect.objectContaining({code:'CONTENT_TASK_NOT_ELIGIBLE'}))
  expect(()=>requestArticleGeneration(state,{workspaceId:'ws',projectId,sessionId:'wrong',taskId:'task-missing',expectedRevision:workspaceOf(state,'ws').revision,idempotencyKey:'gen-y'})).toThrowError(expect.objectContaining({code:'SESSION_MISMATCH'}))
 })
 it('fails interrupted jobs on startup reconcile',()=>{
  let{state,projectId,taskIds}=readyContentState()
  state=requestArticleGeneration(state,{workspaceId:'ws',projectId,sessionId:'s',taskId:taskIds[0],expectedRevision:workspaceOf(state,'ws').revision,idempotencyKey:'gen-1'})
  const reconciled=reconcileContentJobs(state)
  const project=activeProject(workspaceOf(reconciled,'ws'))
  expect(project.content.activeGenerationJobId).toBeNull()
  expect(project.content.generationJobs.at(-1)?.status).toBe('failed')
  expect(project.content.generationJobs.at(-1)?.lastError?.code).toBe('CONTENT_JOB_NOT_RUNNING')
 })
 it('resumes a failed job with the same job id and a fresh capture attempt',()=>{
  let{state,projectId,taskIds}=readyContentState()
  state=requestArticleGeneration(state,{workspaceId:'ws',projectId,sessionId:'s',taskId:taskIds[0],expectedRevision:workspaceOf(state,'ws').revision,idempotencyKey:'gen-1'})
  state=reconcileContentJobs(state)
  const failed=activeProject(workspaceOf(state,'ws')).content.generationJobs.at(-1)!
  const resumed=requestArticleGeneration(state,{workspaceId:'ws',projectId,sessionId:'s',taskId:taskIds[0],expectedRevision:workspaceOf(state,'ws').revision,idempotencyKey:'gen-2'})
  const receipt=resumed.commandReceipts.at(-1)?.result
  expect(receipt).toMatchObject({kind:'article-generation-requested',started:true,resumed:true,jobId:failed.id})
  const project=activeProject(workspaceOf(resumed,'ws'))
  expect(project.content.activeGenerationJobId).toBe(failed.id)
  expect(project.content.captureRequests.at(-1)?.status).toBe('pending')
  expect(project.content.captureRequests.at(-1)?.attempt).toBe(1)
 })
 it('marks the job failed with the capture reason when the source is unavailable',async()=>{
  const{state,projectId,taskIds}=readyContentState()
  const table=fakeTable(state),repo=await tempRepo()
  const started=requestArticleGeneration(table.get('singleton')!,{workspaceId:'ws',projectId,sessionId:'s',taskId:taskIds[0],expectedRevision:workspaceOf(table.get('singleton')!,'ws').revision,idempotencyKey:'gen-1'})
  await table.put('singleton',started)
  const capture=activeProject(workspaceOf(table.get('singleton')!,'ws')).content.captureRequests.filter(item=>item.taskId===taskIds[0]&&item.status==='pending').at(-1)!
  const outcome=await runLessonCapture(table,{assistantTextMessagesInSegments:()=>null},repo,{workspaceId:'ws',projectId,sessionId:'s',captureId:capture.id,idempotencyKey:'cap-1'})
  expect(outcome).toMatchObject({status:'failed',code:'CONTENT_SOURCE_MISSING'})
  const project=activeProject(workspaceOf(table.get('singleton')!,'ws'))
  expect(project.content.activeGenerationJobId).toBeNull()
  expect(project.content.generationJobs.at(-1)).toMatchObject({status:'failed',lastError:{code:'CONTENT_SOURCE_MISSING'}})
  expect(lessonArticleStatus(project,taskIds[0]!)).toMatchObject({status:'failed'})
 })
})

describe('learnloop_write_lesson_document tool',()=>{
 async function readyJob(){
  const{state,projectId,taskIds}=readyContentState()
  const table=fakeTable(state),repo=await tempRepo(),sessions=fakeSessionReader()
  const started=requestArticleGeneration(table.get('singleton')!,{workspaceId:'ws',projectId,sessionId:'s',taskId:taskIds[0],expectedRevision:workspaceOf(table.get('singleton')!,'ws').revision,idempotencyKey:'gen-1'})
  await table.put('singleton',started)
  const capture=activeProject(workspaceOf(table.get('singleton')!,'ws')).content.captureRequests.filter(item=>item.taskId===taskIds[0]&&item.status==='pending').at(-1)!
  await runLessonCapture(table,sessions,repo,{workspaceId:'ws',projectId,sessionId:'s',captureId:capture.id,idempotencyKey:'cap-1'})
  const tool=createLearnLoopWriteLessonDocumentTool(table,sessions as never,()=>repo)
  return{table,repo,tool,projectId,taskIds}
 }
 it('writes a validated document, advances the job, and replays by callId',async()=>{
  const{table,repo,tool,taskIds}=await readyJob()
  const result=await tool.execute(toolArgs(lessonIntentFixture()),execContext('call-write-1')) as {status:string;jobStatus:string;lessonId:string}
  expect(result.status).toBe('written');expect(result.jobStatus).toBe('completed')
  const project=activeProject(workspaceOf(table.get('singleton')!,'ws'))
  expect(project.content.activeGenerationJobId).toBeNull()
  const reference=project.content.lessons[taskIds[0]!]!.documents.shareable!
  expect(reference.status).toBe('final')
  const document=lessonDocumentSchema.parse(JSON.parse(await readFile(join(repo.root,reference.relativePath),'utf8')))
  expect(document.title).toBe('执行边界入门');expect(document.language).toBe('zh-CN');expect(document.sequence).toBe(1)
  expect(document.provenance.generatedBy.provider).toBe('mock')
  const replay=await tool.execute(toolArgs(lessonIntentFixture()),execContext('call-write-1')) as {status:string}
  expect(replay.status).toBe('already-written')
 })
 it('rejects fabricated reference links',async()=>{
  const{tool}=await readyJob()
  const bad=lessonIntentFixture({references:[{title:'编造链接',url:'https://fabricated.example.com/not-in-source'}]})
  await expect(tool.execute(toolArgs(bad),execContext('call-bad'))).rejects.toThrow('CONTENT_REFERENCE_UNVERIFIED')
  const good=lessonIntentFixture({references:[{title:'公开资料',url:'https://example.com/runtime-boundary'}]})
  const ok=await tool.execute(toolArgs(good),execContext('call-good')) as {status:string}
  expect(ok.status).toBe('written')
 })
 it('rejects raw learner answers and private identifiers',async()=>{
  const{tool,taskIds}=await readyJob()
  const stolen=lessonIntentFixture({summary:`复述学习者原文：学习者答案-${taskIds[0]}-only 是不允许的`})
  await expect(tool.execute(toolArgs(stolen),execContext('call-private'))).rejects.toThrow('CONTENT_PRIVACY_VIOLATION')
 })
 it('refuses to write without a running job',async()=>{
  const{state}=readyContentState()
  const table=fakeTable(state),repo=await tempRepo(),tool=createLearnLoopWriteLessonDocumentTool(table,fakeSessionReader() as never,()=>repo)
  await expect(tool.execute(toolArgs(lessonIntentFixture()),execContext('call-none'))).rejects.toThrow('CONTENT_JOB_NOT_RUNNING')
 })
})

describe('lesson article status projection',()=>{
 it('reports none, generating and final states',async()=>{
  const{state,projectId,taskIds}=readyContentState()
  expect(lessonArticleStatus(activeProject(workspaceOf(state,'ws')),taskIds[0]!).status).toBe('none')
  const requested=requestArticleGeneration(state,{workspaceId:'ws',projectId,sessionId:'s',taskId:taskIds[0],expectedRevision:workspaceOf(state,'ws').revision,idempotencyKey:'gen-1'})
  expect(lessonArticleStatus(activeProject(workspaceOf(requested,'ws')),taskIds[0]!).status).toBe('generating')
 })
})
