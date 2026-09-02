import {execFile} from 'node:child_process'
import {mkdir,readFile,realpath,stat,writeFile} from 'node:fs/promises'
import {dirname,join,resolve,sep} from 'node:path'
import {randomUUID} from 'node:crypto'
import {expandHomePath} from '@deepseek-ai/dsh-home-paths'
import {zipSync} from 'fflate'
import {LearnLoopDomainError} from '../../domain.js'
import type {LessonDocument} from '../schemas.js'
import {buildLessonEpub} from './epub.js'
import {courseIndexHtml,coursePrintHtml,lessonPageFileName,lessonPageHtml} from './html.js'
import {renderCourseMarkdownIndex,renderLessonMarkdown} from './markdown.js'

export interface ExportPreparation{documents:readonly LessonDocument[];courseTitle:string;scope:'lesson'|'course'}
export interface ExportOutcome{exportDirectory:string;zipFileName:string|null;files:string[];warnings:{code:string;message:string}[]}
export type PdfRenderer=(html:string,outFile:string)=>Promise<void>

/** Validate the learner-chosen output directory; every artifact lands in one fresh subdirectory below it. */
export async function resolveExportParent(input:string):Promise<string>{
 const trimmed=input.trim()
 if(!trimmed||trimmed.includes('\0'))throw new LearnLoopDomainError('EXPORT_DIRECTORY_INVALID','The output directory is empty or invalid.')
 const resolved=resolve(expandHomePath(trimmed))
 let stats
 try{stats=await stat(resolved)}catch{throw new LearnLoopDomainError('EXPORT_DIRECTORY_INVALID',`The output directory does not exist: ${resolved}`)}
 if(!stats.isDirectory())throw new LearnLoopDomainError('EXPORT_DIRECTORY_INVALID','The output path is not a directory.')
 return realpath(resolved)
}

const timestamp=(date=new Date())=>date.toISOString().replace(/[-:]/g,'').replace(/\..+/,'').replace('T','-')

/** Write Markdown, the static HTML site, PDF, EPUB, a manifest, and the combined ZIP into one fresh directory. */
export async function exportLessonPackage(preparation:ExportPreparation,outputDirectory:string,deps:{renderPdf?:PdfRenderer}={}):Promise<ExportOutcome>{
 const parent=await resolveExportParent(outputDirectory)
 const exportDirectory=join(parent,`learnloop-${preparation.scope}-export-${timestamp()}-${randomUUID().slice(0,6)}`)
 await mkdir(exportDirectory,{recursive:false})
 const documents=[...preparation.documents].sort((a,b)=>a.sequence-b.sequence)
 const warnings:{code:string;message:string}[]=[]
 const files:string[]=[]
 const write=async(relative:string,content:string|Uint8Array)=>{const target=join(exportDirectory,...relative.split('/'));await mkdir(dirname(target),{recursive:true});await writeFile(target,content);files.push(relative)}
 try{
  if(documents.length>1)await write(`markdown/00-index.md`,renderCourseMarkdownIndex(documents,preparation.courseTitle))
  for(const document of documents)await write(`markdown/${String(document.sequence).padStart(2,'0')}-${document.slug}.md`,renderLessonMarkdown(document))
  const nav=documents.map(document=>({href:lessonPageFileName(document),title:document.title,sequence:document.sequence}))
  await write('site/index.html',courseIndexHtml(documents,preparation.courseTitle,preparation.courseTitle))
  for(const [index,document] of documents.entries())await write(`site/${lessonPageFileName(document)}`,lessonPageHtml(document,{courseTitle:preparation.courseTitle,crumb:preparation.courseTitle,indexHref:'index.html',prev:index>0?{href:lessonPageFileName(documents[index-1]!),title:documents[index-1]!.title}:undefined,next:index<documents.length-1?{href:lessonPageFileName(documents[index+1]!),title:documents[index+1]!.title}:undefined,nav,showToc:documents.length>1}))
  const bookBase=preparation.scope==='course'?'course':documents[0]!.slug
  if(deps.renderPdf)try{await deps.renderPdf(coursePrintHtml(documents,preparation.courseTitle),join(exportDirectory,`${bookBase}.pdf`));files.push(`${bookBase}.pdf`)}catch(error){warnings.push({code:'EXPORT_PDF_SKIPPED',message:error instanceof Error?error.message:'PDF rendering failed'})}
  else warnings.push({code:'EXPORT_PDF_SKIPPED',message:'No browser renderer is available for PDF output.'})
  await write(`${bookBase}.epub`,buildLessonEpub(documents,{title:preparation.courseTitle,identifier:randomUUID(),modified:new Date().toISOString().replace(/\..+/,'Z')}))
  const manifest={generatedAt:new Date().toISOString(),scope:preparation.scope,courseTitle:preparation.courseTitle,lessons:documents.map(document=>({lessonId:document.id,sequence:document.sequence,slug:document.slug,title:document.title,contentHash:document.contentHash})),files:[...files],warnings}
  await write('export.manifest.json',`${JSON.stringify(manifest,null,2)}\n`)
  const zipEntries:Record<string,Uint8Array>={}
  for(const file of files)zipEntries[file]=await readFile(join(exportDirectory,...file.split('/')))
  const zipFileName=`learnloop-${preparation.scope}-export.zip`
  await write(zipFileName,zipSync(zipEntries,{level:6}))
  return{exportDirectory,zipFileName,files,warnings}
 }catch(error){
  if(error instanceof LearnLoopDomainError)throw error
  throw new LearnLoopDomainError('EXPORT_FAILED',error instanceof Error?error.message:'Export failed.')
 }
}

/** Open a previously recorded export directory with the OS file manager; never a shell, never a computed path. */
export function openExportDirectory(exportDirectory:string):Promise<void>{
 return new Promise((resolveOpen,reject)=>{
  const opener=process.platform==='win32'?'explorer.exe':process.platform==='darwin'?'open':'xdg-open'
  const child=execFile(opener,[exportDirectory],{windowsHide:false},error=>{
   if(error&&process.platform!=='win32')reject(new LearnLoopDomainError('EXPORT_FAILED',`Could not open the export directory: ${error.message}`))
   else resolveOpen()
  })
  child.unref()
 })
}

export const sepWithin=(root:string,target:string)=>{const resolved=resolve(root,target);return resolved===root||resolved.startsWith(resolve(root)+sep)?resolved:null}
