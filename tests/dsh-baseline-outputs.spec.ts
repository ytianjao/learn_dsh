import {execFile} from 'node:child_process'
import {promisify} from 'node:util'
import {describe,expect,it} from 'vitest'

const execFileAsync=promisify(execFile)

describe('DSH baseline workflow outputs',()=>{
  it('emits validated GitHub output lines without shell evaluation',async()=>{
    const {stdout,stderr}=await execFileAsync(process.execPath,['scripts/emit-dsh-baseline-outputs.mjs'])
    expect(stderr).toBe('')
    expect(stdout).toBe('version=0.2.1-alpha.1\ncommit=5badb15009ae1756c3afe0ae0cef1faafc290ccc\n')
  })
})
