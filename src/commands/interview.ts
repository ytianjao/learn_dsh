/** Profile interview state machine: Host-defined Probes, bounded model enhancements, native/chat answers, recovery. */
import {randomUUID} from 'node:crypto'
import {LearnLoopDomainError, payloadHash} from '../domain.js'
import {copyFor,INTERVIEW_PROBES,probeDefinition,probesForTopic,type Language} from '../interview-probes.js'
import {buildQuestionSnapshot,nextProbeId,normalizeAnswer,normalizeChatAnswer,recommendationValue,validateAddProbes,validateAssumption,validateFollowUp,type AnswerOutcome} from '../interview-answer.js'
import {compileProfileDraftFromInterview} from '../profile-compiler.js'
import {interviewProbeIds, interviewTopics, learnLoopStateSchema, type CommandResult, type EnhancementReport, type InterviewProbeId, type LearningProject, type LearnLoopState, type ProbeValue, type ProfileInterviewState} from '../types.js'
import {activeProject,fail,now,resolveSessionWorkspace,uid,workspaceForSession} from './shared.js'
import {applyWorkspaceCommand} from './bus.js'

type StepStatus=Extract<CommandResult,{kind:'interview-answer-recorded'}>['status']
const languageOf=(state:LearnLoopState):Language=>state.settings.language
const noReport=():EnhancementReport=>({applied:[],rejected:[]})

/** A record over every key of an `as const` tuple, so it is exhaustive by construction rather than by assertion. */
function recordOver<K extends string,V>(keys:readonly K[],value:(key:K,index:number)=>V):Record<K,V>{const out={} as Record<K,V>;keys.forEach((key,index)=>{out[key]=value(key,index)});return out}
export function createProfileInterview(at=now()):ProfileInterviewState{
 const probes:ProfileInterviewState['probes']=recordOver(interviewProbeIds,(id,index)=>({id,topic:probeDefinition(id).topic,status:index===0?'asking' as const:'pending' as const,answerIds:[],emptyAttempts:0,clarifications:0,value:null,valueOrigin:null,note:null}))
 const topics:ProfileInterviewState['topics']=recordOver(interviewTopics,(topic,index)=>({topic,status:index===0?'collecting' as const:'pending' as const,requiredProbeIds:probesForTopic(topic).filter(id=>probeDefinition(id).presence!=='optional'),completedProbeIds:[]}))
 const first=INTERVIEW_PROBES[0]!
 return{schemaVersion:5,mode:'initial',status:'collecting',currentTopic:first.topic,currentProbeId:first.id,awaitingChatProbeId:null,fallbackAfterSeq:null,pendingQuestion:{token:randomUUID(),questionRevision:1,probeId:first.id,stage:'initial',followUpOf:null,createdAt:at},activeQuestion:null,optionSnapshots:[],topics,probes,answers:[],addedProbeIds:[],supplementaryAnswers:[],revisionRequest:null,createdAt:at,updatedAt:at}
}

const nextPending=(interview:ProfileInterviewState,probeId:InterviewProbeId,stage:'initial'|'clarification',followUpOf:InterviewProbeId|null,at:string)=>({token:randomUUID(),questionRevision:(interview.pendingQuestion?.questionRevision??0)+1,probeId,stage,followUpOf,createdAt:at})

/** Record a settled value for the current Probe and move to the next unanswered one. */
function settle(interview:ProfileInterviewState,probeId:InterviewProbeId,value:ProbeValue,origin:'learner'|'host-recommendation'|'model-inference',note:string|null,followUpOf:InterviewProbeId|null,at:string):ProfileInterviewState{
 const definition=probeDefinition(probeId),topic=interview.topics[definition.topic],completed=[...new Set([...topic.completedProbeIds,probeId])]
 let probes={...interview.probes,[probeId]:{...interview.probes[probeId],status:'answered' as const,emptyAttempts:0,value,valueOrigin:origin,note}}
 let topics={...interview.topics,[definition.topic]:{...topic,completedProbeIds:completed,status:topic.requiredProbeIds.every(id=>completed.includes(id))?'answered' as const:'collecting' as const}}
 const next=nextProbeId({...interview,probes})
 if(next){const nextTopic=probeDefinition(next).topic;probes={...probes,[next]:{...probes[next],status:'asking'}};topics={...topics,[nextTopic]:{...topics[nextTopic],status:'collecting'}}}
 return{...interview,probes,topics,status:next?'collecting':'drafted',currentProbeId:next,currentTopic:next?probeDefinition(next).topic:null,awaitingChatProbeId:null,fallbackAfterSeq:null,pendingQuestion:next?nextPending(interview,next,'initial',followUpOf,at):null,activeQuestion:null,updatedAt:at}
}

/** Commit an interview change; a drafted interview compiles the Profile in the same atomic update. */
function commitStep(state:LearnLoopState,context:{sessionId:string;idempotencyKey:string;action:string;payload:unknown},interview:ProfileInterviewState,status:StepStatus,requestFingerprint:string,enhancement:EnhancementReport){
 const w=workspaceForSession(state,context.sessionId),p=activeProject(w),probeId=p.profileInterview.currentProbeId!,language=languageOf(state)
 return applyWorkspaceCommand(state,{workspaceId:w.workspaceId,projectId:p.id,sessionId:context.sessionId,expectedRevision:w.revision,idempotencyKey:context.idempotencyKey},context.action,context.payload,(ws,project)=>{
  let changed:LearningProject={...project!,profileInterview:interview,updatedAt:interview.updatedAt}
  if(interview.status==='drafted'){const revision=changed.profileRevision+1,profile=compileProfileDraftFromInterview(interview,{id:changed.profile?.id??uid('profile'),revision,createdAt:changed.profile?.createdAt??interview.updatedAt,updatedAt:interview.updatedAt},language);changed={...changed,title:profile.goalSubject.slice(0,40)||changed.title,phase:'profile_review',profileRevision:revision,profile}}
  return{...ws,projects:{...ws.projects,[changed.id]:changed}}
 },next=>{const current=next.projects[p.id]!.profileInterview;return{kind:'interview-answer-recorded',status,probeId,nextProbeId:current.currentProbeId,nextQuestionToken:current.pendingQuestion?.token??null,requestFingerprint,enhancement,workspaceRevision:next.revision}})
}

export interface ProfileQuestionEnhancement{probeId?:unknown;question?:unknown;options?:unknown;assume?:unknown;followUp?:unknown;addProbes?:unknown}

/**
 * Start one interview step for the current token. Precedence: a valid follow-up is asked first,
 * then a valid assumption is recorded without asking, otherwise the current Probe is asked. Optional
 * Probes a model adds join the queue in every branch and are asked next. An invalid enhancement
 * never fails the step — it is dropped and reported. Only a stale token fails.
 */
export function prepareProfileInterviewQuestion(state:LearnLoopState,input:{sessionId:string;callId:string;questionToken:string;requestFingerprint?:string;enhancement?:ProfileQuestionEnhancement}){
 const w=workspaceForSession(state,input.sessionId),p=activeProject(w),interview=p.profileInterview,probeId=interview.currentProbeId
 if(p.phase!=='interviewing'||!probeId||interview.awaitingChatProbeId)fail('INTERVIEW_TOPIC_MISMATCH','No native interview question is currently available.')
 const pending=interview.pendingQuestion
 if(!pending||pending.token!==input.questionToken||pending.probeId!==probeId)throw new LearnLoopDomainError('INTERVIEW_QUESTION_STALE','The Profile question token is no longer current.')
 const enhancement=input.enhancement??{},requestFingerprint=input.requestFingerprint??payloadHash({tool:'learnloop_ask_profile_question',questionToken:input.questionToken,enhancement})
 const existing=interview.activeQuestion
 if(existing){if(existing.callId===input.callId){if(existing.requestFingerprint!==requestFingerprint)fail('IDEMPOTENCY_KEY_REUSED','The Interview callId was reused with different request semantics.');return state}throw new LearnLoopDomainError('INTERVIEW_TOPIC_MISMATCH','Another Profile question is already active.')}
 const language=languageOf(state),at=now(),questionId=`learnloop-profile-${pending.questionRevision}`,definition=probeDefinition(probeId!)
 const bound=enhancement.probeId===undefined||enhancement.probeId===probeId,deferred:EnhancementReport['rejected']=[],extraApplied:string[]=[]
 let queued=interview.addedProbeIds
 if(bound&&enhancement.addProbes!==undefined){const additions=validateAddProbes(interview,enhancement.addProbes);deferred.push(...additions.rejected);if(additions.added.length){queued=[...queued,...additions.added];extraApplied.push('addProbes')}}
 const ask=(active:NonNullable<ProfileInterviewState['activeQuestion']>)=>applyWorkspaceCommand(state,{workspaceId:w.workspaceId,projectId:p.id,sessionId:input.sessionId,expectedRevision:w.revision,idempotencyKey:`interview-question:${input.callId}`},'interview:question',{requestFingerprint},(ws,project)=>({...ws,projects:{...ws.projects,[project!.id]:{...project!,profileInterview:{...project!.profileInterview,addedProbeIds:queued,activeQuestion:active,optionSnapshots:active.optionSnapshotId?[...project!.profileInterview.optionSnapshots,{id:active.optionSnapshotId,probeId:active.probeId,options:active.options,createdAt:at}]:project!.profileInterview.optionSnapshots,updatedAt:at},updatedAt:at}}}))
 if(bound&&enhancement.followUp!==undefined){
  const followUp=validateFollowUp(interview,enhancement.followUp)
  if(followUp.ok)return ask({callId:input.callId,questionId,questionToken:input.questionToken,requestFingerprint,purpose:'follow-up',probeId:probeId!,stage:pending.stage,question:followUp.question,header:copyFor(definition.header,language),detail:null,multiSelect:followUp.multiSelect,options:followUp.options,optionSnapshotId:null,enhancement:{applied:['followUp',...extraApplied],rejected:deferred},createdAt:at})
  deferred.push({field:'followUp',reason:(followUp as {reason:string}).reason})
 }
 if(bound&&enhancement.assume!==undefined){
  const assumption=validateAssumption(interview,enhancement.assume,language)
  if(assumption.ok){
   const answerId=uid('interview-answer'),answers=[...interview.answers,{id:answerId,probeId:probeId!,topic:definition.topic,source:'model-inference' as const,sessionId:input.sessionId,questionId:null,questionCallId:input.callId,selected:[],custom:null,codes:assumption.codes,inference:{reason:assumption.reason},messageId:null,eventSeq:null,contentHash:null,status:'answered' as const,createdAt:at}]
   const withAnswer={...interview,addedProbeIds:queued,answers,probes:{...interview.probes,[probeId!]:{...interview.probes[probeId!],answerIds:[...interview.probes[probeId!].answerIds,answerId]}}}
   const settled=settle(withAnswer,probeId!,assumption.value,'model-inference',null,null,at)
   return commitStep(state,{sessionId:input.sessionId,idempotencyKey:`interview:${input.callId}`,action:'interview:assume',payload:{requestFingerprint}},settled,settled.status==='drafted'?'profile-review':'next-question-ready',requestFingerprint,{applied:['assume',...extraApplied],rejected:deferred})
  }
  deferred.push({field:'assume',reason:assumption.reason})
 }
 const snapshot=buildQuestionSnapshot(interview,enhancement,language),optionSnapshotId=snapshot.options.length?uid('option-snapshot'):null
 return ask({callId:input.callId,questionId,questionToken:input.questionToken,requestFingerprint,purpose:'probe',probeId:probeId!,stage:pending.stage,question:snapshot.question,header:snapshot.header,detail:snapshot.detail,multiSelect:snapshot.multiSelect,options:snapshot.options,optionSnapshotId,enhancement:{applied:[...snapshot.report.applied,...extraApplied],rejected:[...deferred,...snapshot.report.rejected]},createdAt:at})
}

/** Apply one learner answer (native or chat) to the current Probe. */
function advanceInterview(state:LearnLoopState,input:{sessionId:string;commandId:string;probeId:InterviewProbeId;source:'native-question'|'direct-user-message';questionId:string|null;questionCallId:string|null;selected:string[];custom?:string;messageId:string|null;eventSeq:number|null;contentHash:string|null;outcome:AnswerOutcome;fallbackAfterSeq?:number;requestFingerprint:string;enhancement:EnhancementReport}){
 const w=workspaceForSession(state,input.sessionId),p=activeProject(w),interview=p.profileInterview,probeId=interview.currentProbeId
 if(p.phase!=='interviewing'||probeId!==input.probeId)fail('INTERVIEW_TOPIC_MISMATCH','Answer does not match the current probe.')
 const id=probeId!,definition=probeDefinition(id),prior=interview.probes[id],language=languageOf(state),at=now(),answerId=uid('interview-answer'),custom=input.custom?.trim()||null
 let outcome=input.outcome,note:string|null=null
 // One clarification re-ask; after that the Host recommendation stands, with the learner's words kept as a note.
 if(outcome.kind==='clarify'&&prior.clarifications>=1){const value=recommendationValue(definition,interview,language);if(value){outcome={kind:'value',value,origin:'host-recommendation',codes:value.kind==='choices'?value.choices.map(x=>x.code):value.kind==='deadline'?[value.deadline.code]:[],uncertain:true};note=custom}}
 const answers=[...interview.answers,{id:answerId,probeId:id,topic:definition.topic,source:input.source,sessionId:input.sessionId,questionId:input.questionId,questionCallId:input.questionCallId,selected:input.selected,custom,codes:outcome.kind==='value'?outcome.codes:[],inference:null,messageId:input.messageId,eventSeq:input.eventSeq,contentHash:input.contentHash,status:outcome.kind==='value'?(outcome.uncertain?'uncertain' as const:'answered' as const):outcome.kind==='empty'?'empty' as const:'insufficient' as const,createdAt:at}]
 const withAnswer={...interview,answers,probes:{...interview.probes,[id]:{...prior,answerIds:[...prior.answerIds,answerId]}}}
 let next:ProfileInterviewState,status:StepStatus
 if(outcome.kind==='value'){next=settle(withAnswer,id,outcome.value,outcome.origin,note,id,at);status=next.status==='drafted'?'profile-review':'next-question-ready'}
 else if(outcome.kind==='clarify'){next={...withAnswer,probes:{...withAnswer.probes,[id]:{...withAnswer.probes[id],status:'asking',clarifications:prior.clarifications+1}},awaitingChatProbeId:null,fallbackAfterSeq:null,pendingQuestion:nextPending(interview,id,'clarification',null,at),activeQuestion:null,updatedAt:at};status='clarification-required'}
 else{const emptyAttempts=prior.emptyAttempts+1,fallback=emptyAttempts>=2;next={...withAnswer,probes:{...withAnswer.probes,[id]:{...withAnswer.probes[id],status:fallback?'fallback-to-chat':'asking',emptyAttempts}},awaitingChatProbeId:fallback?id:interview.awaitingChatProbeId,fallbackAfterSeq:fallback?(input.fallbackAfterSeq??input.eventSeq??0):interview.fallbackAfterSeq,pendingQuestion:nextPending(interview,id,interview.pendingQuestion?.stage??'initial',null,at),activeQuestion:null,updatedAt:at};status=fallback?'fallback-to-chat':'retry-native-question'}
 return commitStep(state,{sessionId:input.sessionId,idempotencyKey:`interview:${input.commandId}`,action:'interview:answer',payload:{callId:input.commandId,questionId:input.questionId,selected:input.selected,custom}},next,status,input.requestFingerprint,input.enhancement)
}

export function recordProfileInterviewAnswer(state:LearnLoopState,input:{sessionId:string;callId:string;questionId:string;selected:string[];custom?:string;fallbackAfterSeq?:number}){
 const w=workspaceForSession(state,input.sessionId),receipt=state.commandReceipts.find(r=>r.workspaceId===w.workspaceId&&r.idempotencyKey===`interview:${input.callId}`)
 if(receipt){const payload={callId:input.callId,questionId:input.questionId,selected:input.selected,custom:input.custom?.trim()||null},fingerprint=payloadHash({action:'interview:answer',workspaceId:w.workspaceId,projectId:receipt.projectId,payload});if(receipt.action==='interview:answer'&&receipt.payloadHash===fingerprint)return state;fail('IDEMPOTENCY_KEY_REUSED','Idempotency key was reused with different content.')}
 const p=activeProject(w),snapshot=p.profileInterview.activeQuestion
 if(!snapshot||snapshot.callId!==input.callId||snapshot.questionId!==input.questionId)throw new LearnLoopDomainError('INTERVIEW_QUESTION_STALE','The Profile question token is no longer current.')
 if(snapshot.purpose==='follow-up'){
  // A follow-up only adds context: the answer joins supplementaryAnswers and the same Probe is asked next.
  const interview=p.profileInterview,pending=interview.pendingQuestion!,after=pending.followUpOf??snapshot.probeId,at=now(),custom=input.custom?.trim()||null,selected=input.selected.filter(label=>snapshot.options.some(option=>option.label===label))
  const next:ProfileInterviewState={...interview,supplementaryAnswers:[...interview.supplementaryAnswers,{id:uid('supplementary-answer'),topic:probeDefinition(after).topic,afterProbeId:after,question:snapshot.question,selected,custom,status:selected.length||custom?'answered':'skipped',createdAt:at}],pendingQuestion:nextPending(interview,snapshot.probeId,pending.stage,null,at),activeQuestion:null,updatedAt:at}
  return commitStep(state,{sessionId:input.sessionId,idempotencyKey:`interview:${input.callId}`,action:'interview:answer',payload:{callId:input.callId,questionId:input.questionId,selected:input.selected,custom}},next,'follow-up-recorded',snapshot.requestFingerprint,snapshot.enhancement)
 }
 const outcome=normalizeAnswer(probeDefinition(snapshot.probeId),snapshot.options,input.selected,input.custom,p.profileInterview,languageOf(state))
 return advanceInterview(state,{...input,commandId:input.callId,probeId:snapshot.probeId,source:'native-question',questionCallId:input.callId,messageId:null,eventSeq:null,contentHash:null,outcome,requestFingerprint:snapshot.requestFingerprint,enhancement:snapshot.enhancement})
}
export type InterviewQuestionReleaseReason='ask-aborted'|'caller-not-live'|'delegated-caller'|'provider-unavailable'|'provider-error'|'contract-invalid'|'startup-recovery'|'agent-disposed'
export function releaseProfileInterviewQuestion(state:LearnLoopState,input:{sessionId:string;callId:string;reason?:InterviewQuestionReleaseReason}){const resolution=resolveSessionWorkspace(state,input.sessionId);if(resolution.kind!=='resolved')return state;const p=activeProject(resolution.workspace),snapshot=p.profileInterview.activeQuestion,answered=state.commandReceipts.some(r=>r.workspaceId===resolution.workspace.workspaceId&&r.idempotencyKey===`interview:${input.callId}`&&r.result?.kind==='interview-answer-recorded'),released=state.commandReceipts.some(r=>r.workspaceId===resolution.workspace.workspaceId&&r.idempotencyKey===`interview-release:${input.callId}`&&r.result?.kind==='interview-question-released');if(answered||released||!snapshot||snapshot.callId!==input.callId)return state;const reason=input.reason??'provider-error';return applyWorkspaceCommand(state,{workspaceId:resolution.workspace.workspaceId,projectId:p.id,sessionId:input.sessionId,expectedRevision:resolution.workspace.revision,idempotencyKey:`interview-release:${input.callId}`},'interview:release-question',{callId:input.callId,reason},(ws,project)=>({...ws,projects:{...ws.projects,[project!.id]:{...project!,profileInterview:{...project!.profileInterview,activeQuestion:null,pendingQuestion:project!.profileInterview.pendingQuestion?{...project!.profileInterview.pendingQuestion,token:randomUUID(),questionRevision:project!.profileInterview.pendingQuestion.questionRevision+1,createdAt:now()}:null,updatedAt:now()}}}}),ws=>({kind:'interview-question-released',callId:input.callId,probeId:snapshot.probeId,questionId:snapshot.questionId,reason,workspaceRevision:ws.revision}))}
export function reconcileProfileInterviewQuestions(state:LearnLoopState,liveQuestionCallKeys:ReadonlySet<string>,reason:Extract<InterviewQuestionReleaseReason,'startup-recovery'|'agent-disposed'>='startup-recovery'){
 let next=state
 for(const original of Object.values(state.workspaces)){const project=original.activeProjectId?original.projects[original.activeProjectId]:undefined,snapshot=project?.profileInterview.activeQuestion;if(!project||!snapshot)continue;const current=next.workspaces[original.workspaceId]!,answer=next.commandReceipts.some(r=>r.workspaceId===original.workspaceId&&r.idempotencyKey===`interview:${snapshot.callId}`&&r.result?.kind==='interview-answer-recorded'),release=next.commandReceipts.some(r=>r.workspaceId===original.workspaceId&&r.idempotencyKey===`interview-release:${snapshot.callId}`&&r.result?.kind==='interview-question-released');if(answer||release){const p=current.projects[project.id]!;next=learnLoopStateSchema.parse({...next,workspaces:{...next.workspaces,[original.workspaceId]:{...current,projects:{...current.projects,[project.id]:{...p,profileInterview:{...p.profileInterview,activeQuestion:null}}}}}});continue}if(liveQuestionCallKeys.has(`${original.workspaceId}:${project.id}:${snapshot.callId}`))continue;if(current.activeSessionId)next=releaseProfileInterviewQuestion(next,{sessionId:current.activeSessionId,callId:snapshot.callId,reason})}
 return next
}
export function consumeProfileFallbackMessage(state:LearnLoopState,input:{sessionId:string;messageId:string;eventSeq:number;text:string}){
 const resolution=resolveSessionWorkspace(state,input.sessionId);if(resolution.kind==='none')return state;if(resolution.kind!=='resolved')return fail('WORKSPACE_AMBIGUOUS','Session is active in multiple LearnLoop Workspaces.');const w=resolution.workspace,p=activeProject(w),probeId=p.profileInterview.awaitingChatProbeId
 if(!probeId||p.profileInterview.currentProbeId!==probeId||input.eventSeq<=(p.profileInterview.fallbackAfterSeq??Number.MAX_SAFE_INTEGER)||!input.text.trim())return state
 const options=[...p.profileInterview.optionSnapshots].reverse().find(snapshot=>snapshot.probeId===probeId)?.options??[],outcome=normalizeChatAnswer(probeDefinition(probeId),options,input.text,p.profileInterview,languageOf(state))
 return advanceInterview(state,{sessionId:input.sessionId,commandId:`chat:${input.messageId}`,probeId,source:'direct-user-message',questionId:null,questionCallId:null,selected:[],custom:input.text,messageId:input.messageId,eventSeq:input.eventSeq,contentHash:payloadHash(input.text),outcome,requestFingerprint:payloadHash({source:'chat',commandId:`chat:${input.messageId}`}),enhancement:noReport()})
}
