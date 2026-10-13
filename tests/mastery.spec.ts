import {describe,expect,it} from 'vitest'
import {masteryLevelFor,masteryRowsForPlan,type PlanVersion} from '../src/index.js'

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
