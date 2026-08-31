import type {InterviewProbeId,InterviewTopic,ProfileInterviewState} from './types.js'

export type InterviewQuestionMode='free-text'|'fixed-options'|'scaffolded-options'
export type GoalIntent='explore'|'overview'|'interpret'|'guided-use'|'independent-use'|'design'
export interface InterviewOption {label:string;value:string;description?:string;level?:GoalIntent;provenance?:'host-generic'|'model-suggested'|'host-uncertainty'}
export interface ScaffoldOptionInput {label:string;description?:string;level:GoalIntent}
export interface InterviewProbeDefinition {id:InterviewProbeId;topic:InterviewTopic;questionMode:InterviewQuestionMode;customPolicy:'accept'|'accept-and-clarify';uncertaintyPolicy:'accept'|'scaffold'|'require-answer';question:(interview:ProfileInterviewState)=>string;fixedOptions?:readonly InterviewOption[];genericScaffold?:readonly ScaffoldOptionInput[];allowExplicitNone?:boolean;minTextLength?:number}

export const UNCERTAIN_OPTION_LABEL='还不确定，请根据入门目标推荐'
export const GENERIC_GOAL_SCAFFOLD:readonly ScaffoldOptionInput[]=[
 {label:'先简单了解它是什么',level:'explore'},
 {label:'理解核心概念和完整流程',level:'overview'},
 {label:'能看懂典型案例或现有方案',level:'interpret'},
 {label:'能跟着示例完成基础操作',level:'guided-use'},
 {label:'能独立完成一个基础任务',level:'independent-use'},
]
const fixed=(id:InterviewProbeId,topic:InterviewTopic,question:string,options:readonly InterviewOption[],uncertaintyPolicy:InterviewProbeDefinition['uncertaintyPolicy']='accept'):InterviewProbeDefinition=>({id,topic,questionMode:'fixed-options',customPolicy:'accept-and-clarify',uncertaintyPolicy,question:()=>question,fixedOptions:options})
const free=(id:InterviewProbeId,topic:InterviewTopic,question:InterviewProbeDefinition['question'],uncertaintyPolicy:InterviewProbeDefinition['uncertaintyPolicy']='accept',allowExplicitNone=false):InterviewProbeDefinition=>({id,topic,questionMode:'free-text',customPolicy:'accept',uncertaintyPolicy,question,minTextLength:2,allowExplicitNone})
const subject=(i:ProfileInterviewState)=>String(i.probes['goal.subject']?.normalizedValue??'').trim()
export const INTERVIEW_PROBES:readonly InterviewProbeDefinition[]=[
 free('goal.subject','goal',()=> '你现在想学什么？\n不需要专业术语，按自己的说法描述即可。','require-answer'),
 {id:'goal.outcome',topic:'goal',questionMode:'scaffolded-options',customPolicy:'accept-and-clarify',uncertaintyPolicy:'scaffold',question:i=>`关于「${subject(i)}」，下面哪个目标最接近你的想法？`,genericScaffold:GENERIC_GOAL_SCAFFOLD},
 free('target-outcome.quality-bar','target-outcome',()=> '哪一种可理解的结果会让你觉得已经达到这个目标？','scaffold'),
 fixed('current-foundation.level','current-foundation','你目前的基础处于哪个阶段？',[{label:'初学者',value:'beginner'},{label:'有一定基础',value:'intermediate'},{label:'经验丰富',value:'advanced'}]),
 free('current-foundation.relevant-experience','current-foundation',()=> '你有哪些与这个主题相关的经验？','accept',true),
 free('knowledge-gaps.primary-gaps','knowledge-gaps',()=> '你目前知道哪些不清楚的地方？不知道也可以直接说明。','accept'),
 fixed('time-budget.weekly-hours','time-budget','你每周大约能投入多少小时？',[1,2,4,6,10].map(value=>({label:`${value} 小时`,value:String(value)}))),
 free('time-budget.deadline','time-budget',()=> '你希望在什么时间前达到目标？没有明确期限也可以说明。','accept',true),
 fixed('learning-mode.mode','learning-mode','你更希望课程偏重知识理解、实践训练，还是两者平衡？',[{label:'知识优先',value:'knowledge-first'},{label:'平衡',value:'balanced'},{label:'实践优先',value:'practice-first'}]),
 free('learning-mode.example-preference','learning-mode',()=> '你希望案例和示例以什么形式出现？','accept',true),
 fixed('practice-capacity.capacity','practice-capacity','你当前能够投入多大规模的实践？',[{label:'暂不实践',value:'none'},{label:'轻量实践',value:'light'},{label:'充分实践',value:'full'}]),
 free('constraints.constraints','constraints',()=> '学习过程中还有哪些时间、设备、环境或内容限制？','accept',true),
 free('success-criteria.criteria','success-criteria',()=> '请选择或描述一个容易理解的成功标准；不知道时系统会根据目标推荐。','scaffold'),
]
export const probeDefinition=(id:InterviewProbeId)=>INTERVIEW_PROBES.find(p=>p.id===id)!
export const probesForTopic=(topic:InterviewTopic)=>INTERVIEW_PROBES.filter(p=>p.topic===topic).map(p=>p.id)
export const isUncertain=(text:string)=>['不知道','不确定','随便','都可以','以后再说','unknown'].includes(text.trim().toLowerCase())
export function validateProbeAnswer(def:InterviewProbeDefinition,selected:readonly string[],custom?:string,options:readonly InterviewOption[]=def.fixedOptions??[],presentationMode:InterviewQuestionMode=def.questionMode){
 const raw=(custom??'').trim(); if(raw){
  if(isUncertain(raw))return{valid:def.uncertaintyPolicy==='accept',value:def.uncertaintyPolicy==='accept'?raw:null,empty:false,uncertain:true,clarification:false}
  if(presentationMode!=='free-text'&&def.customPolicy==='accept-and-clarify'){
   const exact=options.find(o=>o.label.trim()===raw||o.value.trim()===raw)
   if(exact)return{valid:true,value:def.id==='goal.outcome'?exact.label:exact.value,displayValue:exact.label,empty:false,uncertain:false,clarification:false,level:exact.level,option:exact}
   if(def.id==='time-budget.weekly-hours'){
    const match=raw.match(/^(?:每周\s*)?(\d{1,2})(?:\s*(?:小时|hours?|h))?$/i),hours=match?Number(match[1]):NaN
    if(Number.isInteger(hours)&&hours>=1&&hours<=80)return{valid:true,value:hours,displayValue:`${hours} 小时`,empty:false,uncertain:false,clarification:false}
   }
   return{valid:false,value:null,empty:false,uncertain:false,clarification:true}
  }
  return{valid:raw.length>=(def.minTextLength??1),value:raw,empty:false,uncertain:false,clarification:false}
 }
 if(!selected.length)return{valid:false,value:null,empty:true,uncertain:false}
 const match=options.find(o=>o.label===selected[0]||o.value===selected[0]);if(!match)return{valid:false,value:selected[0]!,empty:false,uncertain:false}
 if(match.provenance==='host-uncertainty')return{valid:true,value:'overview',displayValue:'理解核心概念和完整流程',empty:false,uncertain:true,level:'overview' as const,option:match}
 return{valid:true,value:def.id==='goal.outcome'?match.label:match.value,displayValue:match.label,empty:false,uncertain:false,level:match.level,option:match}
}
export const normalizeNativeAnswer=(def:InterviewProbeDefinition,options:readonly InterviewOption[],selected:readonly string[],custom?:string,presentationMode:InterviewQuestionMode=def.questionMode)=>validateProbeAnswer(def,selected,custom,options,presentationMode)
export const normalizeChatAnswer=(def:InterviewProbeDefinition,text:string)=>validateProbeAnswer(def,[],text)
export const allowedChatReplies=(def:InterviewProbeDefinition)=>(def.fixedOptions??[]).map(x=>x.label)
export const questionForProbe=(id:InterviewProbeId,interview:ProfileInterviewState)=>probeDefinition(id).question(interview)

const unsafe=/<[^>]+>|tool\s*call|workspace|session|probe\s*id/i
const ranks:Record<GoalIntent,number>={explore:0,overview:1,interpret:2,'guided-use':3,'independent-use':4,design:5}
export function validateScaffoldOptions(input:readonly ScaffoldOptionInput[]){
 if(input.length<3||input.length>6)throw Error('Scaffold options must contain 3–6 items.')
 const labels=new Set<string>();let prior=-1
 for(const o of input){const label=o.label.trim();if(label.length<2||label.length>100||labels.has(label)||unsafe.test(label)||o.description&&(!o.description.trim()||o.description.length>240||unsafe.test(o.description)))throw Error('Scaffold option content is invalid.');labels.add(label);if(ranks[o.level]<prior)throw Error('Scaffold levels must be ordered.');prior=ranks[o.level]}
 if(!input.some(x=>x.level==='explore'||x.level==='overview')||input.every(x=>['independent-use','design'].includes(x.level)))throw Error('Scaffold must include an introductory goal.')
 return input.map((o,index)=>({...o,label:o.label.trim(),...o.description?{description:o.description.trim()}:{},value:`choice_${index}_${Buffer.from(o.label.trim()).toString('base64url').slice(0,12)}`,provenance:'model-suggested' as const}))
}
export function scaffoldOptions(input?:readonly ScaffoldOptionInput[]):InterviewOption[]{const base=input?validateScaffoldOptions(input):GENERIC_GOAL_SCAFFOLD.map((o,index)=>({...o,value:`generic_${index}`,provenance:'host-generic' as const}));return[...base,{label:UNCERTAIN_OPTION_LABEL,value:'recommend_overview',level:'overview',provenance:'host-uncertainty'}]}
