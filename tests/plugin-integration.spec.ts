import {describe,expect,it} from 'vitest'
import {Context} from '@deepseek-ai/cordis'
import * as plugin from '../src/index.js'

describe('Cordis plugin boundary',()=>{
 it('declares the service required by apply before accessing ctx.userQuestions',()=>{
  expect(plugin.inject).toContain('userQuestions')
  const ctx=new Context()
  expect(()=>ctx.plugin({...plugin,apply(testContext:typeof ctx){void testContext.userQuestions}})).not.toThrow()
 })
})
