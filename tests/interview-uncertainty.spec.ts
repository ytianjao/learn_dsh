import {describe,expect,it} from 'vitest'
import {createProfileInterview,hostOptions,isUncertain,normalizeAnswer,probeDefinition,recommendationValue,UNSURE_CODE} from '../src/index.js'
const interview=createProfileInterview()
const read=(id:Parameters<typeof probeDefinition>[0],selected:string[],custom?:string)=>{const d=probeDefinition(id);return normalizeAnswer(d,hostOptions(d,'zh-CN'),selected,custom,interview,'zh-CN')}
describe('Probe-specific uncertainty',()=>{
 it('reads uncertainty words in both languages',()=>{for(const word of ['不知道','不确定','随便','not sure',"Don't know"])expect(isUncertain(word)).toBe(true);expect(isUncertain('知道一点')).toBe(false)})
 it('turns outcome uncertainty into a labelled overview recommendation',()=>{expect(read('goal.outcome',[],'不知道')).toMatchObject({kind:'value',origin:'host-recommendation',uncertain:true,codes:['overview']})})
 it('turns the explicit recommendation choice into overview',()=>{const d=probeDefinition('goal.outcome'),unsure=hostOptions(d,'zh-CN').find(o=>o.code===UNSURE_CODE)!;expect(unsure.label).toBe('还不确定，请根据入门目标推荐');expect(read('goal.outcome',[unsure.label])).toMatchObject({kind:'value',origin:'host-recommendation',value:{kind:'choices',choices:[{code:'overview',label:'理解核心概念和完整流程',source:'host'}]}})})
 it('keeps "cannot tell" as learner evidence on knowledge gaps',()=>{expect(read('knowledge-gaps.primary-gaps',[],'说不清')).toMatchObject({kind:'value',origin:'learner',codes:['cannot-tell']})})
 it('re-asks a Probe that has no recommendation for uncertainty',()=>{expect(read('goal.subject',[],'不知道')).toEqual({kind:'clarify'})})
 it('treats an unanswered question as empty, not uncertain',()=>{expect(read('constraints.constraints',[])).toEqual({kind:'empty'})})
 it('derives every recommendation from Host codes, never from model text',()=>{for(const d of ['goal.outcome','success-criteria.criteria','current-foundation.level','time-budget.weekly-hours','learning-mode.style'] as const)expect(recommendationValue(probeDefinition(d),interview,'zh-CN')).not.toBeNull();expect(recommendationValue(probeDefinition('goal.subject'),interview,'zh-CN')).toBeNull()})
})
