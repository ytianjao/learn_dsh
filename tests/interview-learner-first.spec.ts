import {describe,expect,it} from 'vitest'
import {INTERVIEW_PROBES,probeDefinition} from '../src/index.js'
describe('learner-first sequence',()=>{it('asks what the learner wants before internal structure',()=>{expect(INTERVIEW_PROBES[0]?.id).toBe('goal.subject');expect(probeDefinition('goal.subject').question({} as any)).toContain('你现在想学什么')});it.each(['简单了解量化交易系统','我想了解 Agent 是怎么工作的','学习 system prompt 和 tool call 的工程设计'])('accepts %s as learner text',(value)=>expect(value.trim().length).toBeGreaterThan(1))})
