import {describe,expect,it} from 'vitest'
import {readFile} from 'node:fs/promises'
import {createLearnLoopCommitProfileTool,createLearnLoopConfirmProfileTool,createLearnLoopPublishPlanTool} from '../src/tool.js'
import type {StateTable} from '../src/types.js'

describe('tool parameter schemas',()=>{
  it('compile array item schemas with the DSH value schema DSL',()=>{
    const table={} as StateTable
    expect(()=>createLearnLoopCommitProfileTool(table)).not.toThrow()
    expect(()=>createLearnLoopConfirmProfileTool(table)).not.toThrow()
    expect(()=>createLearnLoopPublishPlanTool(table)).not.toThrow()
  })
  it('registers the profile confirmation tool in the host runtime',async()=>{
    const source=await readFile('src/index.ts','utf8')
    expect(source).toContain('createLearnLoopConfirmProfileTool(table)')
    expect(source).toContain('learnloop.confirmProfileTool()')
  })
  it('documents workspace-scoped optimistic revisions for agent tools',async()=>{
    const source=await readFile('src/tool.ts','utf8')
    expect(source).toContain('workspaces[workspaceId].revision')
    expect(source).toContain('this is not the top-level state revision')
  })
  it('guards plan and progress views while no active plan exists',async()=>{
    const source=await readFile('client/bundle.js','utf8')
    expect(source.match(/if\(!plan\)return/g)).toHaveLength(2)
  })
})
