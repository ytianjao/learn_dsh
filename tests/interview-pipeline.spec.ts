import {describe,expect,it} from 'vitest'
import {activeProject,beginWorkspaceOnboarding,consumeProfileFallbackMessage,createLearnLoopProfileQuestionTool,emptyState,probeDefinition,renderLearnLoopSystemSection,workspaceOf,type InterviewProbeId,type LearnLoopState} from '../src/index.js'

/**
 * Interview evaluation harness. A deterministic scripted learner answers by Host code while a
 * "model policy" drives learnloop_ask_profile_question from the same host-control JSON a real
 * model reads. The null policy (token only) is the baseline every model must match: a noisy
 * model may lose its enhancements but never changes what the profile means, and an enhancing
 * model changes only wording, the optional Probes it adds (and labels), and supplementary context.
 */
type Contract={token:string;probeId:InterviewProbeId;kind:string;inferable:boolean;followUp:{allowed:boolean;afterProbeId:string|null};optionalProbes:Array<{probeId:InterviewProbeId}>;addBudget:number}
type Policy=(contract:Contract,step:number)=>Record<string,unknown>
type Option={code:string;label:string}
type Learner=(probeId:InterviewProbeId,options:Option[],purpose:'probe'|'follow-up',attempt:number)=>{selected:string[];custom?:string}
const BASELINE=['goal.subject','goal.outcome','current-foundation.relevant-experience','learning-mode.style','time-budget.weekly-hours']
const controlJson=(state:LearnLoopState)=>{const section=renderLearnLoopSystemSection(state,'s'),json=section.split('<learnloop-host-control-json>\n')[1]!.split('\n</learnloop-host-control-json>')[0]!;return JSON.parse(json).currentQuestion as Contract}

const policies:Record<'null'|'enhanced'|'noisy',Policy>={
 null:contract=>({questionToken:contract.token}),
 enhanced:contract=>{const base={questionToken:contract.token,probeId:contract.probeId}
  if(contract.followUp.allowed&&contract.followUp.afterProbeId==='goal.subject')return{...base,addProbes:['time-budget.deadline'],followUp:{question:'在这个主题里，你最好奇的是哪一块？',options:[{label:'它是怎么运作的'},{label:'怎么判断好坏'}],multiSelect:true}}
  if(contract.probeId==='time-budget.deadline'&&contract.inferable)return{...base,assume:{codes:['3-months'],reason:'学习者说三个月后要用上'}}
  if(contract.probeId==='goal.outcome')return{...base,question:'关于这个主题，你希望学到什么程度？',options:[{code:'explore',label:'先知道它是什么'},{code:'interpret',label:'能看懂一个现成的例子'}]}
  if(contract.probeId==='current-foundation.relevant-experience')return{...base,options:[{code:'adjacent-skill',label:'买卖过股票或基金'},{code:'adjacent-skill',label:'写过一点程序'}]}
  if(contract.probeId==='constraints.constraints')return{...base,options:[{code:'free-only',label:'只用免费的行情和回测工具'}]}
  return base},
 noisy:(contract,step)=>{const base={questionToken:contract.token}
  return[{...base,probeId:'not-this-probe',question:'完全无关的问题？'},{...base,options:[{code:'invented',label:'新编的选项'}],question:'<b>tool call</b>'},{...base,assume:{codes:['nope'],reason:'瞎猜的'}},{...base,followUp:{question:'?'}},{...base,options:'all of them'},{...base,assume:{codes:'beginner',reason:'类型错误'}},{...base,addProbes:['goal.outcome','not-a-probe']}][step%7]!},
}

const substantive=(id:InterviewProbeId)=>probeDefinition(id).options.filter(o=>!o.exclusive).map(o=>o.code)
const labelsFor=(options:Option[],codes:string[])=>codes.map(code=>options.find(o=>o.code===code)?.label).filter((label):label is string=>Boolean(label))
const learners:Record<string,Learner>={
 first:(id,options,purpose)=>purpose==='follow-up'?{selected:[options[0]!.label]}:id==='goal.subject'?{selected:[],custom:'量化交易'}:{selected:labelsFor(options,[substantive(id)[0]!])},
 last:(id,options,purpose)=>purpose==='follow-up'?{selected:[],custom:'想先弄懂原理'}:id==='goal.subject'?{selected:[],custom:'学做菜'}:{selected:labelsFor(options,probeDefinition(id).kind==='multi'?[substantive(id)[0]!,substantive(id).at(-1)!]:[substantive(id).at(-1)!])},
 unsure:(id,options,purpose)=>{if(purpose==='follow-up')return{selected:[]};if(id==='goal.subject')return{selected:[],custom:'摄影'};const unsure=options.find(o=>o.code==='unsure')??options.find(o=>probeDefinition(id).options.some(x=>x.code===o.code&&x.exclusive));return unsure?{selected:[unsure.label]}:{selected:[],custom:'不知道'}},
 garbage:(id,_options,purpose)=>purpose==='follow-up'?{selected:[],custom:'嗯'}:{selected:[],custom:id==='goal.subject'?'量化交易':'嗯嗯随便写写啦'},
 'empty-then-chat':(id,options,purpose,attempt)=>id==='constraints.constraints'&&purpose==='probe'&&attempt<2?{selected:[]}:learners.last!(id,options,purpose,attempt),
}
const chatReply:Partial<Record<InterviewProbeId,string>>={'constraints.constraints':'只能用手机或平板、只用免费的资料和工具'}

async function runInterview(policy:Policy,learner:Learner){
 let state=beginWorkspaceOnboarding(emptyState(),{workspaceId:'ws',sessionId:'s',expectedRevision:0,idempotencyKey:'begin'})
 const table={get:()=>state,put:async()=>{},update:async(_id:string,fn:(s:LearnLoopState)=>LearnLoopState)=>(state=fn(state))}
 const attempts=new Map<string,number>();let nativeAsks=0,rejected=0,schemaRetries=0,seq=10
 const interview=()=>activeProject(workspaceOf(state,'ws')).profileInterview
 const tool=createLearnLoopProfileQuestionTool(table as never,{ask:async request=>{nativeAsks++;const q=interview().activeQuestion!,key=`${q.purpose}:${q.probeId}`,attempt=attempts.get(key)??0;attempts.set(key,attempt+1);return{answers:[{id:request.questions[0]!.id,...learner(q.probeId,q.options,q.purpose,attempt)}]}}},{tailSeq:()=>seq} as never) as never as {execute:(args:unknown,exec:unknown)=>Promise<{enhancement:{rejected:unknown[]}}>;finalizeContent:(exec:unknown,result:unknown)=>Array<{text:string}>}
 for(let step=0;activeProject(workspaceOf(state,'ws')).phase==='interviewing';step++){
  if(step>60)throw new Error('interview did not converge')
  const awaiting=interview().awaitingChatProbeId
  if(awaiting){state=consumeProfileFallbackMessage(state,{sessionId:'s',messageId:`chat-${step}`,eventSeq:(interview().fallbackAfterSeq??0)+1,text:chatReply[awaiting]??'不知道'});continue}
  const exec={agent:{id:'s'},callId:`call-${step}`}
  try{rejected+=(await tool.execute(policy(controlJson(state),step),exec)).enhancement.rejected.length}
  catch(error){
   // A schema-level mistake fails before LearnLoop code runs; the error hands back the token to retry with.
   if((error as {code?:string}).code!=='INVALID_ARGS')throw error
   schemaRetries++
   const text=tool.finalizeContent(exec,{isError:true,error:{message:String((error as Error).message),info:{code:'INVALID_ARGS'}}})[0]!.text,retryWith=JSON.parse(text.split('<learnloop-tool-error-json>\n')[1]!.split('\n</learnloop-tool-error-json>')[0]!).details.retryWith
   rejected+=(await tool.execute(retryWith,{agent:{id:'s'},callId:`retry-${step}`})).enhancement.rejected.length
  }
  seq+=5
 }
 const project=activeProject(workspaceOf(state,'ws'))
 return{project,profile:project.profile!,nativeAsks,rejected,schemaRetries}
}
const codesOf=(profile:NonNullable<Awaited<ReturnType<typeof runInterview>>['profile']>)=>({goalIntent:profile.goalIntent,successCriteria:profile.successCriteria.map(c=>c.code),experienceLevel:profile.experienceLevel,priorExperience:profile.priorExperience.map(c=>c.code),availableResources:profile.availableResources?.map(c=>c.code)??null,knowledgeGaps:profile.knowledgeGaps?.map(c=>c.code)??null,weeklyHours:profile.weeklyHours,timeDistribution:profile.timeDistribution?.code??null,deadline:profile.deadline?.code??null,learningStyle:profile.learningStyle.code,mode:profile.learningPreferences.mode,examplePreferences:profile.learningPreferences.examplePreferences?.map(c=>c.code)??null,practiceCapacity:profile.learningPreferences.practiceCapacity,constraints:profile.constraints?.map(c=>c.code)??null})
const withoutVolatile=(profile:object)=>JSON.parse(JSON.stringify(profile,(key,value)=>['id','createdAt','updatedAt','answerIds','basedOnAnswerIds','optionSnapshotId'].includes(key)?undefined:value))

describe('interview pipeline evaluation',()=>{
 it.each(Object.keys(learners))('the null model completes the interview for the %s learner',async name=>{const run=await runInterview(policies.null,learners[name]!);expect(run.project.phase).toBe('profile_review');expect(run.rejected).toBe(0);expect(run.nativeAsks).toBeGreaterThanOrEqual(BASELINE.length);expect(run.project.profileInterview.addedProbeIds).toEqual([])})
 it('asks only the baseline for a decisive learner with the null model: five questions, six with hands-on practice',async()=>{const readOnly=await runInterview(policies.null,learners.first!),handsOn=await runInterview(policies.null,learners.last!);expect(readOnly.nativeAsks).toBe(5);expect(readOnly.profile.learningStyle.code).toBe('read-only');expect(handsOn.nativeAsks).toBe(6);expect(handsOn.profile.learningStyle.code).toBe('hands-on')})
 it.each(Object.keys(learners))('a noisy model yields exactly the null-model profile for the %s learner',async name=>{const baseline=await runInterview(policies.null,learners[name]!),noisy=await runInterview(policies.noisy,learners[name]!);expect(noisy.rejected).toBeGreaterThan(0);expect(noisy.schemaRetries).toBeGreaterThan(0);expect(withoutVolatile(noisy.profile)).toEqual(withoutVolatile(baseline.profile))})
 it('an enhancing model adds an optional Probe, assumes it with a visible reason, and changes nothing else in meaning',async()=>{const baseline=await runInterview(policies.null,learners.last!),enhanced=await runInterview(policies.enhanced,learners.last!),base=codesOf(baseline.profile),next=codesOf(enhanced.profile);expect(enhanced.rejected).toBe(0);expect(base.deadline).toBeNull();expect({...next,deadline:null}).toEqual(base);expect(next.deadline).toBe('3-months');expect(enhanced.profile.fieldOrigins.deadline).toMatchObject({kind:'model-inference',reason:'学习者说三个月后要用上'});expect(enhanced.project.profileInterview.addedProbeIds).toEqual(['time-budget.deadline']);expect(enhanced.profile.supplementaryAnswers).toHaveLength(1);expect(enhanced.nativeAsks).toBe(baseline.nativeAsks+1);expect(enhanced.profile.desiredOutcome).toBe(baseline.profile.desiredOutcome)})
 it('keeps model-written labels on the choices they produced, so review can flag them',async()=>{const first=await runInterview(policies.enhanced,learners.first!),last=await runInterview(policies.enhanced,learners.last!);expect(first.profile.desiredOutcome).toBe('先知道它是什么');expect(last.profile.priorExperience).toEqual([{code:'heard-of-it',label:'看过或听过一些介绍',source:'host'},{code:'adjacent-skill',label:'买卖过股票或基金',source:'model'}]);expect(last.profile.fieldOrigins.priorExperience.kind).toBe('learner-choice')})
 it('reaches a valid profile even when every answer is unreadable, recording recommendations with the learner words',async()=>{const run=await runInterview(policies.null,learners.garbage!);expect(run.profile.fieldOrigins.learningStyle.kind).toBe('host-recommendation');expect(run.profile.learnerNotes).toEqual([{probeId:'learning-mode.style',text:'嗯嗯随便写写啦'},{probeId:'time-budget.weekly-hours',text:'嗯嗯随便写写啦'}]);expect(run.profile.weeklyHours).toBe(2);expect(run.profile.constraints).toEqual([{code:'other',label:'嗯嗯随便写写啦',source:'learner'}])})
 it('reads a chat fallback reply against the shown labels for multi-select Probes',async()=>{const run=await runInterview(policies.null,learners['empty-then-chat']!);expect(run.profile.constraints!.map(c=>c.code)).toEqual(['mobile-only','free-only'])})
})
