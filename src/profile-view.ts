/** Host-built views of a learner Profile: review rows (with their edit specs) for the UI and a compact summary for the prompt. */
import {copyFor,probeDefinition,type Copy,type Language} from './interview-probes.js'
import type {FieldOrigin,InterviewProbeId,LearnerProfile,ProfileChoice,ProfileFieldName} from './types.js'

/** Profile fields a learner can edit in review, each backed by the Probe whose codes it uses. */
export const EDITABLE_PROFILE_FIELDS={goalSubject:'goal.subject',desiredOutcome:'goal.outcome',successCriteria:'success-criteria.criteria',priorExperience:'current-foundation.relevant-experience',experienceLevel:'current-foundation.level',learningStyle:'learning-mode.style',weeklyHours:'time-budget.weekly-hours',constraints:'constraints.constraints',availableResources:'current-foundation.existing-resources',knowledgeGaps:'knowledge-gaps.primary-gaps',timeDistribution:'time-budget.distribution',deadline:'time-budget.deadline',examplePreferences:'learning-mode.example-preference'} as const satisfies Partial<Record<ProfileFieldName,InterviewProbeId>>
export type EditableProfileField=keyof typeof EDITABLE_PROFILE_FIELDS
export interface ProfileFieldEdit{kind:'text'|'single'|'multi'|'number'|'deadline';options:{code:string;label:string;exclusive?:boolean}[];selected:string[];text?:string;hours?:number;date?:string|null}
export interface ProfileReviewRow{field:ProfileFieldName|'supplementaryAnswers';title:string;value:string;origin:FieldOrigin['kind']|null;modelWorded:boolean;inferenceReason:string|null;note:string|null;edit:ProfileFieldEdit|null}

const list=(choices:readonly ProfileChoice[],language:Language)=>choices.map(choice=>choice.label).join(language==='en'?', ':'、')
const depth:Record<LearnerProfile['learningPreferences']['explanationDepth'],Copy>={standard:{zh:'标准',en:'Standard'},deep:{zh:'深入',en:'In depth'}}
const copy={explanationDepth:{zh:'讲解深度',en:'Explanation depth'},additionalNotes:{zh:'补充说明',en:'Additional notes'},supplementaryAnswers:{zh:'补充回答',en:'Follow-up answers'},notAsked:{zh:'未询问',en:'Not asked'},notApplicable:{zh:'不适用（不做动手练习）',en:'Not applicable (no hands-on practice)'}} satisfies Record<string,Copy>
const editKind=(probeId:InterviewProbeId):ProfileFieldEdit['kind']=>{const kind=probeDefinition(probeId).kind;return kind==='free-text'?'text':kind==='ordinal'?'single':kind}
const editFor=(probeId:InterviewProbeId,language:Language,current:Partial<ProfileFieldEdit>):ProfileFieldEdit=>({kind:editKind(probeId),options:probeDefinition(probeId).options.map(option=>({code:option.code,label:copyFor(option.host,language),...option.exclusive?{exclusive:true}:{}})),selected:[],...current})

/** Every Profile field the learner confirms, with who decided it and how to change it; nothing is confirmed unseen. */
export function profileReviewRows(profile:LearnerProfile,language:Language):ProfileReviewRow[]{
 const notes=new Map(profile.learnerNotes.map(note=>[note.probeId,note.text])),p=profile.learningPreferences
 const row=(field:ProfileFieldName,value:string|null,edit:Partial<ProfileFieldEdit>|null,choices:readonly ProfileChoice[]=[]):ProfileReviewRow=>{
  const origin=profile.fieldOrigins[field],probeId=(EDITABLE_PROFILE_FIELDS as Partial<Record<ProfileFieldName,InterviewProbeId>>)[field]??null
  const title=probeId?probeDefinition(probeId).title:copy[field as keyof typeof copy]
  const shown=value??copyFor(origin.kind==='not-asked'&&origin.reason==='not-applicable'?copy.notApplicable:copy.notAsked,language)
  return{field,title:copyFor(title,language),value:shown,origin:origin.kind,modelWorded:choices.some(choice=>choice.source==='model'),inferenceReason:origin.kind==='model-inference'?origin.reason:null,note:probeId?notes.get(probeId)??null:null,edit:probeId&&edit?editFor(probeId,language,edit):null}
 }
 const codes=(choices:readonly ProfileChoice[]|null)=>({selected:(choices??[]).map(choice=>choice.code)})
 const rows=[
  row('goalSubject',profile.goalSubject,{text:profile.goalSubject}),
  row('desiredOutcome',profile.desiredOutcome,{selected:[profile.goalIntent]}),
  row('successCriteria',list(profile.successCriteria,language),codes(profile.successCriteria),profile.successCriteria),
  row('priorExperience',list(profile.priorExperience,language),codes(profile.priorExperience),profile.priorExperience),
  row('experienceLevel',copyFor(probeDefinition('current-foundation.level').options.find(option=>option.code===profile.experienceLevel)!.host,language),{selected:[profile.experienceLevel]}),
  row('learningStyle',profile.learningStyle.label,{selected:[profile.learningStyle.code]},[profile.learningStyle]),
  row('weeklyHours',language==='en'?`${profile.weeklyHours} hours`:`${profile.weeklyHours} 小时`,{hours:profile.weeklyHours}),
  row('constraints',profile.constraints&&list(profile.constraints,language),codes(profile.constraints),profile.constraints??[]),
  row('availableResources',profile.availableResources&&list(profile.availableResources,language),codes(profile.availableResources),profile.availableResources??[]),
  row('knowledgeGaps',profile.knowledgeGaps&&list(profile.knowledgeGaps,language),codes(profile.knowledgeGaps),profile.knowledgeGaps??[]),
  row('timeDistribution',profile.timeDistribution?.label??null,codes(profile.timeDistribution?[profile.timeDistribution]:null),profile.timeDistribution?[profile.timeDistribution]:[]),
  row('deadline',profile.deadline?(profile.deadline.date&&profile.deadline.date!==profile.deadline.label?`${profile.deadline.label}（${profile.deadline.date}）`:profile.deadline.label):null,{selected:profile.deadline&&profile.deadline.code!=='date'&&profile.deadline.code!=='other'?[profile.deadline.code]:[],date:profile.deadline?.date??null}),
  row('examplePreferences',p.examplePreferences&&list(p.examplePreferences,language),codes(p.examplePreferences),p.examplePreferences??[]),
  row('explanationDepth',copyFor(depth[p.explanationDepth],language),null),
  ...p.additionalNotes?[row('additionalNotes',p.additionalNotes,null)]:[],
 ]
 const supplementary=profile.supplementaryAnswers.filter(answer=>answer.status==='answered').map(answer=>({field:'supplementaryAnswers' as const,title:copyFor(copy.supplementaryAnswers,language),value:`${answer.question}\n→ ${[...answer.selected,...answer.custom?[answer.custom]:[]].join(language==='en'?', ':'、')}`,origin:null,modelWorded:true,inferenceReason:null,note:null,edit:null}))
 return[...rows,...supplementary]
}

const brief=(choices:readonly ProfileChoice[]|null)=>choices?choices.map(choice=>({code:choice.code,label:choice.label.slice(0,200)})):null
/** The Profile as the model needs it: codes and labels, no ids, timestamps, or provenance records; null means not asked. */
export function profileSummary(profile:LearnerProfile|null){
 if(!profile)return null
 const p=profile.learningPreferences
 return{goal:profile.goal,goalSubject:profile.goalSubject,goalIntent:profile.goalIntent,desiredOutcome:profile.desiredOutcome,successCriteria:brief(profile.successCriteria),experienceLevel:profile.experienceLevel,priorExperience:brief(profile.priorExperience),availableResources:brief(profile.availableResources),knowledgeGaps:brief(profile.knowledgeGaps),weeklyHours:profile.weeklyHours,timeDistribution:profile.timeDistribution?brief([profile.timeDistribution])![0]:null,deadline:profile.deadline?{code:profile.deadline.code,label:profile.deadline.label,date:profile.deadline.date}:null,learningStyle:{code:profile.learningStyle.code,label:profile.learningStyle.label},learningPreferences:{mode:p.mode,practiceCapacity:p.practiceCapacity,explanationDepth:p.explanationDepth,exampleDensity:p.exampleDensity,examplePreferences:brief(p.examplePreferences),additionalNotes:p.additionalNotes},constraints:brief(profile.constraints),followUpAnswers:profile.supplementaryAnswers.filter(answer=>answer.status==='answered').map(answer=>({question:answer.question,selected:answer.selected,custom:answer.custom})),learnerNotes:profile.learnerNotes.map(note=>note.text),assumedFields:Object.entries(profile.fieldOrigins).filter(([,origin])=>origin.kind==='model-inference').map(([field])=>field),derivedFields:Object.entries(profile.fieldOrigins).filter(([,origin])=>origin.kind==='host-derived').map(([field])=>field),confirmed:Boolean(profile.confirmedAt)}
}
