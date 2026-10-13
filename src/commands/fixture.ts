/** Deterministic domain fixtures shared by tests and scripts: they drive the real commands, never hand-write state. */
import {INTERVIEW_PROBES,probeDefinition} from '../interview-probes.js'
import type {InterviewProbeId, LearnLoopState} from '../types.js'
import {activeProject,workspaceOf} from './shared.js'
import {prepareProfileInterviewQuestion,recordProfileInterviewAnswer} from './interview.js'

/** A fixture answer: option codes to pick, free text to type, or a number of weekly hours. */
export type FixtureAnswer=string|readonly string[]|number
export const DEFAULT_FIXTURE_ANSWERS:Readonly<Record<InterviewProbeId,FixtureAnswer>>={'goal.subject':'TypeScript','goal.outcome':['independent-use'],'current-foundation.relevant-experience':['small-practice'],'learning-mode.style':['balanced'],'time-budget.weekly-hours':4,'constraints.constraints':['none'],'success-criteria.criteria':['explain-to-others','complete-task'],'current-foundation.level':['intermediate'],'current-foundation.existing-resources':['course-or-book'],'knowledge-gaps.primary-gaps':['core-logic'],'time-budget.distribution':['few-sessions'],'time-budget.deadline':['none'],'learning-mode.example-preference':['walkthrough']}

/** Answer every remaining Probe through the native-question commands, ending in profile_review. Overriding an optional Probe adds it to the interview, as a model would. */
export function completeProfileInterviewFixture(state:LearnLoopState,workspaceId:string,overrides:Partial<Record<InterviewProbeId,FixtureAnswer>>={}){
 let next=state
 for(let step=0;step<60;step++){
  const w=workspaceOf(next,workspaceId),p=activeProject(w),interview=p.profileInterview
  if(p.phase!=='interviewing'||interview.status!=='collecting'||!interview.pendingQuestion)return next
  const pending=interview.pendingQuestion,sessionId=w.activeSessionId!,callId=`fixture-${pending.probeId}-${pending.questionRevision}`
  const optional=INTERVIEW_PROBES.filter(definition=>definition.presence==='optional'&&overrides[definition.id]!==undefined&&!interview.addedProbeIds.includes(definition.id)&&interview.probes[definition.id].status!=='answered').map(definition=>definition.id)
  next=prepareProfileInterviewQuestion(next,{sessionId,callId,questionToken:pending.token,...optional.length&&!interview.addedProbeIds.length?{enhancement:{addProbes:optional}}:{}})
  const active=activeProject(workspaceOf(next,workspaceId)).profileInterview.activeQuestion!,answer=overrides[pending.probeId]??DEFAULT_FIXTURE_ANSWERS[pending.probeId]
  const hostHours=(code:string)=>probeDefinition(pending.probeId).options.find(option=>option.code===code)?.hours
  const selected=Array.isArray(answer)?active.options.filter(option=>answer.includes(option.code)).map(option=>option.label):typeof answer==='number'?active.options.filter(option=>hostHours(option.code)===answer).map(option=>option.label):[]
  const custom=typeof answer==='string'?answer:typeof answer==='number'&&!selected.length?String(answer):undefined
  next=recordProfileInterviewAnswer(next,{sessionId,callId,questionId:active.questionId,selected,...custom===undefined?{}:{custom}})
 }
 return next
}
