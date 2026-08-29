import {execFile} from 'node:child_process'
import {promisify} from 'node:util'
import {describe,expect,it} from 'vitest'

const execFileAsync=promisify(execFile)

describe('DSH baseline workflow outputs',()=>{
  it('emits validated GitHub output lines without shell evaluation',async()=>{
    const {stdout,stderr}=await execFileAsync(process.execPath,['scripts/emit-dsh-baseline-outputs.mjs'])
    expect(stderr).toBe('')
    expect(stdout).toBe('version=0.1.1-rc.2\ncommit=b150a551b8d465e31e418e1b2eaf5e79bbb7d28e\n')
  })
})
