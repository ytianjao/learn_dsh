import {constants} from 'node:fs'
import {access,mkdir,open,readFile,realpath,rename,rm} from 'node:fs/promises'
import {dirname,relative,resolve,sep} from 'node:path'
import {randomUUID} from 'node:crypto'
import {dshHomePath} from '@deepseek-ai/dsh-home-paths'
import type {ZodType} from 'zod'
import {canonicalJson,sha256} from './hash.js'

export const opaquePathId=(id:string)=>sha256(id).slice(0,20)
export const contentProjectRoot=(workspaceId:string,projectId:string)=>dshHomePath('learnloop','content',`ws-${opaquePathId(workspaceId)}`,`project-${opaquePathId(projectId)}`)
export function safeRelativePath(path:string):string{if(!path||path.includes('\0')||resolve('/',path)!==resolve('/',path.replaceAll('\\','/'))||path.startsWith('/')||path.split(/[\\/]/).includes('..'))throw new Error('CONTENT_REPOSITORY_ERROR');return path.replaceAll('\\','/')}
const assertWithin=(root:string,target:string)=>{const rel=relative(root,target);if(rel==='..'||rel.startsWith(`..${sep}`)||resolve(root)===resolve(target)&&rel!=='')throw new Error('CONTENT_REPOSITORY_ERROR')}

/** Directory fsync is unsupported on some platforms (notably Windows); durability there relies on the file sync and atomic rename. */
async function syncDirectory(parent:string):Promise<void>{
 if(process.platform==='win32')return
 try{const directory=await open(parent,'r');await directory.sync();await directory.close()}catch(error){if(error instanceof Error&&'code' in error&&['EPERM','EINVAL'].includes(String((error as NodeJS.ErrnoException).code)))return;throw error}
}

export class ContentRepository{
  constructor(readonly root:string){}
  path(relativePath:string){const target=resolve(this.root,safeRelativePath(relativePath));assertWithin(resolve(this.root),target);return target}
  async atomicWriteJson<T>(relativePath:string,value:T,schema:ZodType<T>,immutable=true):Promise<void>{
    const target=this.path(relativePath),parent=dirname(target);await mkdir(parent,{recursive:true});const canonicalRoot=await realpath(this.root).catch(()=>resolve(this.root)),canonicalParent=await realpath(parent);assertWithin(canonicalRoot,canonicalParent)
    if(immutable)try{await access(target,constants.F_OK);throw new Error('CONTENT_REPOSITORY_ERROR')}catch(error){if(error instanceof Error&&error.message==='CONTENT_REPOSITORY_ERROR')throw error}
    const temp=`${target}.${randomUUID()}.tmp`;let handle
    try{handle=await open(temp,'wx',0o600);await handle.writeFile(`${canonicalJson(value)}\n`,'utf8');await handle.sync();await handle.close();handle=undefined;schema.parse(JSON.parse(await readFile(temp,'utf8')));await rename(temp,target);await syncDirectory(parent)}
    catch{if(handle)await handle.close().catch(()=>undefined);await rm(temp,{force:true}).catch(()=>undefined);throw new Error('CONTENT_REPOSITORY_ERROR')}
  }
  /** Immutable write that tolerates a retry landing on identical content: an existing file is accepted only when it already stores exactly this value. */
  async atomicWriteJsonIdempotent<T>(relativePath:string,value:T,schema:ZodType<T>):Promise<void>{
    try{await this.atomicWriteJson(relativePath,value,schema,true);return}catch(error){if(!(error instanceof Error&&error.message==='CONTENT_REPOSITORY_ERROR'))throw error}
    let existing:T
    try{existing=schema.parse(JSON.parse(await readFile(this.path(relativePath),'utf8')))}catch{throw new Error('CONTENT_REPOSITORY_ERROR')}
    if(canonicalJson(existing)!==canonicalJson(value))throw new Error('CONTENT_REPOSITORY_ERROR')
  }
  async readJson<T>(relativePath:string,schema:ZodType<T>):Promise<T>{try{return schema.parse(JSON.parse(await readFile(this.path(relativePath),'utf8')))}catch{throw new Error('CONTENT_FILE_INVALID')}}
}
