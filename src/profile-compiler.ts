import type {InterviewProbeId,LearnerProfile,ProfileInterviewState} from './types.js'
import type {GoalIntent} from './interview-probes.js'
import type {z} from 'zod'
import {learnerProfileSchema} from './types.js'

const value=(i:ProfileInterviewState,id:InterviewProbeId)=>i.probes[id].normalizedValue
const text=(i:ProfileInterviewState,id:InterviewProbeId)=>String(value(i,id)??'').trim()
const answeredIds=(i:ProfileInterviewState,ids:readonly InterviewProbeId[])=>ids.flatMap(id=>i.probes[id].answerIds).filter(id=>i.answers.some(a=>a.id===id&&(a.status==='answered'||a.status==='uncertain')))
const learnerText=(i:ProfileInterviewState,ids:readonly InterviewProbeId[])=>({kind:'learner-text' as const,answerIds:answeredIds(i,ids)})

type FieldOrigins=z.infer<typeof learnerProfileSchema>['fieldOrigins']

/**
 * The single provenance algorithm for a learner Profile: every field records which interview
 * answers produced it. The confirmed-profile path uses the same builder, so a field can no longer
 * carry origins derived by a different rule than the value it describes.
 */
export function fieldOriginsForInterview(i:ProfileInterviewState):FieldOrigins{
 const defaults=(defaultName:string)=>({kind:'host-default' as const,defaultName})
 const outcome=[...i.answers].reverse().find(a=>a.probeId==='goal.outcome'&&(a.status==='answered'||a.status==='uncertain'))
 const snapshot=i.optionSnapshots.find(s=>s.id===i.activeQuestion?.optionSnapshotId)||[...i.optionSnapshots].reverse().find(s=>s.probeId==='goal.outcome')
 const option=snapshot?.options.find(o=>outcome?.selected.includes(o.label)),recommended=outcome?.status==='uncertain'||option?.provenance==='host-uncertainty'
 const outcomeOrigin=recommended?{kind:'host-recommendation' as const,basedOnAnswerIds:answeredIds(i,['goal.outcome']),recommendationPolicy:'conservative-entry-overview'}:outcome?.custom?learnerText(i,['goal.outcome']):{kind:'learner-choice' as const,answerIds:answeredIds(i,['goal.outcome']),optionSnapshotId:snapshot?.id??'missing-snapshot'}
 const examplePreference=text(i,'learning-mode.example-preference')
 return{goal:learnerText(i,['goal.subject']),goalSubject:learnerText(i,['goal.subject']),goalIntent:learnerText(i,['goal.subject']),desiredOutcome:outcomeOrigin,targetOutcome:outcomeOrigin,priorKnowledge:learnerText(i,['current-foundation.relevant-experience']),experienceLevel:learnerText(i,['current-foundation.level']),knowledgeGaps:learnerText(i,['knowledge-gaps.primary-gaps']),weeklyHours:learnerText(i,['time-budget.weekly-hours']),timeDistribution:learnerText(i,['time-budget.distribution']),availableResources:learnerText(i,['current-foundation.existing-resources']),deadline:learnerText(i,['time-budget.deadline']),learningMode:learnerText(i,['learning-mode.mode']),practiceCapacity:learnerText(i,['practice-capacity.capacity']),constraints:learnerText(i,['constraints.constraints']),successCriteria:learnerText(i,['success-criteria.criteria']),explanationDepth:defaults('standard'),exampleDensity:examplePreference?learnerText(i,['learning-mode.example-preference']):defaults('standard'),additionalNotes:examplePreference?learnerText(i,['learning-mode.example-preference']):defaults('empty')}
}
export function compileProfileDraftFromInterview(interview:ProfileInterviewState,context:{id:string;revision:number;createdAt:string;updatedAt:string}):LearnerProfile{
 const subject=text(interview,'goal.subject'),outcome=text(interview,'goal.outcome'),deadline=text(interview,'time-budget.deadline'),constraints=text(interview,'constraints.constraints'),examplePreference=text(interview,'learning-mode.example-preference')
 const outcomeAnswer=[...interview.answers].reverse().find(a=>a.probeId==='goal.outcome'&&(a.status==='answered'||a.status==='uncertain'))
 const snapshot=interview.optionSnapshots.find(s=>s.id===interview.activeQuestion?.optionSnapshotId)||[...interview.optionSnapshots].reverse().find(s=>s.probeId==='goal.outcome')
 const option=snapshot?.options.find(o=>outcomeAnswer?.selected.includes(o.label)),recommended=outcomeAnswer?.status==='uncertain'||option?.provenance==='host-uncertainty'
 const goalIntent:GoalIntent=recommended?'overview':option?.level??'overview',desiredOutcome=recommended?'理解核心概念和完整流程':outcome
 const outcomeOrigin=recommended?{kind:'host-recommendation' as const,basedOnAnswerIds:answeredIds(interview,['goal.outcome']),recommendationPolicy:'conservative-entry-overview'}:outcomeAnswer?.custom?learnerText(interview,['goal.outcome']):{kind:'learner-choice' as const,answerIds:answeredIds(interview,['goal.outcome']),optionSnapshotId:snapshot?.id??'missing-snapshot'}
 const highExamples=/(大量案例|案例密集|每个阶段都要有案例|主要通过案例学习)/i.test(examplePreference)
 const fields=fieldOriginsForInterview(interview)
 return{id:context.id,revision:context.revision,goal:`${subject}，并${desiredOutcome}`,goalSubject:subject,goalIntent,desiredOutcome,goalKind:null,targetOutcome:[desiredOutcome,text(interview,'target-outcome.quality-bar')].filter(Boolean).join(' / '),priorKnowledge:text(interview,'current-foundation.relevant-experience'),experienceLevel:(value(interview,'current-foundation.level')||'beginner') as LearnerProfile['experienceLevel'],knowledgeGaps:[text(interview,'knowledge-gaps.primary-gaps')],learningPreferences:{mode:(value(interview,'learning-mode.mode')||'balanced') as LearnerProfile['learningPreferences']['mode'],practiceCapacity:(value(interview,'practice-capacity.capacity')||'none') as LearnerProfile['learningPreferences']['practiceCapacity'],explanationDepth:'standard',exampleDensity:highExamples?'high':'standard',additionalNotes:examplePreference},weeklyHours:Number(value(interview,'time-budget.weekly-hours')||10),timeDistribution:text(interview,'time-budget.distribution')||null,availableResources:['无','没有','还没有任何资料','none'].includes(text(interview,'current-foundation.existing-resources').toLowerCase())?[]:[text(interview,'current-foundation.existing-resources')].filter(Boolean),deadline:deadline&&!['无','没有','不知道','none','no deadline','没有明确期限'].includes(deadline.toLowerCase())?deadline:undefined,constraints:['无','没有','无额外限制','none','没有特别限制'].includes(constraints.toLowerCase())?[]:[constraints].filter(Boolean),successCriteria:[text(interview,'success-criteria.criteria')||desiredOutcome],unansweredQuestions:[],fieldOrigins:fields,confirmedAt:null,createdAt:context.createdAt,updatedAt:context.updatedAt}
}
