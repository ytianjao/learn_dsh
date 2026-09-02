import {mkdtemp} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {activeProject,approveWorkspacePlan,assessCurrentCandidate,beginTaskCheck,beginWorkspaceOnboarding,commitWorkspaceProfile,completeProfileInterviewFixture,confirmWorkspaceProfile,createEvidenceCandidate,createPlanDraftFromIntent,emptyState,startTask,workspaceOf,type LearnLoopState} from '../src/index.js'
import {sha256} from '../src/content/hash.js'
import type {LessonSourceMessage,LessonSourceSegment} from '../src/content/schemas.js'

export const contentPlan={stages:[{title:'基础阶段',outcome:'理解边界',tasks:[{title:'第一课：边界',objective:'解释执行边界',activity:'explain' as const,acceptanceCriteria:['说清边界'],checkPrompt:'用自己的话解释边界',estimateMinutes:20},{title:'第二课：示例',objective:'看懂示例',activity:'example' as const,acceptanceCriteria:['指出关键点'],checkPrompt:'指出示例的关键点',estimateMinutes:20}]}]}
const verifier=(seq:number)=>({provider:'mock',model:'keyless',requestEventSeq:seq,assistantMessageEventSeq:seq+1,turn:1,step:1,toolCallId:`call-${seq}`,policyVersion:'learnloop-verifier-v1' as const,rubricVersion:'learnloop-rubric-v1' as const})

/** Drive one task through the verified loop with deterministic session sequences. */
export function passTask(state:LearnLoopState,ids:{workspaceId:string;projectId:string;sessionId:string},taskId:string,seq:{start:number;arm:number;answer:number;assess:number},options?:{failFirst?:{misconceptions:string[]}}):LearnLoopState{
 const rev=()=>workspaceOf(state,ids.workspaceId).revision
 state=startTask(state,{...ids,taskId,expectedRevision:rev(),idempotencyKey:`start-${taskId}-${seq.start}`,sessionSeq:seq.start})
 state=beginTaskCheck(state,{...ids,taskId,expectedRevision:rev(),idempotencyKey:`check-${taskId}-${seq.arm}`,armedAfterSeq:seq.arm})
 const answer=(suffix:string)=>{const answerText=`学习者答案-${taskId}-${suffix}`;state=createEvidenceCandidate(state,{sessionId:ids.sessionId,messageIds:[`m-${taskId}-${suffix}`],answerText,contentHash:sha256(answerText),eventSeqs:[seq.answer]});return answerText}
 const assess=(overall:'needs-work'|'passed',misconceptions:string[],suffix:string,assessSeq:number)=>{const answerText=answer(suffix);state=assessCurrentCandidate(state,{sessionId:ids.sessionId,idempotencyKey:`assess-${taskId}-${suffix}`,criteria:workspaceOf(state,ids.workspaceId).projects[ids.projectId]!.plans.flatMap(p=>p.stages).flatMap(s=>s.tasks).find(t=>t.id===taskId)!.acceptanceCriteria.map((_,criterionIndex)=>({criterionIndex,result:overall==='needs-work'?'failed' as const:'passed' as const,explanation:'x'})),overall,misconceptions,feedback:overall==='needs-work'?'还差一些':'通过',verifier:verifier(assessSeq),provenance:{messageIds:[`m-${taskId}-${suffix}`],eventSeqs:[seq.answer],contentHash:sha256(answerText)}})}
 if(options?.failFirst){assess('needs-work',options.failFirst.misconceptions,'first',seq.assess);state=beginTaskCheck(state,{...ids,taskId,expectedRevision:rev(),idempotencyKey:`check2-${taskId}`,armedAfterSeq:seq.assess+2});assess('passed',[],'second',seq.assess+4)}
 else assess('passed',[],'only',seq.assess)
 return state
}

/** A project with an active plan whose two tasks have passed verification. */
export function readyContentState(){
 let state=beginWorkspaceOnboarding(emptyState(),{workspaceId:'ws',sessionId:'s',expectedRevision:0,idempotencyKey:'begin'})
 const projectId=workspaceOf(state,'ws').activeProjectId!
 state=completeProfileInterviewFixture(state,'ws')
 state=commitWorkspaceProfile(state,{workspaceId:'ws',projectId,sessionId:'s',expectedRevision:workspaceOf(state,'ws').revision,idempotencyKey:'profile',goal:'学习运行时边界',targetOutcome:'能解释并应用',priorKnowledge:'有一定基础',experienceLevel:'intermediate',knowledgeGaps:[],learningMode:'balanced',practiceCapacity:'light',weeklyHours:4,constraints:[],successCriteria:['能解释']})
 state=confirmWorkspaceProfile(state,{workspaceId:'ws',projectId,sessionId:'s',profileRevision:1,expectedRevision:workspaceOf(state,'ws').revision,idempotencyKey:'confirm'})
 state=createPlanDraftFromIntent(state,{sessionId:'s',callId:'plan',plan:contentPlan})
 state=approveWorkspacePlan(state,{workspaceId:'ws',projectId,planId:activeProject(workspaceOf(state,'ws')).plans[0]!.id,expectedRevision:workspaceOf(state,'ws').revision,idempotencyKey:'approve',sessionId:'s'})
 const ids={workspaceId:'ws',projectId,sessionId:'s'}
 const tasks=activeProject(workspaceOf(state,'ws')).plans[0]!.stages[0]!.tasks
 state=passTask(state,ids,tasks[0]!.id,{start:1,arm:5,answer:7,assess:9})
 state=passTask(state,ids,tasks[1]!.id,{start:11,arm:15,answer:17,assess:19},{failFirst:{misconceptions:['误区甲：以为边界可选']}})
 return{state,projectId,taskIds:tasks.map(t=>t.id)}
}

/** A fake session reader: deterministic teaching text per segment, a real request header, one known URL. */
export const fakeSessionReader=(texts:{teaching?:string;revision?:string}={})=>{
 const teaching=texts.teaching??'本课讲解执行边界：状态迁移只能由 Host 命令完成。详见 https://example.com/runtime-boundary 这份公开资料。'
 const revision=texts.revision??'补充讲解：边界与角色分工。'
 return{
  tailSeq:()=>99,
  userMessages:()=>null,
  requestHeader:(_sessionId:string,_callId:string)=>({provider:'mock',model:'keyless',seq:30,assistantMessageEventSeq:31,turn:1,step:1}),
  assistantTextMessagesInSegments:(segments:readonly LessonSourceSegment[])=>{
   const messages:LessonSourceMessage[]=[]
   for(const segment of segments){const text=segment.phase==='teaching'?teaching:revision;messages.push({sessionId:segment.sessionId,messageId:`msg-${segment.fromExclusiveSeq}`,eventSeq:segment.fromExclusiveSeq+1,contentHash:sha256(text),text})}
   return messages
  },
 }
}

export const fakeTable=(initial:LearnLoopState)=>{let state=initial;return{get:()=>state,put:async(_id:string,value:LearnLoopState)=>{state=value},update:async(_id:string,fn:(current:LearnLoopState)=>LearnLoopState)=>{state=fn(state);return state}}}

export const tempRepo=async()=>new (await import('../src/content/repository.js')).ContentRepository(await mkdtemp(join(tmpdir(),'learnloop-content-test-')))

export const lessonIntentFixture=(overrides:Record<string,unknown>={})=>({title:'执行边界入门',summary:'本文讲解执行边界的含义与用途。',learningObjectives:['理解执行边界'],prerequisites:[],sections:[{kind:'introduction',title:'引入',markdown:'边界是可靠性的基础。'},{kind:'concept',title:'核心概念',markdown:'**执行边界**区分状态与行动。'},{kind:'example',title:'示例',markdown:'- 状态由 Host 写入'},{kind:'summary',title:'小结',markdown:'边界让因果可追踪。'}],keyTakeaways:['边界清晰','状态可追','失败可重试'],glossary:[{term:'边界',definition:'职责分界'}],reviewQuestions:[{question:'边界的作用？'},{question:'谁来迁移状态？'}],references:[],...overrides})
