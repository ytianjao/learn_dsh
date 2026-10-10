import {describe,expect,it} from 'vitest'
import {BACKUP_FORMAT_VERSION,emptyState,learnLoopDomainSpec,learnLoopStateSchema,validatePlanIntent,type LearnerProfile} from '../src/index.js'

/**
 * Guards the three version numbers that must move together when the persisted shape changes
 * (AGENTS.md, "When you change things"). They live in three different files with nothing checking them against each
 * other, so a missed bump previously surfaced only as a deserialization failure at runtime.
 */
describe('persistence epoch versions',()=>{
 it('keeps state schema, Storage Domain, and backup format on the same epoch',()=>{
  const schemaVersion = learnLoopStateSchema.shape.schemaVersion.value
  const domainVersion = learnLoopDomainSpec.version
  const backupVersion = BACKUP_FORMAT_VERSION
  // Each epoch raises all three by exactly one from the 15/12/9 baseline, so the offsets are fixed.
  expect(schemaVersion).toBe(16)
  expect(domainVersion).toBe(13)
  expect(backupVersion).toBe(10)
  expect(schemaVersion - 15).toBe(domainVersion - 12)
  expect(schemaVersion - 15).toBe(backupVersion - 9)
 })
 it('builds an empty state that already satisfies the current schema',()=>{
  const state = emptyState()
  expect(state.schemaVersion).toBe(16)
  expect(learnLoopStateSchema.parse(state)).toEqual(state)
 })
})

const profile=(overrides:Partial<LearnerProfile['learningPreferences']>={},weeklyHours=4):LearnerProfile=>({
  id:'profile',revision:1,goal:'学运行时边界，并理解核心概念',goalSubject:'运行时边界',goalIntent:'overview',desiredOutcome:'理解核心概念',goalKind:null,targetOutcome:'能解释',
  priorKnowledge:'有一些经验',experienceLevel:'intermediate',knowledgeGaps:['不知道从哪开始'],
  learningPreferences:{mode:'balanced',practiceCapacity:'light',explanationDepth:'standard',exampleDensity:'standard',additionalNotes:'',...overrides},
  weeklyHours,deadline:undefined,constraints:[],successCriteria:['能解释'],unansweredQuestions:[],fieldOrigins:{},confirmedAt:null,createdAt:'2026-01-01T00:00:00.000Z',updatedAt:'2026-01-01T00:00:00.000Z',
})

const task=(title:string,activity:'explain'|'example'|'apply',estimateMinutes=20)=>({title,objective:`${title} 的目标`,activity,acceptanceCriteria:['说清要点'],checkPrompt:'说清要点',estimateMinutes})
const plan=(tasks:ReturnType<typeof task>[])=>({stages:[{title:'阶段一',outcome:'理解',tasks:tasks.length?tasks:[task('兜底','explain')]}]})
/** Spread tasks across stages; the schema caps a stage at 10 tasks. */
const spread=(tasks:ReturnType<typeof task>[])=>({stages:Array.from({length:Math.ceil(tasks.length/10)},(_,index)=>({title:`阶段${index+1}`,outcome:'理解',tasks:tasks.slice(index*10,index*10+10)}))})

describe('plan validation against the confirmed profile',()=>{
 it('rejects apply activities when the learner has no practice capacity',()=>{
  // docs/PRODUCT_CONTRACT.md states the mode gate; it was previously unenforced.
  const intent=plan([task('讲解','explain'),task('动手','apply')])
  expect(()=>validatePlanIntent(intent,profile({practiceCapacity:'none'}))).toThrowError(expect.objectContaining({code:'INVALID_PLAN'}))
  expect(()=>validatePlanIntent(intent,profile({practiceCapacity:'full'}))).not.toThrow()
 })
 it('rejects a plan that cannot be finished in the learner time budget',()=>{
  // Fourteen 240-minute tasks is 56 weeks at one hour per week — past a year of work.
  const heavy=spread(Array.from({length:14},(_,index)=>task(`任务${index}`,index%2?'explain':'example',240)))
  expect(()=>validatePlanIntent(heavy,profile({},1))).toThrowError(expect.objectContaining({code:'INVALID_PLAN'}))
  expect(()=>validatePlanIntent(heavy,profile({},80))).not.toThrow()
 })
})
