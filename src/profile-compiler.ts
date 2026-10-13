/** Explicit projection from settled interview Probes to a learner Profile: codes in, codes out, no text heuristics. */
import {hostOptions} from './interview-answer.js'
import {RECOMMENDED_CRITERIA_BY_OUTCOME,STYLE_PREFERENCES,levelFromExperience,probeDefinition,type Language} from './interview-probes.js'
import {goalIntents,learnerProfileSchema,type FieldOrigin,type FieldOrigins,type GoalIntent,type InterviewProbeId,type LearnerProfile,type ProbeValue,type ProfileChoice,type ProfileInterviewState} from './types.js'

const valueOf=(interview:ProfileInterviewState,id:InterviewProbeId):ProbeValue|null=>interview.probes[id].status==='answered'?interview.probes[id].value:null
const required=(interview:ProfileInterviewState,id:InterviewProbeId):ProbeValue=>{const value=valueOf(interview,id);if(!value)throw new Error(`Profile Probe ${id} has no settled value.`);return value}
const choicesOf=(value:ProbeValue|null):ProfileChoice[]|null=>value?.kind==='choices'?value.choices:null
const oneOf=<T extends string>(code:string|undefined,allowed:readonly T[],fallback:T):T=>allowed.includes(code as T)?code as T:fallback

/** Who decided a Probe's value: the learner (typed or picked), a Host recommendation, or a model assumption. */
export function probeOrigin(interview:ProfileInterviewState,id:InterviewProbeId):FieldOrigin{
 const probe=interview.probes[id],answers=interview.answers.filter(answer=>probe.answerIds.includes(answer.id)&&(answer.status==='answered'||answer.status==='uncertain')),last=answers.at(-1)
 if(probe.status!=='answered')return{kind:'not-asked',reason:probeDefinition(id).presence==='conditional'?'not-applicable':'optional'}
 if(probe.valueOrigin==='model-inference'&&last?.inference)return{kind:'model-inference',answerIds:[last.id],reason:last.inference.reason}
 if(probe.valueOrigin==='host-recommendation')return{kind:'host-recommendation',basedOnAnswerIds:answers.map(answer=>answer.id),recommendationPolicy:`${id}:recommendation`}
 if(!last)return{kind:'host-default',defaultName:id}
 if(last.selected.length)return{kind:'learner-choice',answerIds:[last.id],optionSnapshotId:[...interview.optionSnapshots].reverse().find(snapshot=>snapshot.probeId===id&&snapshot.createdAt<=last.createdAt)?.id??null}
 return{kind:'learner-text',answerIds:[last.id]}
}

/** Success criteria for an outcome when the learner was not asked for them, with Host labels. */
export function derivedSuccessCriteria(goalIntent:GoalIntent,language:Language):ProfileChoice[]{const options=hostOptions(probeDefinition('success-criteria.criteria'),language);return RECOMMENDED_CRITERIA_BY_OUTCOME[goalIntent].map(code=>({code,label:options.find(option=>option.code===code)!.label,source:'host' as const}))}

export function compileProfileDraftFromInterview(interview:ProfileInterviewState,context:{id:string;revision:number;createdAt:string;updatedAt:string},language:Language='zh-CN'):LearnerProfile{
 const subjectValue=required(interview,'goal.subject'),subject=subjectValue.kind==='text'?subjectValue.text:''
 const outcome=choicesOf(required(interview,'goal.outcome'))![0]!,goalIntent:GoalIntent=oneOf(outcome.code,goalIntents,'overview')
 const experience=choicesOf(required(interview,'current-foundation.relevant-experience'))!,style=choicesOf(required(interview,'learning-mode.style'))![0]!,preferences=STYLE_PREFERENCES[style.code]??STYLE_PREFERENCES.balanced!
 const hours=required(interview,'time-budget.weekly-hours'),deadline=valueOf(interview,'time-budget.deadline'),examples=choicesOf(valueOf(interview,'learning-mode.example-preference'))
 const askedLevel=choicesOf(valueOf(interview,'current-foundation.level'))?.[0]?.code,askedCriteria=choicesOf(valueOf(interview,'success-criteria.criteria'))
 const origin=(id:InterviewProbeId)=>probeOrigin(interview,id),styleOrigin=origin('learning-mode.style')
 const fieldOrigins:FieldOrigins={goalSubject:origin('goal.subject'),desiredOutcome:origin('goal.outcome'),
  successCriteria:askedCriteria?origin('success-criteria.criteria'):{kind:'host-derived',fromFields:['desiredOutcome'],rule:'criteria-from-outcome'},
  experienceLevel:askedLevel?origin('current-foundation.level'):{kind:'host-derived',fromFields:['priorExperience'],rule:'level-from-experience'},
  priorExperience:origin('current-foundation.relevant-experience'),availableResources:origin('current-foundation.existing-resources'),knowledgeGaps:origin('knowledge-gaps.primary-gaps'),weeklyHours:origin('time-budget.weekly-hours'),timeDistribution:origin('time-budget.distribution'),deadline:origin('time-budget.deadline'),
  learningStyle:styleOrigin,learningMode:styleOrigin,practiceCapacity:styleOrigin,examplePreferences:origin('learning-mode.example-preference'),constraints:origin('constraints.constraints'),
  explanationDepth:{kind:'host-default',defaultName:'standard'},exampleDensity:examples?origin('learning-mode.example-preference'):{kind:'host-default',defaultName:'standard'},additionalNotes:{kind:'host-default',defaultName:'empty'}}
 return learnerProfileSchema.parse({id:context.id,revision:context.revision,goal:language==='en'?`${subject}: ${outcome.label}`:`${subject}，并${outcome.label}`,goalSubject:subject,goalIntent,desiredOutcome:outcome.label,
  experienceLevel:oneOf(askedLevel,['beginner','intermediate','advanced'] as const,levelFromExperience(experience.map(choice=>choice.code))),priorExperience:experience,knowledgeGaps:choicesOf(valueOf(interview,'knowledge-gaps.primary-gaps')),
  learningStyle:style,learningPreferences:{mode:preferences.mode,practiceCapacity:preferences.practiceCapacity,explanationDepth:'standard',exampleDensity:examples?.some(choice=>choice.code==='example-rich')?'high':'standard',examplePreferences:examples,additionalNotes:''},
  weeklyHours:hours.kind==='hours'?hours.hours:2,deadline:deadline?.kind==='deadline'?deadline.deadline:null,constraints:choicesOf(valueOf(interview,'constraints.constraints')),successCriteria:askedCriteria??derivedSuccessCriteria(goalIntent,language),
  availableResources:choicesOf(valueOf(interview,'current-foundation.existing-resources')),timeDistribution:choicesOf(valueOf(interview,'time-budget.distribution'))?.[0]??null,supplementaryAnswers:interview.supplementaryAnswers,
  learnerNotes:Object.values(interview.probes).flatMap(probe=>probe.note?[{probeId:probe.id,text:probe.note}]:[]),fieldOrigins,confirmedAt:null,createdAt:context.createdAt,updatedAt:context.updatedAt})
}
