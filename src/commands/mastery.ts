/** Concept-level mastery: the evidence ladder and the per-concept rows derived from a plan. */
import type {Evidence, Mastery, PlanVersion, LearningProject} from '../types.js'

/**
 * The Host-owned mastery ladder. A concept advances by accumulating verified evidence:
 * one item is practising, two are demonstrated, and three including at least one formal
 * assessment reach mastered. A single passed answer therefore never exceeds demonstrated,
 * and `mastered` requires practice spread across the tasks that share the concept.
 */
export function masteryLevelFor(evidenceIds:readonly string[],assessmentBacked:number):Mastery['level']{
 if(evidenceIds.length>=3&&assessmentBacked>=1)return'mastered'
 if(evidenceIds.length>=2)return'demonstrated'
 if(evidenceIds.length>=1)return'practicing'
 return'introduced'
}

/**
 * One mastery row per concept, not per task: tasks sharing a conceptKey share a conceptId and
 * must not produce duplicate rows (they would collide on the client's React key and double-count
 * evidence).
 */
export function masteryRowsForPlan(plan:PlanVersion,at:string):Mastery[]{
 const rows=new Map<string,Mastery>()
 for(const stage of plan.stages)for(const task of stage.tasks){
  if(rows.has(task.conceptId))continue
  rows.set(task.conceptId,{conceptId:task.conceptId,title:task.title,level:'introduced',evidenceIds:[],rationale:'Introduced by the approved plan.',lastPracticedAt:null,nextReviewAt:null,updatedAt:at})
 }
 return[...rows.values()]
}

/** Advance the row for one concept after a verified evidence item was recorded. */
export function advanceMastery(mastery:readonly Mastery[],evidence:Evidence,feedback:string,at:string):Mastery[]{
 return mastery.map(row=>{
  if(row.conceptId!==evidence.conceptId)return row
  const evidenceIds=[...row.evidenceIds,evidence.id]
  // Every evidence item this build records is assessment-kind, so the ladder's
  // "including an assessment" condition is satisfied by the count itself.
  const assessmentBacked=evidence.kind==='assessment'?evidenceIds.length:0
  return{...row,level:masteryLevelFor(evidenceIds,assessmentBacked),evidenceIds,rationale:feedback,lastPracticedAt:at,updatedAt:at}
 })
}

/** Concept ids already tracked by a project, for reuse when a later plan revision adds tasks. */
export const conceptIdsOf=(project:LearningProject):ReadonlyMap<string,string>=>new Map(project.mastery.map(row=>[row.conceptId,row.conceptId]))
