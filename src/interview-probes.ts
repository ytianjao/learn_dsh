import type {InterviewProbeId,InterviewTopic,ProfileInterviewState} from './types.js'

export interface InterviewOption { label:string; value:string }
export interface InterviewProbeDefinition {id:InterviewProbeId;topic:InterviewTopic;inputMode:'free-text'|'single-select'|'multi-select';options?:readonly InterviewOption[];allowExplicitNone:boolean;minTextLength?:number}
const goalOptions=[{label:'掌握一项具体技能',value:'skill'},{label:'完成一个具体项目',value:'project'},{label:'通过考试或认证',value:'exam'},{label:'系统性提升某个领域',value:'domain'}] as const
const single=(id:InterviewProbeId,topic:InterviewTopic,options:readonly InterviewOption[]):InterviewProbeDefinition=>({id,topic,inputMode:'single-select',options,allowExplicitNone:false})
const free=(id:InterviewProbeId,topic:InterviewTopic,minTextLength=2,allowExplicitNone=false):InterviewProbeDefinition=>({id,topic,inputMode:'free-text',allowExplicitNone,minTextLength})
export const INTERVIEW_PROBES:readonly InterviewProbeDefinition[]=[
 single('goal.kind','goal',goalOptions),free('goal.subject','goal'),free('target-outcome.capability','target-outcome'),free('target-outcome.quality-bar','target-outcome'),
 single('current-foundation.level','current-foundation',[{label:'初学者',value:'beginner'},{label:'有一定基础',value:'intermediate'},{label:'经验丰富',value:'advanced'}]),free('current-foundation.relevant-experience','current-foundation',2,true),
 free('knowledge-gaps.primary-gaps','knowledge-gaps'),single('time-budget.weekly-hours','time-budget',[1,2,4,6,10].map(value=>({label:`${value} 小时`,value:String(value)}))),free('time-budget.deadline','time-budget',2,true),
 single('learning-mode.mode','learning-mode',[{label:'知识优先',value:'knowledge-first'},{label:'平衡',value:'balanced'},{label:'实践优先',value:'practice-first'}]),free('learning-mode.example-preference','learning-mode',2,true),
 single('practice-capacity.capacity','practice-capacity',[{label:'暂不实践',value:'none'},{label:'轻量实践',value:'light'},{label:'充分实践',value:'full'}]),free('constraints.constraints','constraints',2,true),free('success-criteria.criteria','success-criteria'),
]
export const probeDefinition=(id:InterviewProbeId)=>INTERVIEW_PROBES.find(p=>p.id===id)!
export const probesForTopic=(topic:InterviewTopic)=>INTERVIEW_PROBES.filter(p=>p.topic===topic).map(p=>p.id)
const placeholders=new Set(['不知道','随便','某个技能','一个项目','都可以','以后再说','unknown','anything'])
export function validateProbeAnswer(definition:InterviewProbeDefinition,selected:readonly string[],custom?:string):{valid:boolean;value:string|string[]|number|null;empty:boolean}{
 const raw=(custom??'').trim(); if(definition.inputMode!=='free-text'){const values=selected.map(v=>v.trim()).filter(Boolean),allowed=new Set(definition.options?.map(o=>o.value));const valid=values.length===(definition.inputMode==='single-select'?1:values.length)&&values.length>0&&values.every(v=>allowed.has(v));const value=valid?values[0]!:null;return{valid,value:definition.id==='time-budget.weekly-hours'&&value?Number(value):value,empty:values.length===0}}
 if(!raw)return{valid:false,value:null,empty:true};const normalized=raw.toLowerCase();const explicitNone=definition.allowExplicitNone&&['无','没有','无额外限制','none','no deadline'].includes(normalized);const invalid=(!explicitNone&&raw.length<(definition.minTextLength??1))||placeholders.has(normalized)||/learnloop_|tool\s*(?:call|result)|system\s*prompt/i.test(raw);return{valid:!invalid,value:invalid?null:raw,empty:false}
}
export function questionForProbe(id:InterviewProbeId,interview:ProfileInterviewState):string{const subject=String(interview.probes['goal.subject']?.normalizedValue??'').trim();if(id==='goal.subject'){const kind=interview.probes['goal.kind'].normalizedValue;return kind==='project'?'你具体想完成什么项目？':kind==='exam'?'你具体想通过哪项考试或认证？':kind==='domain'?'你具体想系统学习哪个领域？':'你具体想掌握哪项技能？'}if(id==='target-outcome.capability'&&subject)return`学习完 ${subject} 后，你希望能够独立完成什么具体事情？`;return`请回答 ${id} 所需的具体信息。`}
