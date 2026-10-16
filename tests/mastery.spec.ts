import {describe,expect,it} from 'vitest'
import {masteryLevelFor,masteryRowsForPlan,type PlanVersion} from '../src/index.js'
import {nextReviewIso,isReviewDue,REVIEW_POLICY_VERSION} from '../src/review-policy.js'

/**
 * The mastery ladder was previously a dead enum: only `introduced` and `demonstrated` were ever
 * written, and `practicing`/`mastered` were unreachable no matter how much evidence accumulated.
 * These assert the documented ladder from docs/PRODUCT_CONTRACT.md is actually reachable.
 */

describe('mastery ladder',()=>{
 it('advances one step per verified evidence item and never skips a level',()=>{
  expect(masteryLevelFor([],0)).toBe('introduced')
  expect(masteryLevelFor(['e1'],1)).toBe('practicing')
  expect(masteryLevelFor(['e1','e2'],2)).toBe('demonstrated')
  expect(masteryLevelFor(['e1','e2','e3'],3)).toBe('mastered')
 })
 it('requires assessment-backed evidence before mastering',()=>{
  // Three items without a formal assessment cannot reach mastered.
  expect(masteryLevelFor(['e1','e2','e3'],0)).toBe('demonstrated')
  // A single passed answer never exceeds practising, so `mastered` cannot be won in one sitting.
  expect(masteryLevelFor(['e1'],1)).toBe('practicing')
 })
})

describe('mastery rows from a plan',()=>{
 const plan=(tasks:{title:string;conceptId:string}[]):PlanVersion=>({id:'plan',version:1,status:'draft',createdAt:'2026-01-01T00:00:00.000Z',stages:[{id:'stage',title:'S',outcome:'O',tasks:tasks.map(t=>({id:t.title,title:t.title,objective:'o',activity:'explain' as const,acceptanceCriteria:['c'],checkPrompt:'c',estimateMinutes:20,status:'pending' as const,conceptId:t.conceptId}))}]})
 it('emits one row per concept, not one per task',()=>{
  const rows=masteryRowsForPlan(plan([{title:'a',conceptId:'concept_1'},{title:'b',conceptId:'concept_1'},{title:'c',conceptId:'concept_2'}]),'2026-01-01T00:00:00.000Z')
  // Two tasks share concept_1, which must not produce duplicate rows (React key collisions and
  // double-counted evidence).
  expect(rows.map(r=>r.conceptId)).toEqual(['concept_1','concept_2'])
  expect(new Set(rows.map(r=>r.conceptId)).size).toBe(rows.length)
 })
 it('starts every concept at introduced with no practice or review timestamps',()=>{
  const rows=masteryRowsForPlan(plan([{title:'a',conceptId:'concept_1'}]),'2026-01-01T00:00:00.000Z')
  expect(rows[0]).toMatchObject({level:'introduced',evidenceIds:[],lastPracticedAt:null,nextReviewAt:null})
 })
})

describe('spaced-review policy',()=>{
 // Fixed base time: 2026-01-01T00:00:00.000Z
 const BASE='2026-01-01T00:00:00.000Z'
 const DAY_MS=24*60*60*1000
 const addDays=(n:number)=>new Date(new Date(BASE).getTime()+n*DAY_MS).toISOString()
 // nextReviewIso takes evidenceCount as prior count (0 = first pass), so index maps to INTERVAL_DAYS[0..4] = 1/3/7/14/30
 it('schedules 1 day after the first pass (0 prior evidence)',()=>{expect(nextReviewIso(0,BASE)).toBe(addDays(1))})
 it('schedules 3 days after the second pass',()=>{expect(nextReviewIso(1,BASE)).toBe(addDays(3))})
 it('schedules 7 days after the third pass',()=>{expect(nextReviewIso(2,BASE)).toBe(addDays(7))})
 it('schedules 14 days after the fourth pass',()=>{expect(nextReviewIso(3,BASE)).toBe(addDays(14))})
 it('caps at 30 days for five or more passes',()=>{
  expect(nextReviewIso(4,BASE)).toBe(addDays(30))
  expect(nextReviewIso(10,BASE)).toBe(addDays(30))
 })
 it('marks a row due when nextReviewAt has passed',()=>{
  const past=new Date(Date.now()-DAY_MS).toISOString()
  const future=new Date(Date.now()+DAY_MS).toISOString()
  expect(isReviewDue(past)).toBe(true)
  expect(isReviewDue(future)).toBe(false)
  expect(isReviewDue(null)).toBe(false)
 })
 it('exports a stable policy version string',()=>{expect(REVIEW_POLICY_VERSION).toBe('learnloop-review-v1')})
})

/**
 * The mastery ladder was previously a dead enum: only `introduced` and `demonstrated` were ever
 * written, and `practicing`/`mastered` were unreachable no matter how much evidence accumulated.
 * These assert the documented ladder from docs/PRODUCT_CONTRACT.md is actually reachable.
 */

describe('mastery ladder',()=>{
 it('advances one step per verified evidence item and never skips a level',()=>{
  expect(masteryLevelFor([],0)).toBe('introduced')
  expect(masteryLevelFor(['e1'],1)).toBe('practicing')
  expect(masteryLevelFor(['e1','e2'],2)).toBe('demonstrated')
  expect(masteryLevelFor(['e1','e2','e3'],3)).toBe('mastered')
 })
 it('requires assessment-backed evidence before mastering',()=>{
  // Three items without a formal assessment cannot reach mastered.
  expect(masteryLevelFor(['e1','e2','e3'],0)).toBe('demonstrated')
  // A single passed answer never exceeds practising, so `mastered` cannot be won in one sitting.
  expect(masteryLevelFor(['e1'],1)).toBe('practicing')
 })
})

describe('mastery rows from a plan',()=>{
 const plan=(tasks:{title:string;conceptId:string}[]):PlanVersion=>({id:'plan',version:1,status:'draft',createdAt:'2026-01-01T00:00:00.000Z',stages:[{id:'stage',title:'S',outcome:'O',tasks:tasks.map(t=>({id:t.title,title:t.title,objective:'o',activity:'explain' as const,acceptanceCriteria:['c'],checkPrompt:'c',estimateMinutes:20,status:'pending' as const,conceptId:t.conceptId}))}]})
 it('emits one row per concept, not one per task',()=>{
  const rows=masteryRowsForPlan(plan([{title:'a',conceptId:'concept_1'},{title:'b',conceptId:'concept_1'},{title:'c',conceptId:'concept_2'}]),'2026-01-01T00:00:00.000Z')
  // Two tasks share concept_1, which must not produce duplicate rows (React key collisions and
  // double-counted evidence).
  expect(rows.map(r=>r.conceptId)).toEqual(['concept_1','concept_2'])
  expect(new Set(rows.map(r=>r.conceptId)).size).toBe(rows.length)
 })
 it('starts every concept at introduced with no practice or review timestamps',()=>{
  const rows=masteryRowsForPlan(plan([{title:'a',conceptId:'concept_1'}]),'2026-01-01T00:00:00.000Z')
  expect(rows[0]).toMatchObject({level:'introduced',evidenceIds:[],lastPracticedAt:null,nextReviewAt:null})
 })
})


/**
 * The mastery ladder was previously a dead enum: only `introduced` and `demonstrated` were ever
 * written, and `practicing`/`mastered` were unreachable no matter how much evidence accumulated.
 * These assert the documented ladder from docs/PRODUCT_CONTRACT.md is actually reachable.
 */

describe('mastery ladder',()=>{
 it('advances one step per verified evidence item and never skips a level',()=>{
  expect(masteryLevelFor([],0)).toBe('introduced')
  expect(masteryLevelFor(['e1'],1)).toBe('practicing')
  expect(masteryLevelFor(['e1','e2'],2)).toBe('demonstrated')
  expect(masteryLevelFor(['e1','e2','e3'],3)).toBe('mastered')
 })
 it('requires assessment-backed evidence before mastering',()=>{
  // Three items without a formal assessment cannot reach mastered.
  expect(masteryLevelFor(['e1','e2','e3'],0)).toBe('demonstrated')
  // A single passed answer never exceeds practising, so `mastered` cannot be won in one sitting.
  expect(masteryLevelFor(['e1'],1)).toBe('practicing')
 })
})

describe('mastery rows from a plan',()=>{
 const plan=(tasks:{title:string;conceptId:string}[]):PlanVersion=>({id:'plan',version:1,status:'draft',createdAt:'2026-01-01T00:00:00.000Z',stages:[{id:'stage',title:'S',outcome:'O',tasks:tasks.map(t=>({id:t.title,title:t.title,objective:'o',activity:'explain' as const,acceptanceCriteria:['c'],checkPrompt:'c',estimateMinutes:20,status:'pending' as const,conceptId:t.conceptId}))}]})
 it('emits one row per concept, not one per task',()=>{
  const rows=masteryRowsForPlan(plan([{title:'a',conceptId:'concept_1'},{title:'b',conceptId:'concept_1'},{title:'c',conceptId:'concept_2'}]),'2026-01-01T00:00:00.000Z')
  // Two tasks share concept_1, which must not produce duplicate rows (React key collisions and
  // double-counted evidence).
  expect(rows.map(r=>r.conceptId)).toEqual(['concept_1','concept_2'])
  expect(new Set(rows.map(r=>r.conceptId)).size).toBe(rows.length)
 })
 it('starts every concept at introduced with no practice or review timestamps',()=>{
  const rows=masteryRowsForPlan(plan([{title:'a',conceptId:'concept_1'}]),'2026-01-01T00:00:00.000Z')
  expect(rows[0]).toMatchObject({level:'introduced',evidenceIds:[],lastPracticedAt:null,nextReviewAt:null})
 })
})
