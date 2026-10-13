import {describe,expect,it} from 'vitest'
import {activeProject,approveWorkspacePlan,assessCurrentCandidate,beginTaskCheck,beginWorkspaceOnboarding,completeProfileInterviewFixture,confirmWorkspaceProfile,createEvidenceCandidate,createPlanDraftFromIntent,emptyState,startTask,workspaceOf} from '../src/index.js'
import {sha256} from '../src/content/hash.js'

/**
 * Behavioural coverage for assessment settlement. The previous spec only asserted that source
 * strings existed; these drive real state through assessCurrentCandidate and check the domain
 * guarantees the Verified Answer Loop depends on.
 */

const plan={stages:[{title:'Stage',outcome:'Learn',tasks:[{title:'Task',objective:'Explain',activity:'explain' as const,acceptanceCriteria:['A','B'],checkPrompt:'Explain',estimateMinutes:20},{title:'Successor',objective:'Apply',activity:'apply' as const,acceptanceCriteria:['C'],checkPrompt:'Apply',estimateMinutes:20}]}]}
const verifier=(seq:number)=>({provider:'mock',model:'keyless',requestEventSeq:seq,assistantMessageEventSeq:seq+1,turn:1,step:1,toolCallId:`call-${seq}`,policyVersion:'learnloop-verifier-v1' as const,rubricVersion:'learnloop-rubric-v1' as const})
const ids={workspaceId:'ws',projectId:'',sessionId:'s'}

/** Reach an armed check on the single-task plan, then capture one answer candidate. */
function armed(){
 let state=beginWorkspaceOnboarding(emptyState(),{workspaceId:'ws',sessionId:'s',expectedRevision:0,idempotencyKey:'begin'})
 ids.projectId=workspaceOf(state,'ws').activeProjectId!
 const rev=()=>workspaceOf(state,'ws').revision
 state=completeProfileInterviewFixture(state,'ws',{'goal.subject':'Learn'})
 state=confirmWorkspaceProfile(state,{...ids,profileRevision:activeProject(workspaceOf(state,'ws')).profileRevision,expectedRevision:rev(),idempotencyKey:'confirm'})
 state=createPlanDraftFromIntent(state,{sessionId:'s',callId:'plan',plan})
 state=approveWorkspacePlan(state,{...ids,planId:activeProject(workspaceOf(state,'ws')).plans[0]!.id,expectedRevision:rev(),idempotencyKey:'approve'})
 const taskId=activeProject(workspaceOf(state,'ws')).plans[0]!.stages[0]!.tasks[0]!.id
 state=startTask(state,{...ids,taskId,expectedRevision:rev(),idempotencyKey:'start',sessionSeq:1})
 state=beginTaskCheck(state,{...ids,taskId,expectedRevision:rev(),idempotencyKey:'check',armedAfterSeq:3})
 const answerText='answer',contentHash=sha256(answerText)
 state=createEvidenceCandidate(state,{sessionId:'s',messageIds:['m1'],answerText,contentHash,eventSeqs:[4]})
 return{state,taskId,contentHash}
}
const passing=[{criterionIndex:0,result:'passed' as const,explanation:'x'},{criterionIndex:1,result:'passed' as const,explanation:'x'}]
const base=(contentHash:string,inputKey:string)=>({sessionId:'s',idempotencyKey:inputKey,misconceptions:[] as string[],feedback:'ok',verifier:verifier(5),provenance:{messageIds:['m1'],eventSeqs:[4],contentHash}})

describe('assessment settlement',()=>{
 it('rejects criteria that do not cover every acceptance criterion exactly once',()=>{
  const {state,contentHash}=armed()
  const shared={...base(contentHash,'a'),overall:'passed' as const}
  expect(()=>assessCurrentCandidate(state,{...shared,criteria:[{criterionIndex:0,result:'passed',explanation:'x'}]})).toThrowError(expect.objectContaining({code:'ASSESSMENT_INVALID'}))
  expect(()=>assessCurrentCandidate(state,{...shared,criteria:[{criterionIndex:0,result:'passed',explanation:'x'},{criterionIndex:0,result:'passed',explanation:'x'}]})).toThrowError(expect.objectContaining({code:'ASSESSMENT_INVALID'}))
  expect(()=>assessCurrentCandidate(state,{...shared,criteria:[{criterionIndex:0,result:'passed',explanation:'x'},{criterionIndex:9,result:'passed',explanation:'x'}]})).toThrowError(expect.objectContaining({code:'ASSESSMENT_INVALID'}))
 })
 it('rejects an overall result that contradicts the criterion results',()=>{
  const {state,contentHash}=armed()
  const shared=base(contentHash,'b'),gap=[{criterionIndex:0,result:'passed' as const,explanation:'x'},{criterionIndex:1,result:'failed' as const,explanation:'x'}]
  expect(()=>assessCurrentCandidate(state,{...shared,overall:'passed',criteria:gap})).toThrowError(expect.objectContaining({code:'ASSESSMENT_INVALID'}))
  expect(()=>assessCurrentCandidate(state,{...shared,overall:'needs-work',criteria:passing})).toThrowError(expect.objectContaining({code:'ASSESSMENT_INVALID'}))
 })
 it('rejects provenance that drifts from the captured candidate',()=>{
  const {state,contentHash}=armed()
  expect(()=>assessCurrentCandidate(state,{...base('0'.repeat(64),'c'),overall:'passed',criteria:passing})).toThrowError(expect.objectContaining({code:'CANDIDATE_SOURCE_MISSING'}))
  expect(()=>assessCurrentCandidate(state,{...base(contentHash,'c'),overall:'passed',criteria:passing,provenance:{messageIds:['other'],eventSeqs:[4],contentHash}})).toThrowError(expect.objectContaining({code:'CANDIDATE_SOURCE_MISSING'}))
 })
 it('records a needs-work assessment without writing evidence, mastery, or completion',()=>{
  const {state,contentHash,taskId}=armed()
  const settled=assessCurrentCandidate(state,{...base(contentHash,'d'),overall:'needs-work',misconceptions:['误区甲'],feedback:'还差一些',criteria:[{criterionIndex:0,result:'failed',explanation:'x'},{criterionIndex:1,result:'passed',explanation:'x'}]})
  const p=activeProject(workspaceOf(settled,'ws'))
  expect(p.assessments).toHaveLength(1)
  expect(p.assessments[0]!.result).toBe('needs-work')
  expect(p.evidence).toHaveLength(0)
  expect(p.mastery[0]!.level).toBe('introduced')
  expect(p.mastery[0]!.evidenceIds).toEqual([])
  expect(p.misconceptions).toContain('误区甲')
  expect(p.plans[0]!.stages[0]!.tasks.find(t=>t.id===taskId)!.status).toBe('active')
  expect(p.execution).toMatchObject({phase:'needs-revision',candidateId:null})
  expect(settled.commandReceipts.at(-1)?.result).toMatchObject({kind:'assessment-settled',result:'needs-work',taskCompleted:false,failedCriteria:[0]})
 })
 it('settles a passed assessment atomically and never auto-starts the successor',()=>{
  const {state,contentHash}=armed()
  const settled=assessCurrentCandidate(state,{...base(contentHash,'e'),overall:'passed',criteria:passing})
  const p=activeProject(workspaceOf(settled,'ws'))
  expect([p.assessments.length,p.evidence.length]).toEqual([1,1])
  expect(p.evidence[0]!.kind).toBe('assessment')
  expect(p.mastery[0]!.level).toBe('practicing')
  expect(p.mastery[0]!.evidenceIds).toEqual([p.evidence[0]!.id])
  expect(p.plans[0]!.stages[0]!.tasks[0]!.status).toBe('completed')
  expect(p.execution?.candidateId).toBeNull()
 })
})
