import type {InterviewProbeId,InterviewTopic,ProfileInterviewState} from './types.js'
import {LearnLoopDomainError} from './domain.js'

export interface InterviewOption { label:string; value:string; chatAliases?:readonly string[] }
export interface InterviewProbeDefinition {
 id:InterviewProbeId; topic:InterviewTopic; inputMode:'free-text'|'single-select'|'multi-select';
 options?:readonly InterviewOption[]; customPolicy:'forbidden'|'free-text'; fallbackMode:'free-text'|'exact-option'; allowExplicitNone:boolean;
 minTextLength?:number; question:(interview:ProfileInterviewState)=>string
}
const subject=(interview:ProfileInterviewState)=>String(interview.probes['goal.subject']?.normalizedValue??'').trim()
const goalOptions=[{label:'掌握一项具体技能',value:'skill',chatAliases:['技能','掌握技能','学一项技能','我想学会一项技能']},{label:'完成一个具体项目',value:'project',chatAliases:['项目','完成项目']},{label:'通过考试或认证',value:'exam',chatAliases:['考试','认证']},{label:'系统性提升某个领域',value:'domain',chatAliases:['领域','系统学习领域']}] as const
const single=(id:InterviewProbeId,topic:InterviewTopic,question:string|InterviewProbeDefinition['question'],options:readonly InterviewOption[]):InterviewProbeDefinition=>({id,topic,inputMode:'single-select',options,customPolicy:'forbidden',fallbackMode:'exact-option',allowExplicitNone:false,question:typeof question==='string'?()=>question:question})
const free=(id:InterviewProbeId,topic:InterviewTopic,question:InterviewProbeDefinition['question'],minTextLength=2,allowExplicitNone=false):InterviewProbeDefinition=>({id,topic,inputMode:'free-text',customPolicy:'free-text',fallbackMode:'free-text',allowExplicitNone,minTextLength,question})
export const INTERVIEW_PROBES:readonly InterviewProbeDefinition[]=[
 single('goal.kind','goal','这次学习最接近哪一种目标？',goalOptions),
 free('goal.subject','goal',interview=>({project:'你具体想完成什么项目？',exam:'你具体想通过哪项考试或认证？',domain:'你具体想系统学习哪个领域？'}[String(interview.probes['goal.kind'].normalizedValue)]??'你具体想掌握哪项技能？')),
 free('target-outcome.capability','target-outcome',interview=>subject(interview)?`学习完「${subject(interview)}」后，你希望能够独立完成什么具体事情？`:'学习完成后，你希望能够独立完成什么具体事情？'),
 free('target-outcome.quality-bar','target-outcome',()=> '达到什么程度时，你会认为自己已经真正掌握了它？'),
 single('current-foundation.level','current-foundation',interview=>subject(interview)?`你目前对「${subject(interview)}」的基础处于哪个阶段？`:'你目前的基础处于哪个阶段？',[{label:'初学者',value:'beginner'},{label:'有一定基础',value:'intermediate'},{label:'经验丰富',value:'advanced'}]),
 free('current-foundation.relevant-experience','current-foundation',()=> '你有哪些与这个目标直接相关的经验？',2,true),
 free('knowledge-gaps.primary-gaps','knowledge-gaps',()=> '你认为目前阻碍你达到目标的主要知识缺口是什么？'),
 single('time-budget.weekly-hours','time-budget','你每周大约能投入多少小时？',[1,2,4,6,10].map(value=>({label:`${value} 小时`,value:String(value)}))),
 free('time-budget.deadline','time-budget',()=> '你希望在什么时间前达到目标？没有明确期限也可以说明。',2,true),
 single('learning-mode.mode','learning-mode','你更希望课程偏重知识理解、实践训练，还是两者平衡？',[{label:'知识优先',value:'knowledge-first'},{label:'平衡',value:'balanced'},{label:'实践优先',value:'practice-first'}]),
 free('learning-mode.example-preference','learning-mode',()=> '你希望案例和示例以什么形式出现？',2,true),
 single('practice-capacity.capacity','practice-capacity','你当前能够投入多大规模的实践？',[{label:'暂不实践',value:'none'},{label:'轻量实践',value:'light'},{label:'充分实践',value:'full'}]),
 free('constraints.constraints','constraints',()=> '学习过程中还有哪些时间、设备、环境或内容限制？',2,true),
 free('success-criteria.criteria','success-criteria',()=> '最后请给出一个可以客观判断学习成功的标准。'),
]
export const probeDefinition=(id:InterviewProbeId)=>INTERVIEW_PROBES.find(p=>p.id===id)!
export const probesForTopic=(topic:InterviewTopic)=>INTERVIEW_PROBES.filter(p=>p.topic===topic).map(p=>p.id)
const placeholders=new Set(['不知道','随便','某个技能','一个项目','都可以','以后再说','unknown','anything'])
export function validateProbeAnswer(definition:InterviewProbeDefinition,selected:readonly string[],custom?:string):{valid:boolean;value:string|string[]|number|null;empty:boolean}{
 const raw=(custom??'').trim(); if(definition.inputMode!=='free-text'){const values=selected.map(v=>v.trim()).filter(Boolean),allowed=new Set(definition.options?.map(o=>o.value));const valid=values.length===(definition.inputMode==='single-select'?1:values.length)&&values.length>0&&values.every(v=>allowed.has(v));const value=valid?values[0]!:null;return{valid,value:definition.id==='time-budget.weekly-hours'&&value?Number(value):value,empty:values.length===0}}
 if(!raw)return{valid:false,value:null,empty:true};const normalized=raw.toLowerCase();const explicitNone=definition.allowExplicitNone&&['无','没有','无额外限制','none','no deadline'].includes(normalized);const invalid=(!explicitNone&&raw.length<(definition.minTextLength??1))||placeholders.has(normalized);return{valid:!invalid,value:invalid?null:raw,empty:false}
}
export function normalizeChatAnswer(definition:InterviewProbeDefinition,text:string){
 if(definition.fallbackMode==='free-text')return validateProbeAnswer(definition,[],text)
 const raw=text.trim(),matches=(definition.options??[]).filter(option=>option.label===raw||option.chatAliases?.includes(raw))
 if(matches.length!==1)return{valid:false,value:null as string|string[]|number|null,empty:raw.length===0}
 return validateProbeAnswer(definition,[matches[0]!.value])
}
export const allowedChatReplies=(definition:InterviewProbeDefinition)=>definition.fallbackMode==='exact-option'?(definition.options??[]).map(option=>option.label):[]
export function normalizeNativeAnswer(definition:InterviewProbeDefinition,options:readonly InterviewOption[],selected:readonly string[],custom?:string){
 const raw=(custom??'').trim()
 if(raw){if(definition.customPolicy==='forbidden')throw new LearnLoopDomainError('INTERVIEW_QUESTION_CONTRACT_INVALID','This native question does not accept custom text.');return validateProbeAnswer(definition,[],raw)}
 const labels=selected.map(item=>item.trim()).filter(Boolean)
 if(!labels.length)return{valid:false,value:null as string|string[]|number|null,empty:true}
 if(definition.inputMode==='single-select'&&labels.length!==1)throw new LearnLoopDomainError('INTERVIEW_QUESTION_CONTRACT_INVALID','A single-select native question returned multiple labels.')
 if(definition.customPolicy==='free-text')throw new LearnLoopDomainError('INTERVIEW_QUESTION_CONTRACT_INVALID','A free-text native question requires custom text.')
 const byLabel=new Map(options.map(option=>[option.label,option.value] as const))
 if(labels.some(label=>!byLabel.has(label)))throw new LearnLoopDomainError('INTERVIEW_QUESTION_CONTRACT_INVALID','The native answer contained a label that was not offered.')
 return validateProbeAnswer(definition,labels.map(label=>byLabel.get(label)!),undefined)
}
export const questionForProbe=(id:InterviewProbeId,interview:ProfileInterviewState)=>probeDefinition(id).question(interview)
