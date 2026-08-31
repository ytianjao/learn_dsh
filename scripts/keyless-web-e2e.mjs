import {spawn} from 'node:child_process'
import {createServer} from 'node:net'
import {mkdtemp,open,readFile,rm,writeFile} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import {join,resolve} from 'node:path'

const root=resolve(import.meta.dirname,'..')
const artifacts=process.env.KEYLESS_E2E_ARTIFACT_DIR??root
const children=[]
let cleaned=false

async function freePort(){
 const server=createServer()
 await new Promise((resolve,reject)=>server.once('error',reject).listen(0,'127.0.0.1',resolve))
 const address=server.address(),port=typeof address==='object'&&address?address.port:0
 await new Promise((resolve,reject)=>server.close(error=>error?reject(error):resolve()))
 return port
}
function run(command,args,options={}){
 return new Promise((resolve,reject)=>{const child=spawn(command,args,{cwd:root,stdio:'inherit',...options});child.once('error',reject);child.once('exit',(code,signal)=>code===0?resolve():reject(new Error(`${command} ${args.join(' ')} exited with ${code??signal}`)))})
}
async function start(name,command,args,env,logPath){
 const log=await open(logPath,'w'),child=spawn(command,args,{cwd:root,env,detached:process.platform!=='win32',stdio:['ignore',log.fd,log.fd]})
 children.push({name,child,log});await new Promise((resolve,reject)=>{child.once('spawn',resolve);child.once('error',reject)})
 return child
}
async function ready(name,url,child,logPath,timeoutMs=60_000){
 const deadline=Date.now()+timeoutMs;let last='not requested'
 while(Date.now()<deadline){
  if(child.exitCode!==null)throw new Error(`${name} exited before readiness (code ${child.exitCode}); log: ${logPath}`)
  try{const response=await fetch(url,{signal:AbortSignal.timeout(2_000)});last=`HTTP ${response.status}`;if(response.ok)return}catch(error){last=error instanceof Error?error.message:String(error)}
  await new Promise(resolve=>setTimeout(resolve,250))
 }
 throw new Error(`${name} readiness timed out at ${url}; last observation: ${last}; log: ${logPath}`)
}
async function stop(entry){
 if(entry.child.exitCode===null){try{process.kill(process.platform==='win32'?entry.child.pid:-entry.child.pid,'SIGTERM')}catch(error){if(error?.code!=='ESRCH')console.error(`cleanup ${entry.name}:`,error)}await Promise.race([new Promise(resolve=>entry.child.once('exit',resolve)),new Promise(resolve=>setTimeout(resolve,5_000))]);if(entry.child.exitCode===null)try{process.kill(process.platform==='win32'?entry.child.pid:-entry.child.pid,'SIGKILL')}catch{}}
 await entry.log.close()
}
async function cleanup(stateRoot){if(cleaned)return;cleaned=true;for(const child of children.reverse())await stop(child);await rm(stateRoot,{recursive:true,force:true});console.log(`Keyless E2E cleanup complete: ${stateRoot}`)}

const stateRoot=await mkdtemp(join(tmpdir(),'learnloop-keyless-e2e-'))
const dshHome=join(stateRoot,'dsh-home'),workspace=join(stateRoot,'workspace')
const providerPort=await freePort(),webPort=await freePort()
const patchPath=join(stateRoot,'mock-provider.patch.yml')
const patchTemplate=await readFile(join(root,'e2e/fixtures/mock-provider.patch.yml'),'utf8')
await writeFile(patchPath,patchTemplate.replace('http://127.0.0.1:8000',`http://127.0.0.1:${providerPort}`))
const providerLog=join(artifacts,'mock-provider.log'),webLog=join(artifacts,'dsh-web.log')
const env={...process.env,DSH_HOME:dshHome,LEARNLOOP_E2E_WORKSPACE:workspace,LEARNLOOP_INTERVIEW_E2E:'1',DSH_TELEMETRY_DISABLED:'1'}
console.log(`Keyless E2E state: ${stateRoot}`)
console.log(`Keyless E2E endpoints: provider=127.0.0.1:${providerPort}, web=127.0.0.1:${webPort}`)
try{
 await run('bash',['scripts/cloud-acceptance-prepare.sh'],{env})
 const provider=await start('mock provider',process.execPath,['scripts/learner-first-mock-provider.mjs',String(providerPort)],env,providerLog)
 await ready('mock provider',`http://127.0.0.1:${providerPort}/`,provider,providerLog)
 const dsh=process.env.DSH_BIN?[process.execPath,[process.env.DSH_BIN]]:['pnpm',['exec','dsh']]
 const web=await start('DSH Web',dsh[0],[...dsh[1],'web','--patch',patchPath,'--host','127.0.0.1','--port',String(webPort),'--no-open'],env,webLog)
 await ready('DSH Web',`http://127.0.0.1:${webPort}/learnloop/api/v3/manage`,web,webLog)
 await run(process.execPath,['./node_modules/@playwright/test/cli.js','test'],{env:{...env,DSH_WEB_URL:`http://127.0.0.1:${webPort}`}})
}catch(error){console.error(`Keyless Web E2E failed: ${error instanceof Error?error.stack:error}`);console.error(`Diagnostics: ${providerLog}, ${webLog}, ${join(root,'test-results')}, ${join(root,'playwright-report')}`);process.exitCode=1
}finally{await cleanup(stateRoot)}
