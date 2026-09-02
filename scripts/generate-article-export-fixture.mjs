#!/usr/bin/env node
/**
 * End-to-end article generation & export verification against the BUILT plugin (lib/).
 * Drives the real Host pipeline — onboarding, verified checks, capture, generation tool,
 * export — into a fresh temporary directory, then validates every artifact.
 *
 *   pnpm run build && node scripts/generate-article-export-fixture.mjs
 */
import {createHash} from 'node:crypto'
import {mkdir,mkdtemp,readdir,readFile,stat} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {unzipSync,strFromU8} from 'fflate'
import {
 emptyState,learnLoopStateSchema,beginWorkspaceOnboarding,completeProfileInterviewFixture,commitWorkspaceProfile,confirmWorkspaceProfile,createPlanDraftFromIntent,approveWorkspacePlan,
 startTask,beginTaskCheck,createEvidenceCandidate,assessCurrentCandidate,workspaceOf,activeProject,
 requestArticleGeneration,runLessonCapture,createLearnLoopWriteLessonDocumentTool,exportLessonPackage,renderPdfFromHtml,findBrowserExecutable,ContentRepository,
} from '../lib/index.js'
const sha256=value=>createHash('sha256').update(value).digest('hex')

const root=await mkdtemp(join(tmpdir(),'learnloop-article-e2e-'))
const failures=[]
const check=(name,ok,detail='')=>{console.log(`${ok?'✓':'✗'} ${name}${detail?' — '+detail:''}`);if(!ok)failures.push(name)}

const fakeSessions=(teaching,revision)=>({
 tailSeq:()=>999,
 userMessages:()=>null,
 requestHeader:()=>({provider:'mock',model:'keyless-fixture',seq:500,assistantMessageEventSeq:501,turn:1,step:1}),
 assistantTextMessagesInSegments:segments=>segments.map(segment=>{const text=segment.phase==='teaching'?teaching:revision;return{sessionId:segment.sessionId,messageId:`fixture-${segment.fromExclusiveSeq}`,eventSeq:segment.fromExclusiveSeq+1,contentHash:sha256(text),text}}),
})
const verifier=seq=>({provider:'mock',model:'keyless-fixture',requestEventSeq:seq,assistantMessageEventSeq:seq+1,turn:1,step:1,toolCallId:`call-${seq}`,policyVersion:'learnloop-verifier-v1',rubricVersion:'learnloop-rubric-v1'})
const rev=(state,ws)=>workspaceOf(state,ws).revision
const tableOf=initial=>{let state=initial;return{get:()=>state,put:async(_id,value)=>{state=value},update:async(_id,fn)=>{state=fn(state);return state}}}

async function passTask(table,ids,taskId,seq,failFirst){
 const answer=suffix=>`fixture 学习者原始回答 ${taskId} ${suffix}（绝不应出现在文章里）`
 const assess=async(overall,misconceptions,suffix,assessSeq)=>{
  const answerText=answer(suffix)
  await table.update('singleton',state=>createEvidenceCandidate(state,{sessionId:ids.sessionId,messageIds:[`m-${taskId}-${suffix}`],answerText,contentHash:sha256(answerText),eventSeqs:[seq.answer]}))
  await table.update('singleton',state=>assessCurrentCandidate(state,{sessionId:ids.sessionId,idempotencyKey:`assess-${taskId}-${suffix}`,criteria:activeProject(workspaceOf(table.get('singleton'),ids.workspaceId)).plans.flatMap(p=>p.stages).flatMap(s=>s.tasks).find(t=>t.id===taskId).acceptanceCriteria.map((_,criterionIndex)=>({criterionIndex,result:overall==='needs-work'?'failed':'passed',explanation:'逐条核验'})),overall,misconceptions,feedback:overall==='needs-work'?'关键点不完整，请补充。':'完整准确，通过。',verifier:verifier(assessSeq),provenance:{messageIds:[`m-${taskId}-${suffix}`],eventSeqs:[seq.answer],contentHash:sha256(answerText)}}))
 }
 await table.update('singleton',state=>startTask(state,{...ids,taskId,expectedRevision:rev(state,ids.workspaceId),idempotencyKey:`start-${taskId}`,sessionSeq:seq.start}))
 await table.update('singleton',state=>beginTaskCheck(state,{...ids,taskId,expectedRevision:rev(state,ids.workspaceId),idempotencyKey:`check-${taskId}`,armedAfterSeq:seq.arm}))
 if(failFirst){await assess('needs-work',failFirst,'first',seq.assess);await table.update('singleton',state=>beginTaskCheck(state,{...ids,taskId,expectedRevision:rev(state,ids.workspaceId),idempotencyKey:`check2-${taskId}`,armedAfterSeq:seq.assess+2}));await assess('passed',[],'second',seq.assess+4)}
 else await assess('passed',[],'only',seq.assess)
}

async function makeProject(language,plan,profile,teaching,revision){
 const settings={...emptyState().settings,language}
 const state0=learnLoopStateSchema.parse({...emptyState(),settings})
 const table=tableOf(state0),workspaceId=`ws-${language}`,sessionId=`session-${language}`
 await table.update('singleton',state=>beginWorkspaceOnboarding(state,{workspaceId,sessionId,expectedRevision:0,idempotencyKey:'begin'}))
 const projectId=workspaceOf(table.get('singleton'),workspaceId).activeProjectId
 const ids={workspaceId,projectId,sessionId}
 await table.update('singleton',state=>completeProfileInterviewFixture(state,workspaceId))
 await table.update('singleton',state=>commitWorkspaceProfile(state,{...ids,expectedRevision:rev(state,workspaceId),idempotencyKey:'profile',...profile}))
 await table.update('singleton',state=>confirmWorkspaceProfile(state,{...ids,profileRevision:1,expectedRevision:rev(state,workspaceId),idempotencyKey:'confirm'}))
 await table.update('singleton',state=>createPlanDraftFromIntent(state,{sessionId,callId:'plan',plan}))
 await table.update('singleton',state=>approveWorkspacePlan(state,{...ids,planId:activeProject(workspaceOf(state,workspaceId)).plans[0].id,expectedRevision:rev(state,workspaceId),idempotencyKey:'approve'}))
 return{table,ids,sessions:fakeSessions(teaching,revision)}
}

async function generateArticles(fixture,intents){
 const{table,ids,sessions}=fixture
 const repoRoot=join(root,'content-store',ids.workspaceId)
 const repo=new ContentRepository(repoRoot)
 const tool=createLearnLoopWriteLessonDocumentTool(table,sessions,()=>repo)
 const documents=[]
 for(const[taskId,intent]of intents){
  await table.update('singleton',state=>requestArticleGeneration(state,{...ids,taskId,expectedRevision:rev(state,ids.workspaceId),idempotencyKey:`gen-${taskId}`}))
  const project=activeProject(workspaceOf(table.get('singleton'),ids.workspaceId))
  const capture=project.content.captureRequests.filter(item=>item.taskId===taskId&&item.status==='pending').at(-1)
  await runLessonCapture(table,sessions,repo,{...ids,captureId:capture.id,idempotencyKey:`capture-${taskId}`})
  const result=await tool.execute({document:intent},{agent:{id:ids.sessionId},callId:`write-${taskId}`,signal:new AbortController().signal})
  if(result.status!=='written')throw new Error(`generation failed for ${taskId}: ${JSON.stringify(result)}`)
  const reference=activeProject(workspaceOf(table.get('singleton'),ids.workspaceId)).content.lessons[taskId].documents.shareable
  documents.push({taskId,reference,document:JSON.parse(await readFile(join(repoRoot,reference.relativePath),'utf8'))})
 }
 return{documents,repo}
}

// ---- Chinese course: two verified tasks, two articles ----------------------------------------
const zhPlan={stages:[{title:'第一阶段：边界',outcome:'理解 Host 权威与验证闭环',tasks:[
 {title:'执行状态边界',objective:'解释全局状态与执行状态的边界',activity:'explain',acceptanceCriteria:['说清状态由谁迁移','说清模型散文无权推进状态'],checkPrompt:'用自己的话解释执行边界',estimateMinutes:30},
 {title:'验证闭环',objective:'描述候选、评测、证据的因果链',activity:'example',acceptanceCriteria:['指出证据来源要求','说明幂等键的作用'],checkPrompt:'描述一次正式验证的完整链路',estimateMinutes:30}]}]}
const zhTeaching='本课讲解 Host 权威边界：学习计划、任务状态与证据都只能由 Host 命令迁移；模型输出只是建议。延伸阅读见 https://example.com/host-authority 这份公开说明。'
const zhRevision='补充：常见误区是把模型的解释当成状态事实；只有带幂等键的验证结果才会写入。'
const zh=await makeProject('zh-CN',zhPlan,{goal:'运行时边界',targetOutcome:'能解释并应用边界',priorKnowledge:'了解基础概念',experienceLevel:'intermediate',knowledgeGaps:[],learningMode:'balanced',practiceCapacity:'light',weeklyHours:4,constraints:[],successCriteria:['能解释']},zhTeaching,zhRevision)
const zhTasks=activeProject(workspaceOf(zh.table.get('singleton'),zh.ids.workspaceId)).plans[0].stages[0].tasks
await passTask(zh.table,zh.ids,zhTasks[0].id,{start:10,arm:20,answer:25,assess:30})
await passTask(zh.table,zh.ids,zhTasks[1].id,{start:40,arm:50,answer:55,assess:60},['把模型解释当成状态事实'])
const zhIntents=[
 [zhTasks[0].id,{title:'执行状态边界：为什么状态只能由 Host 迁移',subtitle:'从一次任务验证看可靠性设计',summary:'本文讲解学习系统中“执行状态边界”的含义：任务状态、证据与计划只能由 Host 命令迁移，模型输出永远是建议。',learningObjectives:['解释执行状态边界的含义','区分模型建议与 Host 事实','说明边界对故障恢复的作用'],prerequisites:['了解基本的客户端-服务端交互'],sections:[
  {kind:'introduction',title:'从一个故障开始',markdown:'想象浏览器在学习中途崩溃：重新打开后，任务停在“已通过”还是“进行中”？答案取决于状态由谁写入。'},
  {kind:'concept',title:'什么是执行状态边界',markdown:'**执行状态边界**把系统分成两层：模型生成内容，Host 迁移状态。模型可以解释、建议、评测，但只有 Host 的命令能把任务标记为完成。'},
  {kind:'example',title:'一次验证的旅程',markdown:'1. 学习者提交回答\n2. Host 记录候选并校验来源\n3. 评测工具逐条核验验收标准\n4. Host 原子写入评估、证据与任务状态\n\n任何一步失败都不会留下半成品状态。'},
  {kind:'pitfall',title:'常见误区',markdown:'把模型的“回答正确”当成完成标志。模型散文没有状态效力；缺少幂等键的重试才会造成重复写入。'},
  {kind:'summary',title:'小结',markdown:'边界让因果可追踪：状态迁移有唯一入口，证据有来源范围，失败可以安全重试。'}],
  keyTakeaways:['状态迁移只有一个入口：Host 命令','模型输出是建议，不是事实','幂等键让重试安全'],
  glossary:[{term:'Host',definition:'持有权威状态并执行命令的一方'},{term:'幂等键',definition:'让同一命令重复提交不产生重复效果的标识'}],
  reviewQuestions:[{question:'为什么模型不能直接标记任务完成？',answerGuide:'模型输出不可信，可能被截断或伪造；状态迁移必须走 Host 命令。'},{question:'幂等键解决了什么问题？'}],
  references:[{title:'Host 权威设计说明',url:'https://example.com/host-authority',note:'教学中提到的公开资料'}]}],
 [zhTasks[1].id,{title:'验证闭环：候选、评测与证据',summary:'本文梳理一次正式验证的完整因果链：候选答案如何被选中、逐条评测、并沉淀为可追溯证据。',learningObjectives:['描述验证闭环的四个阶段','解释证据来源范围的校验','说明已解决误区的去向'],prerequisites:[],sections:[
  {kind:'introduction',title:'为什么需要闭环',markdown:'没有闭环的学习系统只能记录“学过”，无法回答“学会了什么”。'},
  {kind:'concept',title:'候选与来源校验',markdown:'候选答案必须绑定真实的会话消息；内容哈希不一致即被拒绝。'},
  {kind:'workflow',title:'逐条评测',markdown:'每条验收标准恰好评测一次；整体结论必须与逐条结果一致，矛盾即拒绝。'},
  {kind:'misconception',title:'已解决误区',markdown:'失败轮次记录的误区会在通过后进入文章，提醒读者哪些地方最容易出错。'},
  {kind:'summary',title:'小结',markdown:'闭环让“学会”变成可审计的事实链，而不是聊天记录里的印象。'}],
  keyTakeaways:['候选必须可追溯到真实消息','评测必须覆盖全部标准','误区是文章的一部分'],
  glossary:[{term:'证据',definition:'带来源范围与幂等键的验证事实'}],
  reviewQuestions:[{question:'为什么内容哈希不一致要拒绝？'},{question:'误区如何进入文章？'}],
  references:[]}],
]
const zhGenerated=await generateArticles(zh,zhIntents)
check('中文课程：两篇文章通过工具写入',zhGenerated.documents.length===2&&zhGenerated.documents.every(d=>d.document.language==='zh-CN'))
const zhJson=JSON.stringify(zhGenerated.documents.map(d=>d.document))
check('文章不含学习者原始回答',!zhJson.includes('学习者原始回答'))
check('文章不含伪造链接',!zhJson.includes('fabricated'))

// ---- English project: one verified task, one article ------------------------------------------
const enPlan={stages:[{title:'Stage 1: Boundaries',outcome:'Understand host authority',tasks:[{title:'Execution boundary',objective:'Explain the boundary',activity:'explain',acceptanceCriteria:['Name the state owner','Explain idempotent retry'],checkPrompt:'Explain the boundary in your own words',estimateMinutes:30},{title:'Recovery',objective:'Describe recovery',activity:'apply',acceptanceCriteria:['Describe restart recovery'],checkPrompt:'Describe what happens after a restart',estimateMinutes:30}]}]}
const en=await makeProject('en',enPlan,{goal:'Runtime boundaries',targetOutcome:'Explain and apply',priorKnowledge:'Some',experienceLevel:'intermediate',knowledgeGaps:[],learningMode:'balanced',practiceCapacity:'light',weeklyHours:3,constraints:[],successCriteria:['Explain']},'This lesson explains host authority: state transitions happen only through Host commands. See https://example.com/host-authority for the public reference.','Revision note: model prose never moves state.')
const enTasks=activeProject(workspaceOf(en.table.get('singleton'),en.ids.workspaceId)).plans[0].stages[0].tasks
await passTask(en.table,en.ids,enTasks[0].id,{start:10,arm:20,answer:25,assess:30})
const enIntents=[[enTasks[0].id,{title:'The Execution Boundary',summary:'Why only Host commands may move learning state, and how that makes retry safe.',learningObjectives:['Explain the execution boundary','Distinguish model advice from Host facts'],prerequisites:[],sections:[
 {kind:'introduction',title:'A crash in the middle',markdown:'If the browser closes mid-check, the state you see afterwards depends on who was allowed to write it.'},
 {kind:'concept',title:'The boundary',markdown:'**The Host owns state.** The model explains and assesses; only Host commands transition tasks, evidence, and plans.'},
 {kind:'example',title:'A verified answer',markdown:'1. The learner answers\n2. The Host records a candidate with provenance\n3. Every criterion is assessed exactly once\n4. Facts land atomically'},
 {kind:'summary',title:'Summary',markdown:'One write path, verifiable provenance, safe retries.'}],
 keyTakeaways:['State moves through Host commands only','Model output is advice','Idempotency keys make retries safe'],
 glossary:[{term:'Host',definition:'The party that owns authoritative state'}],
 reviewQuestions:[{question:'Why can the model not complete a task?'},{question:'What does an idempotency key prevent?'}],
 references:[{title:'Host authority notes',url:'https://example.com/host-authority'}]}]]
const enGenerated=await generateArticles(en,enIntents)
check('英文文章写入成功',enGenerated.documents[0]?.document.language==='en')

// ---- Exports ----------------------------------------------------------------------------------
const pdf=async(html,outFile)=>renderPdfFromHtml(html,outFile)
console.log(`browser for PDF: ${findBrowserExecutable()??'(none)'}`)

const lessonDir=join(root,'exports-lesson-zh')
await mkdir(lessonDir,{recursive:true})
const lessonExport=await exportLessonPackage({documents:[zhGenerated.documents[0].document],courseTitle:'运行时边界',scope:'lesson'},lessonDir,{renderPdf:pdf})
check('单篇中文导出包含全部格式',lessonExport.files.some(f=>f.endsWith('.md'))&&lessonExport.files.some(f=>f.endsWith('.pdf'))&&lessonExport.files.some(f=>f.endsWith('.epub'))&&lessonExport.zipFileName!==null,lessonExport.files.length+' files')

const courseDir=join(root,'exports-course-zh')
await mkdir(courseDir,{recursive:true})
const courseExport=await exportLessonPackage({documents:zhGenerated.documents.map(d=>d.document),courseTitle:'运行时边界（课程）',scope:'course'},courseDir,{renderPdf:pdf})
check('课程导出按学习计划顺序排列',courseExport.files.includes('markdown/00-index.md')&&courseExport.files.includes('site/index.html'))

const enDir=join(root,'exports-lesson-en')
await mkdir(enDir,{recursive:true})
const enExport=await exportLessonPackage({documents:[enGenerated.documents[0].document],courseTitle:'Runtime Boundaries',scope:'lesson'},enDir,{renderPdf:pdf})

for(const[name,outcome]of[['中文单篇',lessonExport],['中文课程',courseExport],['英文单篇',enExport]]){
 const dir=outcome.exportDirectory
 const pdfFile=outcome.files.find(f=>f.endsWith('.pdf')),epubFile=outcome.files.find(f=>f.endsWith('.epub'))
 const pdfHead=(await readFile(join(dir,pdfFile))).subarray(0,5).toString()
 const zip=unzipSync(await readFile(join(dir,outcome.zipFileName)))
 const epub=unzipSync(await readFile(join(dir,epubFile)))
 const expectedFiles=outcome.files.filter(f=>f!==outcome.zipFileName)
 check(`${name}: PDF 魔数`,pdfHead==='%PDF-')
 check(`${name}: EPUB mimetype`,strFromU8(epub['mimetype'])==='application/epub+zip')
 check(`${name}: ZIP 完整`,Object.keys(zip).length===expectedFiles.length&&expectedFiles.every(f=>zip[f]))
 check(`${name}: 清单可解析`,Boolean(JSON.parse(strFromU8(zip['export.manifest.json']))))
 const anyMarkdown=strFromU8(zip[Object.keys(zip).find(f=>f.endsWith('.md')&&!f.includes('00-index'))??''])
 check(`${name}: Markdown 内容`,anyMarkdown.length>200)
 const htmlFile=Object.keys(zip).find(f=>f.startsWith('site/')&&f.endsWith('.html')&&f!=='site/index.html')
 check(`${name}: HTML 含正文`,strFromU8(zip[htmlFile]).length>500)
}
const zhCourseZip=unzipSync(await readFile(join(courseExport.exportDirectory,courseExport.zipFileName)))
const zhMarkdown=Object.keys(zhCourseZip).filter(f=>f.startsWith('markdown/')&&f.endsWith('.md')&&!f.includes('00-index'))
check('中文正文可正常显示（UTF-8 无乱码）',zhMarkdown.length===2&&strFromU8(zhCourseZip[zhMarkdown[0]]).includes('执行状态边界')&&strFromU8(zhCourseZip[zhMarkdown[1]]).includes('验证闭环'))
const enZip=unzipSync(await readFile(join(enExport.exportDirectory,enExport.zipFileName)))
const enMarkdown=Object.keys(enZip).find(f=>f.startsWith('markdown/')&&f.endsWith('.md')&&!f.includes('00-index'))
check('英文文章 Markdown 内容正确',strFromU8(enZip[enMarkdown]).includes('The Execution Boundary'))

// ---- Directory tree ----------------------------------------------------------------------------
async function tree(dir,indent=''){
 const entries=(await readdir(dir,{withFileTypes:true})).sort((a,b)=>a.name.localeCompare(b.name))
 for(const entry of entries){
  const path=join(dir,entry.name)
  if(entry.isDirectory()){console.log(`${indent}${entry.name}/`);await tree(path,indent+'  ')}
  else console.log(`${indent}${entry.name} (${(await stat(path)).size} B)`)
 }
}
console.log(`\n生成目录 / Generated tree: ${root}`)
await tree(root)

if(failures.length){console.error(`\n失败 / FAILED: ${failures.join(', ')}`);process.exit(1)}
console.log('\n全部检查通过 / All checks passed.')
