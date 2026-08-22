import {describe,expect,it} from 'vitest'
import {createLearnLoopCommitProfileTool,createLearnLoopPublishPlanTool} from '../src/tool.js'
import type {StateTable} from '../src/types.js'

describe('tool parameter schemas',()=>{
  it('compile array item schemas with the DSH value schema DSL',()=>{
    const table={} as StateTable
    expect(()=>createLearnLoopCommitProfileTool(table)).not.toThrow()
    expect(()=>createLearnLoopPublishPlanTool(table)).not.toThrow()
  })
})
