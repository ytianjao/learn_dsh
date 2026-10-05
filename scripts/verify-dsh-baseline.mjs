import {execFileSync} from 'node:child_process'
import {readFile} from 'node:fs/promises'

// LearnLoop follows the latest DeepSeek Harness only: peerDependencies carry the
// Harness version string for published consumers, while devDependencies link to the
// source checkout at ./deepseek-harness (a local junction or the CI checkout), so the
// plugin and the Host always share one physical module copy. This verifier enforces
// that shape plus checkout drift against scripts/dsh-baseline.json.
const baseline=JSON.parse(await readFile(new URL('./dsh-baseline.json',import.meta.url),'utf8'))
const pkg=JSON.parse(await readFile(new URL('../package.json',import.meta.url),'utf8'))
const lock=await readFile(new URL('../pnpm-lock.yaml',import.meta.url),'utf8')
const workflow=await readFile(new URL('../.github/actions/setup-dsh/action.yml',import.meta.url),'utf8')

const peerNames=Object.keys(pkg.peerDependencies).filter(name=>name.startsWith('@deepseek-ai/dsh-'))
const devNames=Object.keys(pkg.devDependencies).filter(name=>name.startsWith('@deepseek-ai/dsh'))
if(!peerNames.length||!devNames.length) throw new Error('expected @deepseek-ai/dsh* peer and dev dependencies')
for(const name of peerNames){
  if(pkg.peerDependencies[name]!==baseline.version) throw new Error(`peerDependencies.${name} must equal ${baseline.version}`)
}
for(const name of devNames){
  const pin=pkg.devDependencies[name]
  if(!pin.startsWith('link:./deepseek-harness/')) throw new Error(`devDependencies.${name} must link into ./deepseek-harness, got ${pin}`)
  const target=JSON.parse(await readFile(new URL(`../${pin.slice(5)}/package.json`,import.meta.url),'utf8'))
  if(target.name!==name) throw new Error(`${pin} resolves to ${target.name}, expected ${name}`)
  if(target.version!==baseline.version) throw new Error(`${name} linked version ${target.version} must equal ${baseline.version}`)
}
const head=execFileSync('git',['-C',new URL('../deepseek-harness',import.meta.url).pathname.replace(/^\/([A-Za-z]:)/,'$1'),'rev-parse','HEAD'],{encoding:'utf8'}).trim()
if(head!==baseline.commit) throw new Error(`deepseek-harness checkout ${head} drifted from the verified baseline ${baseline.commit}; re-verify and update scripts/dsh-baseline.json`)
if(!/link:\.\/deepseek-harness\//.test(lock)) throw new Error('lockfile does not contain the deepseek-harness link dependencies')
if(/@deepseek-ai\/dsh@[\d]/.test(lock)) throw new Error('lockfile resolves Harness packages from npm; only the source checkout is allowed')
for(const needle of ['repository: deepseek-ai/deepseek-harness','path: deepseek-harness','steps.baseline.outputs.commit']){
  if(!workflow.includes(needle)) throw new Error(`setup-dsh action must contain: ${needle}`)
}
console.log(`DSH baseline verified: ${baseline.version} @ ${baseline.commit} (linked source checkout)`)
