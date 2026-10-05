import {PassThrough} from 'node:stream'
import {mkdtemp} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {describe,expect,it} from 'vitest'
import {createLearnLoopHttpHandler,type ContentServices} from '../src/http.js'
import {activeProject,workspaceOf} from '../src/index.js'
import {fakeSessionReader,fakeTable,lessonIntentFixture,readyContentState,tempRepo} from './content-fixture.js'
import {createLearnLoopWriteLessonDocumentTool} from '../src/content/tool.js'

interface Reply{status:number;body:string;headers:Record<string,string>}
async function call(handler:(req:never,res:never)=>Promise<void>,method:string,url:string,payload?:unknown):Promise<Reply>{
 const req=new PassThrough() as never,result:Reply={status:0,body:'',headers:{}}
 Object.assign(req as object,{method,url})
 const res={writeHead(status:number,headers:Record<string,string>){result.status=status;result.headers=headers},end(body?:string|Buffer){if(body!==undefined)result.body=typeof body==='string'?body:Buffer.from(body).toString('binary')},write(chunk:Uint8Array){result.body+=Buffer.from(chunk).toString('binary');return true},on(){},once(){},emit(){}} as never
 if(payload!==undefined)(req as PassThrough).end(JSON.stringify(payload));else (req as PassThrough).end()
 await handler(req,res)
 return result
}

async function contentFixture(){
 const{state,projectId,taskIds}=readyContentState()
 const table=fakeTable(state),repo=await tempRepo(),sessions=fakeSessionReader()
 const wakes:string[]=[]
 const content:ContentServices={sessions:sessions as never,repositoryFor:()=>repo,defaultExportDirectory:()=>join(tmpdir(),'learnloop-default-exports'),renderPdf:async()=>{throw new Error('no pdf in test')},wakeAgent:(_sessionId,instruction)=>{wakes.push(instruction);return true},openDirectory:async()=>{}}
 const handler=createLearnLoopHttpHandler(table,{tailSeq:()=>99},(sessionId:string)=>({workspaceId:'ws',sessionId,workspaceRootSnapshot:'/ws',workspaceDisplayName:'Workspace'}),undefined,content)
 return{table,repo,content,wakes,handler,projectId,taskIds}
}

describe('content HTTP actions',()=>{
 it('generate-articles creates a ready job, materializes the capture, and wakes the agent once',async()=>{
  const{table,wakes,handler,projectId,taskIds}=await contentFixture()
  const rev=()=>workspaceOf(table.get('singleton')!,'ws').revision
  const reply=await call(handler,'POST','/learnloop/api/v3/state',{action:'generate-articles',workspaceId:'ws',projectId,sessionId:'s',taskId:taskIds[0],expectedWorkspaceRevision:rev(),idempotencyKey:'gen-http-1'})
  expect(reply.status).toBe(200)
  const body=JSON.parse(reply.body)
  expect(body.generation).toMatchObject({started:true,taskIds:[taskIds[0]]})
  const project=activeProject(workspaceOf(table.get('singleton')!,'ws'))
  expect(project.content.lessons[taskIds[0]!]!.source.status).toBe('ready')
  expect(wakes).toHaveLength(1)
  const repeat=await call(handler,'POST','/learnloop/api/v3/state',{action:'generate-articles',workspaceId:'ws',projectId,sessionId:'s',taskId:taskIds[0],expectedWorkspaceRevision:rev(),idempotencyKey:'gen-http-2'})
  expect(JSON.parse(repeat.body).generation.started).toBe(false)
  expect(wakes).toHaveLength(1)
 })
 it('exports a lesson, replays by idempotency key, previews HTML and downloads the zip',async()=>{
  const{table,handler,projectId,taskIds,repo}=await contentFixture()
  const rev=()=>workspaceOf(table.get('singleton')!,'ws').revision
  await call(handler,'POST','/learnloop/api/v3/state',{action:'generate-articles',workspaceId:'ws',projectId,sessionId:'s',taskId:taskIds[0],expectedWorkspaceRevision:rev(),idempotencyKey:'gen-http-1'})
  const tool=createLearnLoopWriteLessonDocumentTool(table,fakeSessionReader() as never,()=>repo)
  await tool.execute({document:lessonIntentFixture()},{agent:{id:'s'},callId:'call-http-1',signal:new AbortController().signal} as never)
  const preview=await call(handler,'GET',`/learnloop/api/v3/lesson?workspaceId=ws&taskId=${encodeURIComponent(taskIds[0]!)}`)
  expect(preview.status).toBe(200);expect(preview.headers['Content-Type']).toContain('text/html');expect(preview.body).toContain('执行边界入门')
  const parent=await mkdtemp(join(tmpdir(),'learnloop-http-export-'))
  const payload={action:'export-articles',workspaceId:'ws',projectId,sessionId:'s',expectedWorkspaceRevision:rev(),idempotencyKey:'export-http-1',scope:'lesson',taskId:taskIds[0],outputDirectory:parent}
  const exported=await call(handler,'POST','/learnloop/api/v3/state',payload)
  expect(exported.status).toBe(200)
  const record=JSON.parse(exported.body).exportRecord
  expect(record.zipFileName).toBe('learnloop-lesson-export.zip')
  expect(record.warnings.map((w:{code:string})=>w.code)).toContain('EXPORT_PDF_SKIPPED')
  const replay=await call(handler,'POST','/learnloop/api/v3/state',payload)
  expect(JSON.parse(replay.body).replayed).toBe(true)
  expect(JSON.parse(replay.body).exportRecord.id).toBe(record.id)
  const zip=await call(handler,'GET',`/learnloop/api/v3/export-file?workspaceId=ws&projectId=${encodeURIComponent(projectId)}&exportId=${encodeURIComponent(record.id)}`)
  expect(zip.status).toBe(200)
  expect(Buffer.from(zip.body,'binary').subarray(0,2).toString()).toBe('PK')
  const opened=await call(handler,'POST','/learnloop/api/v3/state',{action:'open-export-directory',workspaceId:'ws',projectId,sessionId:'s',expectedWorkspaceRevision:rev(),idempotencyKey:'open-http-1',exportId:record.id})
  expect(opened.status).toBe(200)
  const foreign=await call(handler,'GET',`/learnloop/api/v3/export-file?workspaceId=ws&projectId=${encodeURIComponent(projectId)}&exportId=export_missing`)
  expect(foreign.status).toBe(404)
 })
 it('rejects exports without generated articles',async()=>{
  const{table,handler,projectId,taskIds}=await contentFixture()
  const reply=await call(handler,'POST','/learnloop/api/v3/state',{action:'export-articles',workspaceId:'ws',projectId,sessionId:'s',expectedWorkspaceRevision:workspaceOf(table.get('singleton')!,'ws').revision,idempotencyKey:'export-http-x',scope:'lesson',taskId:taskIds[0],outputDirectory:tmpdir()})
  expect(reply.status).toBe(404)
  expect(JSON.parse(reply.body).error.code).toBe('CONTENT_DOCUMENT_NOT_FOUND')
 })
})
