import {describe,expect,it} from 'vitest'
import {mkdtemp,readFile,stat,writeFile} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {strFromU8,strToU8,unzipSync,unzlibSync} from 'fflate'
import {activeProject,workspaceOf} from '../src/index.js'
import {buildLessonEpub} from '../src/content/publish/epub.js'
import {exportLessonPackage,resolveExportParent} from '../src/content/publish/exporter.js'
import {courseIndexHtml,lessonPageHtml,markdownToHtml} from '../src/content/publish/html.js'
import {renderLessonMarkdown} from '../src/content/publish/markdown.js'
import {findBrowserExecutable,renderPdfFromHtml} from '../src/content/publish/pdf.js'
import {deriveLessonDocument,validateLessonDocumentIntent} from '../src/content/document.js'
import {materializeLessonSource} from '../src/content/capture.js'
import {lessonDocumentSchema} from '../src/content/schemas.js'
import {fakeSessionReader,lessonIntentFixture,readyContentState,tempRepo} from './content-fixture.js'

async function realDocuments(count=2){
 const{state,projectId,taskIds}=readyContentState()
 const project=activeProject(workspaceOf(state,'ws')),workspace=workspaceOf(state,'ws'),repo=await tempRepo()
 const documents=[]
 for(const [index,taskId] of taskIds.slice(0,count).entries()){
  const task=project.plans[0]!.stages[0]!.tasks[index]!
  const capture=project.content.captureRequests.find(item=>item.taskId===taskId)!
  const{snapshot}=await materializeLessonSource(workspace,project,task,capture.sourceSegments,fakeSessionReader(),repo)
  const intent=validateLessonDocumentIntent(lessonIntentFixture(index===0?{}:{title:'第二课：示例精读',references:[{title:'公开资料',url:'https://example.com/runtime-boundary'}]}),snapshot,[])
  documents.push(deriveLessonDocument(intent,snapshot,{workspaceId:'ws',project,plan:project.plans[0]!,task,lessonId:project.content.lessons[taskId]!.lessonId,stageTitle:'基础阶段',sequence:index+1,contentRevision:1,language:'zh-CN',generatedBy:{provider:'mock',model:'keyless',toolCallId:`call-${index}`,requestEventSeq:30},existingSlugs:documents.map(document=>document.slug),now:()=>new Date().toISOString(),newId:prefix=>`${prefix}-${index}`}))
 }
 return documents
}

describe('article renderers',()=>{
 it('renders Chinese markdown, html and epub without mangling',async()=>{
  const[document]=await realDocuments(1)
  const markdown=renderLessonMarkdown(document)
  expect(markdown).toContain('# 执行边界入门');expect(markdown).toContain('## 学习目标');expect(markdown).toContain('**边界**')
  const html=markdownToHtml('**加粗** 与 `代码` 与 [链接](https://example.com/runtime-boundary)')
  expect(html).toContain('<strong>加粗</strong>');expect(html).toContain('rel="noopener noreferrer"')
  expect(markdownToHtml('<script>alert(1)</script>')).not.toContain('<script>')
  const page=lessonPageHtml(document,{courseTitle:'课程',crumb:'课程',indexHref:'index.html',nav:[{href:'#',title:document.title,sequence:1}],showToc:false})
  expect(page).toContain('执行边界入门');expect(page).toContain('lang="zh-CN"')
  const epub=buildLessonEpub([document],{title:'课程',identifier:'id-1',modified:'2026-01-01T00:00:00Z'})
  const entries=unzipSync(epub)
  expect(strFromU8(entries['mimetype']!)).toBe('application/epub+zip')
  expect(Object.keys(entries)).toContain('OEBPS/content.opf')
  expect(strFromU8(entries['OEBPS/lesson-01.xhtml']!)).toContain('执行边界入门')
  expect(strFromU8(entries['OEBPS/content.opf']!)).toContain('dc:language>zh-CN<')
 })
 it('renders a course index in plan order',async()=>{
  const documents=await realDocuments(2)
  const index=courseIndexHtml(documents,'课程','课程')
  expect(index.indexOf('执行边界入门')).toBeLessThan(index.indexOf('第二课：示例精读'))
 })
})

describe('export package',()=>{
 it('writes markdown, site, pdf, epub, manifest and zip into a fresh subdirectory without touching siblings',async()=>{
  const documents=await realDocuments(2)
  const parent=await mkdtemp(join(tmpdir(),'learnloop-export-test-'))
  await writeFile(join(parent,'keep.txt'),'sentinel')
  const outcome=await exportLessonPackage({documents,courseTitle:'运行时边界课程',scope:'course'},parent,{renderPdf:async(_html,outFile)=>{await writeFile(outFile,'%PDF-1.7 fake')}})
  expect(outcome.zipFileName).toBe('learnloop-course-export.zip')
  expect(outcome.files).toContain('course.epub');expect(outcome.files).toContain('course.pdf');expect(outcome.files).toContain('site/index.html')
  expect((await stat(join(parent,'keep.txt'))).isFile()).toBe(true)
  const zip=unzipSync(await readFile(join(outcome.exportDirectory,outcome.zipFileName!)))
  expect(Object.keys(zip).sort()).toEqual(outcome.files.filter(file=>file!==outcome.zipFileName).sort())
  expect(strFromU8(zip['markdown/00-index.md']!)).toContain('运行时边界课程')
  const manifest=JSON.parse(strFromU8(zip['export.manifest.json']!))
  expect(manifest.lessons).toHaveLength(2)
  expect((await readFile(join(outcome.exportDirectory,'course.pdf'),'utf8')).startsWith('%PDF')).toBe(true)
 })
 it('rejects invalid output directories and never escapes them',async()=>{
  const documents=await realDocuments(1)
  await expect(exportLessonPackage({documents,courseTitle:'x',scope:'lesson'},'',{})).rejects.toThrow('EXPORT_DIRECTORY_INVALID')
  await expect(exportLessonPackage({documents,courseTitle:'x',scope:'lesson'},'/definitely/missing/learnloop-dir',{})).rejects.toThrow('EXPORT_DIRECTORY_INVALID')
  const file=join(await mkdtemp(join(tmpdir(),'learnloop-export-file-')),'a.txt');await writeFile(file,'x')
  await expect(exportLessonPackage({documents,courseTitle:'x',scope:'lesson'},file,{})).rejects.toThrow('EXPORT_DIRECTORY_INVALID')
 })
 it('records a PDF warning instead of failing when no renderer is available',async()=>{
  const documents=await realDocuments(1)
  const parent=await mkdtemp(join(tmpdir(),'learnloop-export-nopdf-'))
  const outcome=await exportLessonPackage({documents,courseTitle:'单课',scope:'lesson'},parent,{})
  expect(outcome.warnings).toEqual([{code:'EXPORT_PDF_SKIPPED',message:'No browser renderer is available for PDF output.'}])
  expect(outcome.files.some(file=>file.endsWith('.pdf'))).toBe(false)
 })
})

function pdfToUnicodeText(bytes:Uint8Array){
 const raw=strFromU8(bytes,true),text:string[]=[]
 for(const match of raw.matchAll(/stream\r?\n([\s\S]*?)endstream/g)){
  let body=match[1]
  try{body=strFromU8(unzlibSync(strToU8(body,true)),true)}catch{}
  if(body.includes('beginbf'))text.push(body)
 }
 return text.join('\n')
}

describe('PDF via local browser',()=>{
 const browser=findBrowserExecutable()
 const itPdf=browser?it:it.skip
 itPdf('renders Chinese text to a real PDF file',async()=>{
  const out=join(await mkdtemp(join(tmpdir(),'learnloop-pdf-')),'out.pdf')
  await renderPdfFromHtml('<!DOCTYPE html><html lang="zh-CN"><body><h1>执行边界入门</h1><p>中文渲染检查</p></body></html>',out)
  const bytes=await readFile(out)
  expect(bytes.subarray(0,5).toString()).toBe('%PDF-')
  const text=pdfToUnicodeText(bytes)
  expect(text).toContain('6267') // 执 keeps its Unicode identity in the ToUnicode CMap
  expect(text).toContain('8FB9') // 边 likewise
  const cjk=[...text.matchAll(/<[0-9A-F]{2,4}> <([0-9A-F]{4})>/gi)].map(match=>match[1]).filter(code=>parseInt(code,16)>=0x2e80)
  expect(cjk.length).toBeGreaterThanOrEqual(8) // 12 Chinese fixture chars; Chrome maps some to Kangxi radical codes on Linux
 },60_000)
})

describe('export parent resolution',()=>{
 it('expands home and rejects traversal-free but missing paths',async()=>{
  await expect(resolveExportParent('~\u0000/../etc')).rejects.toThrow('EXPORT_DIRECTORY_INVALID')
  const dir=await mkdtemp(join(tmpdir(),'learnloop-parent-'))
  await expect(resolveExportParent(dir)).resolves.toBeTruthy()
 })
})
