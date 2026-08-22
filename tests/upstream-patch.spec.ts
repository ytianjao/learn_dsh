import {readFile} from 'node:fs/promises'
import {describe,expect,it} from 'vitest'

describe('ask-user plan review compatibility patch',()=>{
  it('declares and forwards plan review detail and intent',async()=>{
    const patch=await readFile(new URL('../patches/@deepseek-ai__dsh-tool-ask-user@0.1.0-rc.8.patch',import.meta.url),'utf8')
    expect(patch).toContain('question.detail !== void 0 ? { detail: question.detail }')
    expect(patch).toContain('question.intent !== void 0 ? { intent: question.intent }')
    expect(patch).toContain('enum: ["plan-review"]')
  })
})
