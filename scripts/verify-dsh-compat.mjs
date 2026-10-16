import {readFile} from 'node:fs/promises'
import {createRequire} from 'node:module'
import {evaluatePluginCompatibility} from '@deepseek-ai/dsh-app-boot'

// LearnLoop installs the DeepSeek Harness from the npm registry instead of a source
// checkout beside this repo. Compatibility with the running Harness is therefore decided
// by the same function the Host's own profile preflight calls, rather than by a pinned
// commit: a peer range that would deny this plugin at startup fails here first. The
// range must float so a Harness upgrade inside the minor line keeps working, and only a
// major-line move requires the code change documented in AGENTS.md.
const require=createRequire(import.meta.url)
const pkg=JSON.parse(await readFile(new URL('../package.json',import.meta.url),'utf8'))
const lock=await readFile(new URL('../pnpm-lock.yaml',import.meta.url),'utf8')

const cliManifest=require('@deepseek-ai/dsh/package.json')
const runtimeVersion=cliManifest.version

const issue=evaluatePluginCompatibility(pkg,{},runtimeVersion)
if(issue!==undefined){
  throw new Error(`this plugin declares peers incompatible with dsh ${runtimeVersion}: ${JSON.stringify(issue.peers)}; widen the peer range in package.json`)
}
// The plugin's own peers must float: an exact pin is denied the moment the Harness moves.
for(const [name,range] of Object.entries(pkg.peerDependencies)){
  if(name!=='@deepseek-ai/cordis'&&!name.startsWith('@deepseek-ai/dsh-')) continue
  if(!/^[\^~]/.test(range)) throw new Error(`peerDependencies.${name} must be a floating range, got ${range}`)
}
for(const name of Object.keys(pkg.devDependencies).filter(name=>name.startsWith('@deepseek-ai/'))){
  if(pkg.devDependencies[name].startsWith('link:')) throw new Error(`devDependencies.${name} must resolve from the registry, got ${pkg.devDependencies[name]}`)
}
if(/link:\.\.\/deepseek-harness/.test(lock)) throw new Error('lockfile still links to a ../deepseek-harness source checkout')
if(!/@deepseek-ai\/dsh@\d/.test(lock)&&!/'@deepseek-ai\/dsh':/.test(lock)) throw new Error('lockfile does not resolve @deepseek-ai/dsh from the registry')
console.log(`DSH compatibility verified: peers satisfy dsh ${runtimeVersion} (registry install, no source checkout)`)
