import {readFileSync,readdirSync} from 'node:fs'
import {describe,expect,it} from 'vitest'
import {BACKUP_FORMAT_VERSION,learnLoopDomainSpec,learnLoopStateSchema} from '../src/index.js'

// Every version fact has one source: package.json for ranges, toolchain and scripts, the code constants for the epoch,
// and pnpm-lock.yaml for the installed Harness. Current docs may repeat a fact only if it matches; CHANGELOG is history and is not checked.
const pkg=JSON.parse(readFileSync('package.json','utf8')) as {version:string;scripts:Record<string,string>;engines:{node:string};packageManager:string;peerDependencies:Record<string,string>}
const currentDocs=['README.md','AGENTS.md','CLAUDE.md','PLANS.md',...readdirSync('docs').filter(name=>name.endsWith('.md')).map(name=>`docs/${name}`)]
const occurrences=(pattern:RegExp)=>currentDocs.flatMap(file=>readFileSync(file,'utf8').split('\n').flatMap((line,index)=>[...line.matchAll(pattern)].map(match=>({where:`${file}:${index+1}`,match}))))
const dshRanges=new Set(Object.entries(pkg.peerDependencies).filter(([name])=>name.startsWith('@deepseek-ai/dsh')).map(([,range])=>range))
const dshRange=[...dshRanges][0]!,cordisRange=pkg.peerDependencies['@deepseek-ai/cordis']!

describe('current docs repeat only facts that match their source',()=>{
 it('reference only package scripts that exist',()=>{const missing=occurrences(/\b(?:pnpm|npm) run ([\w:.-]+)/g).filter(({match})=>!(match[1]! in pkg.scripts)).map(({where,match})=>`${where} ${match[0]}`);expect(missing).toEqual([])})
 it('state every caret range exactly as package.json declares it',()=>{const allowed=new Set([...Object.values(pkg.peerDependencies),...pkg.engines.node.split('||').map(part=>part.trim())]),stale=occurrences(/\^\d+\.\d+\.\d+(?:-[0-9A-Za-z.]+)?/g).filter(({match})=>!allowed.has(match[0])).map(({where,match})=>`${where} ${match[0]}`);expect(stale).toEqual([])})
 it('never pin a prerelease Harness version outside an explicit npx example',()=>{const pinned=occurrences(/(?<![\^@\w.-])\d+\.\d+\.\d+-(?:alpha|beta|rc)\.\d+/g).map(({where,match})=>`${where} ${match[0]}`);expect(pinned).toEqual([])})
 it('keeps one DSH peer range across every @deepseek-ai/dsh package',()=>{expect([...dshRanges]).toHaveLength(1)})
 it('states the current epoch from the code constants',()=>{const line=readFileSync('README.md','utf8').split('\n').find(text=>text.startsWith('Current epoch:'))??'',[,schema,domain,backup]=/state schema (\d+), Storage Domain (\d+), backup format (\d+)/.exec(line)??[];expect({schema:Number(schema),domain:Number(domain),backup:Number(backup)}).toEqual({schema:learnLoopStateSchema.shape.schemaVersion.value,domain:learnLoopDomainSpec.version,backup:BACKUP_FORMAT_VERSION})})
 it('keeps the compatibility table row equal to package.json',()=>{const row=readFileSync('docs/UPSTREAM_COMPATIBILITY.md','utf8').split('\n').find(text=>text.startsWith(`| ${pkg.version} |`)),cells=row?.split('|').slice(1,-1).map(cell=>cell.trim());expect(cells?.slice(0,5)).toEqual([pkg.version,dshRange,pkg.engines.node.replace(/\s*\|\|\s*/g,' or '),pkg.packageManager.split('@')[1],cordisRange])})
})
