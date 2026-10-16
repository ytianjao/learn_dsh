/**
 * Host-owned spaced review scheduling policy.
 *
 * The intervals are intentionally simple and interpretable — 1/3/7/14/30 days
 * based on evidence count. They are not claimed as learning-science; they are
 * a starting heuristic that can be calibrated from real usage data.
 *
 * Time injection: `nowIso` defaults to the real clock and can be overridden in
 * tests so specs never depend on wall time.
 */
export const REVIEW_POLICY_VERSION='learnloop-review-v1' as const

/** Interval in days for each evidence-count bucket (0-indexed: 0 evidence → 1 day, etc.). */
const INTERVAL_DAYS=[1,3,7,14,30] as const

/** Returns the ISO timestamp at which the next review is due, given the number of prior evidence items. */
export function nextReviewIso(evidenceCount:number,nowIso=new Date().toISOString()):string{
 const days=INTERVAL_DAYS[Math.min(evidenceCount,INTERVAL_DAYS.length-1)]!
 const base=new Date(nowIso)
 base.setUTCDate(base.getUTCDate()+days)
 return base.toISOString()
}

/** A mastery row is due for review when nextReviewAt is set and not in the future. */
export function isReviewDue(nextReviewAt:string|null,nowIso=new Date().toISOString()):boolean{
 if(!nextReviewAt)return false
 return nextReviewAt<=nowIso
}
