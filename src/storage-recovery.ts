import {mkdirSync,readFileSync,renameSync} from 'node:fs'
import {basename,dirname,join} from 'node:path'
import type {IncomingMessage,ServerResponse} from 'node:http'
import {z} from 'zod'
import {dshHomePath} from '@deepseek-ai/dsh-home-paths'
import {LearnLoopDomainError,learnLoopDomainSpec} from './domain.js'
import {MANAGE_PATH} from './http.js'

/**
 * Recovery from a stored state of another persistence epoch. DSH refuses to open a Storage Domain
 * whose stamped version differs (`version-mismatch`), and a record of an older state schema fails
 * validation (`invalid-record`). Either used to abort `apply`, which took `dsh web` down with it.
 * Now LearnLoop starts degraded and the learner moves the stale file aside explicitly; nothing is
 * reset, converted, or deleted on its own.
 */
export interface IncompatibleStorage{reason:'version-mismatch'|'invalid-record';storedUnitVersion:number|null;storedSchemaVersion:number|null;expectedUnitVersion:number}
/** The base bundle's JSON backend root. A relocated root is not reset from the UI. */
export const storageFilePath=()=>dshHomePath('storages',`${learnLoopDomainSpec.name}.json`)
export const staleBackupDirectory=()=>dshHomePath('learnloop','stale-backups')

function readHeader(file:string){
 try{const document=JSON.parse(readFileSync(file,'utf8')) as {unit?:{name?:unknown;version?:unknown};tables?:{state?:{singleton?:{schemaVersion?:unknown}}}},schema=document.tables?.state?.singleton?.schemaVersion;return{name:document.unit?.name,unit:typeof document.unit?.version==='number'?document.unit.version:null,schema:typeof schema==='number'?schema:null}}
 catch{return null}
}
export function incompatibleStorage(error:unknown,file=storageFilePath()):IncompatibleStorage|null{
 const code=(error as {code?:unknown}|null)?.code
 if(code!=='version-mismatch'&&code!=='invalid-record')return null
 const header=readHeader(file)
 return{reason:code,storedUnitVersion:header?.unit??null,storedSchemaVersion:header?.schema??null,expectedUnitVersion:learnLoopDomainSpec.version}
}
/** Moves the stale file into the backup directory (never deletes it) and returns the backup file name. */
export function moveIncompatibleStorageAside(file=storageFilePath(),backupDirectory=staleBackupDirectory(),now=new Date()):string{
 const header=readHeader(file)
 if(header?.name!==learnLoopDomainSpec.name)throw new LearnLoopDomainError('STORAGE_EPOCH_INCOMPATIBLE','The LearnLoop storage file is not at the default location; reset it manually as described in the README.')
 const target=join(backupDirectory,`learnloop.unit${header.unit??'unknown'}-schema${header.schema??'unknown'}.${now.toISOString().replace(/[:.]/g,'-')}.json`)
 mkdirSync(dirname(target),{recursive:true});renameSync(file,target)
 return basename(target)
}

const resetRequest=z.object({action:z.literal('reset-incompatible-storage')}).strict()
const json=(res:ServerResponse,status:number,value:unknown)=>{res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'});res.end(JSON.stringify(value))}
async function body(req:IncomingMessage){const chunks:Buffer[]=[];for await(const c of req)chunks.push(Buffer.from(c));return JSON.parse(Buffer.concat(chunks).toString()) as unknown}
/** Serves every LearnLoop route while degraded: reads report the incompatibility, and one management action resets. */
export function createIncompatibleStorageHandler(stale:IncompatibleStorage,reset:()=>Promise<string>){
 let pending:Promise<string>|null=null
 return async(req:IncomingMessage,res:ServerResponse)=>{
  const url=new URL(req.url??MANAGE_PATH,'http://localhost')
  if(req.method==='POST'&&url.pathname===MANAGE_PATH){
   try{resetRequest.parse(await body(req));const backupFile=await(pending??=reset());json(res,200,{status:'reset',backupFile})}
   catch(error){pending=null;json(res,error instanceof LearnLoopDomainError?503:400,{error:{code:error instanceof LearnLoopDomainError?error.code:'REQUEST_FAILED',message:error instanceof Error?error.message.split('\nLEARNLOOP_SAFE_ERROR:')[0]:'Request failed'},incompatibleStorage:stale})}
   return
  }
  json(res,503,{error:{code:'STORAGE_EPOCH_INCOMPATIBLE',message:'Stored LearnLoop data is from another version. Clear the old data to continue; it is moved to a backup, not deleted.'},incompatibleStorage:stale})
 }
}
