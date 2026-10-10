import {describe,expect,it} from 'vitest'
import {activeProject,approvePlanAdjustment,approveWorkspacePlan,beginWorkspaceOnboarding,completeProfileInterviewFixture,confirmWorkspaceProfile,createPlanDraftFromIntent,emptyState,nextAction,proposePlanAdjustment,workspaceOf} from '../src/index.js'

/**
 * Covers the "adjust the plan while teaching" capability: the model proposes, the Host compiles a
 * new immutable version as a draft, and the learner approves. The active plan is never replaced
 * silently, and verified progress is never undone by a revision.
 */

const basePlan=(extra:{title:string;conceptKey?:string;activity?:'explain'|'example'|'apply'}[])=>({stages:[{title:'基础',outcome:'理解边界',tasks:extra.map(item=>({title:item.title,objective:`${item.title} 的目标`,activity:item.activity??'explain' as const,acceptanceCriteria:['说清要点'],checkPrompt:'说清要点',estimateMinutes:20,...(item.conceptKey?{conceptKey:item.conceptKey}:{})}))}]})

const original=[{title:'第一课',conceptKey:'boundary'},{title:'第二课',activity:'example' as const,conceptKey:'roles'}]
const revised=[{title:'第一课',conceptKey:'boundary'},{title:'第一课补充',conceptKey:'boundary'},{title:'第二课',activity:'example' as const,conceptKey:'roles'}]

function active(){
 let state=beginWorkspaceOnboarding(emptyState(),{workspaceId:'ws',sessionId:'s',expectedRevision:0,idempotencyKey:'begin'})
 const projectId=workspaceOf(state,'ws').activeProjectId!
 const rev=()=>workspaceOf(state,'ws').revision
 state=completeProfileInterviewFixture(state,'ws',{'goal.subject':'Learn'})
 state=confirmWorkspaceProfile(state,{workspaceId:'ws',projectId,sessionId:'s',profileRevision:activeProject(workspaceOf(state,'ws')).profileRevision,expectedRevision:rev(),idempotencyKey:'confirm'})
 state=createPlanDraftFromIntent(state,{sessionId:'s',callId:'plan',plan:basePlan(original)})
 state=approveWorkspacePlan(state,{workspaceId:'ws',projectId,sessionId:'s',expectedRevision:rev(),idempotencyKey:'approve',planId:activeProject(workspaceOf(state,'ws')).plans[0]!.id})
 return{state,projectId,rev,ids:{workspaceId:'ws',projectId,sessionId:'s'}}
}

describe('plan adjustment while active',()=>{
 it('shares one concept identity across tasks naming the same conceptKey',()=>{
  const {state}=active()
  const tasks=activeProject(workspaceOf(state,'ws')).plans[0]!.stages.flatMap(s=>s.tasks)
  // Both tasks carry a distinct conceptKey, so they must not collapse onto one concept.
  expect(tasks[0]!.conceptId).not.toBe(tasks[1]!.conceptId)
  // And mastery is seeded once per concept, not once per task.
  const mastery=activeProject(workspaceOf(state,'ws')).mastery
  expect(mastery.map(m=>m.conceptId).sort()).toEqual(tasks.map(t=>t.conceptId).sort())
  expect(mastery.every(m=>m.level==='introduced')).toBe(true)
  expect(mastery.every(m=>m.lastPracticedAt===null&&m.nextReviewAt===null)).toBe(true)
 })

 it('compiles a proposal into a draft version and leaves the active plan untouched',()=>{
  const {state,ids,rev}=active()
  const before=activeProject(workspaceOf(state,'ws'))
  const proposed=proposePlanAdjustment(state,{...ids,callId:'adj-1',reason:'同一个概念需要更多练习',plan:basePlan(revised)})
  const p=activeProject(workspaceOf(proposed,'ws'))
  // The active version is unchanged; the proposal is only a draft awaiting approval.
  expect(p.activePlanId).toBe(before.activePlanId)
  expect(p.phase).toBe('active')
  expect(p.plans).toHaveLength(2)
  const draft=p.plans.find(plan=>plan.status==='draft')!
  expect(draft.version).toBe(2)
  expect(p.pendingPlanAdjustment).toMatchObject({planId:draft.id})
  expect(proposed.commandReceipts.at(-1)?.result).toMatchObject({kind:'plan-adjustment-proposed',planVersion:2})
  expect(rev()).toBeGreaterThan(0)
 })

 it('reuses the existing conceptId for a concept that survives the revision',()=>{
  const {state,ids}=active()
  const before=activeProject(workspaceOf(state,'ws')).plans[0]!.stages.flatMap(s=>s.tasks)
  const boundaryConcept=before.find(t=>t.title==='第一课')!.conceptId
  const proposed=proposePlanAdjustment(state,{...ids,callId:'adj-2',reason:'补一节练习',plan:basePlan(revised)})
  const draft=activeProject(workspaceOf(proposed,'ws')).plans.find(plan=>plan.status==='draft')!
  const tasks=draft.stages.flatMap(s=>s.tasks)
  // Both tasks that name `boundary` point at the concept the project already tracks.
  expect(tasks.filter(t=>t.title.startsWith('第一课')).map(t=>t.conceptId)).toEqual([boundaryConcept,boundaryConcept])
  expect(activeProject(workspaceOf(proposed,'ws')).mastery.some(row=>row.conceptId===boundaryConcept)).toBe(true)
 })

 it('activates the approved revision, supersedes the previous version, and introduces new concepts',()=>{
  const {state,ids}=active()
  const boundaryConcept=activeProject(workspaceOf(state,'ws')).plans[0]!.stages.flatMap(s=>s.tasks).find(t=>t.title==='第一课')!.conceptId
  const proposed=proposePlanAdjustment(state,{...ids,callId:'adj-3',reason:'补一节练习',plan:basePlan(revised)})
  const draft=activeProject(workspaceOf(proposed,'ws')).plans.find(plan=>plan.status==='draft')!
  const approved=approvePlanAdjustment(proposed,{...ids,expectedRevision:workspaceOf(proposed,'ws').revision,idempotencyKey:'approve-adjustment',planId:draft.id})
  const p=activeProject(workspaceOf(approved,'ws'))
  expect(p.activePlanId).toBe(draft.id)
  expect(p.plans.find(plan=>plan.version===1)!.status).toBe('superseded')
  expect(p.pendingPlanAdjustment).toBeNull()
  // Mastery keeps the surviving concept and gains a row for the concept the revision introduced.
  expect(p.mastery.some(row=>row.conceptId===boundaryConcept)).toBe(true)
  const conceptIds=p.mastery.map(row=>row.conceptId)
  expect(new Set(conceptIds).size).toBe(conceptIds.length)
  expect(approved.commandReceipts.at(-1)?.result).toMatchObject({kind:'plan-adjustment-approved',planVersion:2})
 })

 it('refuses a second proposal while one is pending and refuses approval without a proposal',()=>{
  const {state,ids}=active()
  const proposed=proposePlanAdjustment(state,{...ids,callId:'adj-4',reason:'首次调整',plan:basePlan(revised)})
  expect(()=>proposePlanAdjustment(proposed,{...ids,callId:'adj-5',reason:'再次调整',plan:basePlan(revised)})).toThrowError(expect.objectContaining({code:'PLAN_ALREADY_PUBLISHED'}))
  const draft=activeProject(workspaceOf(proposed,'ws')).plans.find(plan=>plan.status==='draft')!
  const taskId=nextAction(activeProject(workspaceOf(proposed,'ws')))!.id
  expect(taskId).toBeTruthy()
  expect(()=>approvePlanAdjustment(state,{...ids,expectedRevision:workspaceOf(state,'ws').revision,idempotencyKey:'approve-stale',planId:draft.id})).toThrowError(expect.objectContaining({code:'PLAN_APPROVAL_MISMATCH'}))
 })

 it('replays a proposal by idempotency key without creating a second version',()=>{
  const {state,ids}=active()
  const proposed=proposePlanAdjustment(state,{...ids,callId:'adj-6',reason:'幂等重放',plan:basePlan(revised)})
  const replayed=proposePlanAdjustment(proposed,{...ids,callId:'adj-6',reason:'幂等重放',plan:basePlan(revised)})
  expect(replayed).toBe(proposed)
  expect(activeProject(workspaceOf(replayed,'ws')).plans).toHaveLength(2)
  expect(()=>proposePlanAdjustment(proposed,{...ids,callId:'adj-6',reason:'不同理由',plan:basePlan(revised)})).toThrowError(expect.objectContaining({code:'IDEMPOTENCY_KEY_REUSED'}))
 })
})
