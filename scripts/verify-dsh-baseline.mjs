import {readFile} from 'node:fs/promises'

const baseline=JSON.parse(await readFile(new URL('./dsh-baseline.json',import.meta.url),'utf8'))
const pkg=JSON.parse(await readFile(new URL('../package.json',import.meta.url),'utf8'))
const lock=await readFile(new URL('../pnpm-lock.yaml',import.meta.url),'utf8')
const workflow=await readFile(new URL('../.github/workflows/web-e2e.yml',import.meta.url),'utf8')
const direct=new Set([...Object.keys(pkg.peerDependencies).filter(name=>name.startsWith('@deepseek-ai/dsh-')),...Object.keys(pkg.devDependencies).filter(name=>name.startsWith('@deepseek-ai/dsh'))])
for(const name of direct){
  for(const section of ['peerDependencies','devDependencies']) if(pkg[section]?.[name]!==undefined&&pkg[section][name]!==baseline.version) throw new Error(`${section}.${name} must equal ${baseline.version}`)
}
if(!lock.includes(`'@deepseek-ai/dsh@${baseline.version}'`)&&!lock.includes(`@deepseek-ai/dsh@${baseline.version}:`)) throw new Error('lockfile does not contain the baseline DSH release')
if(!workflow.includes('scripts/dsh-baseline.json')) throw new Error('Web E2E must read the baseline manifest')
console.log(`DSH baseline verified: ${baseline.version} @ ${baseline.commit}`)
