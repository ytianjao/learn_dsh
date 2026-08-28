import { z } from 'zod'

const id = z.string().trim().min(1).max(256)
const text = z.string().max(20_000)
const timestamp = z.string().datetime()
const revision = z.number().int().nonnegative().safe()
const boundedStrings = z.array(z.string().trim().min(1).max(2_000)).max(100)

export const learningPreferencesSchema = z.object({
  mode: z.enum(['knowledge-first', 'balanced', 'practice-first']),
  practiceCapacity: z.enum(['none', 'light', 'full']),
  explanationDepth: z.enum(['standard', 'deep']),
  exampleDensity: z.enum(['standard', 'high']),
  additionalNotes: z.string().max(2_000),
}).strict()

export const learnerProfileSchema = z.object({id, revision, goal: text, priorKnowledge: text,
  experienceLevel:z.enum(['beginner','intermediate','advanced']), knowledgeGaps:boundedStrings,
  learningPreferences:learningPreferencesSchema, weeklyHours:z.number().int().min(1).max(80),
  deadline:z.string().max(100).optional(), constraints:boundedStrings, successCriteria:boundedStrings.min(1),
  unansweredQuestions:boundedStrings, confirmedAt:timestamp.nullable(), createdAt:timestamp, updatedAt:timestamp}).strict()
export const learningTaskSchema=z.object({id,title:text,objective:text,activity:z.enum(['explain','example','apply']),acceptanceCriteria:z.array(z.string().trim().min(1).max(500)).min(1).max(8),checkPrompt:z.string().min(1).max(2_000),estimateMinutes:z.number().int().min(10).max(240),status:z.enum(['pending','active','blocked','completed','skipped']),conceptId:id,dependsOnTaskIds:z.array(id).max(1)}).strict()
export const stageSchema=z.object({id,title:z.string().min(1).max(120),outcome:z.string().min(1).max(1_000),tasks:z.array(learningTaskSchema).min(1).max(10)}).strict()
export const planVersionSchema=z.object({id,version:z.number().int().positive().safe(),status:z.enum(['draft','active','superseded','archived']),createdAt:timestamp,stages:z.array(stageSchema).min(1).max(6)}).strict()
const criterionSchema=z.object({criterionIndex:z.number().int().nonnegative(),result:z.enum(['passed','partial','failed']),explanation:text}).strict()
const verifierSchema=z.object({provider:id,model:id,requestEventSeq:revision,assistantMessageEventSeq:revision,turn:revision,step:revision,toolCallId:id,policyVersion:z.literal('learnloop-verifier-v1'),rubricVersion:z.literal('learnloop-rubric-v1')}).strict()
export const assessmentSchema=z.object({kind:z.literal('verified-task'),id,candidateId:id,taskId:id,conceptId:id,result:z.enum(['needs-work','passed','excellent']),criteria:z.array(criterionSchema).min(1).max(100),misconceptions:boundedStrings,feedback:text,verifier:verifierSchema,createdAt:timestamp}).strict()
const sourceSchema=z.object({kind:z.literal('dsh-message'),sessionId:id,messageIds:z.array(id).min(1).max(100),eventSeqs:z.array(revision).max(100),contentHash:z.string().regex(/^[a-f0-9]{64}$/)}).strict()
export const evidenceSchema=z.object({provenance:z.literal('verified'),id,idempotencyKey:id,conceptId:id,kind:z.enum(['explanation','pseudocode','implementation','hypothesis','assessment','reflection']),summary:text,assessmentId:id,source:sourceSchema,createdAt:timestamp}).strict()
export const masterySchema=z.object({conceptId:id,title:text,level:z.enum(['unassessed','introduced','practicing','demonstrated','mastered']),evidenceIds:z.array(id).max(500),rationale:text,updatedAt:timestamp}).strict()
export const candidateSchema=z.object({id,taskId:id,conceptId:id,source:sourceSchema.omit({kind:true}),answerText:text.min(1),status:z.enum(['pending-verification','needs-work','accepted','cancelled']),attempt:revision,assessmentId:id.nullable(),createdAt:timestamp,updatedAt:timestamp}).strict()
export const executionSchema=z.object({taskId:id,phase:z.enum(['teaching','awaiting-answer','verifying','needs-revision','passed','paused']),attempt:revision,armedAfterSeq:revision.nullable(),candidateId:id.nullable(),lastAssessmentId:id.nullable(),updatedAt:timestamp}).strict()
const operationSchema=z.discriminatedUnion('type',[z.object({type:z.literal('update-task'),taskId:id,patch:z.object({title:text.optional(),objective:text.optional(),acceptanceCriteria:boundedStrings.optional(),estimateMinutes:z.number().int().min(1).max(480).optional()}).strict()}).strict(),z.object({type:z.literal('move-task'),taskId:id,toStageId:id,beforeTaskId:id.optional()}).strict()])
export const adjustmentSchema=z.object({id,idempotencyKey:id,impact:z.enum(['minor','major']),state:z.enum(['proposed','applied','rejected','reverted']),reason:text,diff:boundedStrings,operations:z.array(operationSchema).max(100),inverseOperations:z.array(operationSchema).max(100).optional(),createdAt:timestamp,appliedPlanVersion:z.number().int().positive().optional(),revertedPlanVersion:z.number().int().positive().optional()}).strict()
export const eventSchema=z.object({id,stableId:id,type:id,summary:text,createdAt:timestamp}).strict()
export const projectSchema=z.object({id,title:text,phase:z.enum(['interviewing','profile_review','planning','plan_review','active','paused','completed','archived']),profile:learnerProfileSchema.nullable(),profileRevision:revision,plans:z.array(planVersionSchema).max(100),activePlanId:id.nullable(),evidence:z.array(evidenceSchema).max(10_000),mastery:z.array(masterySchema).max(10_000),assessments:z.array(assessmentSchema).max(10_000),adjustments:z.array(adjustmentSchema).max(1_000),evidenceCandidates:z.array(candidateSchema).max(10_000),misconceptions:boundedStrings,reviewQueue:boundedStrings,execution:executionSchema.nullable(),createdAt:timestamp,updatedAt:timestamp}).strict()
export const workspaceSchema=z.object({workspaceId:id,workspaceRootSnapshot:z.string().max(4_096).optional(),workspaceDisplayName:z.string().max(500).optional(),revision,activeProjectId:id.nullable(),projects:z.record(id,projectSchema),activeSessionId:id.nullable(),events:z.array(eventSchema).max(10_000)}).strict()
export const settingsSchema=z.object({language:z.enum(['zh-CN','en']),weeklyHours:z.number().int().min(1).max(80),strictness:z.enum(['supportive','balanced','strict']),autoMinorAdjustments:z.boolean(),showModeExplanation:z.boolean(),antiDependency:z.boolean()}).strict()
export const commandResultSchema=z.discriminatedUnion('kind',[
  z.object({kind:z.literal('plan-draft-created'),planId:id,planVersion:z.number().int().positive(),workspaceRevision:revision}).strict(),
  z.object({kind:z.literal('plan-draft-revision-requested'),planId:id,planVersion:z.number().int().positive(),workspaceRevision:revision}).strict(),
  z.object({kind:z.literal('assessment-settled'),assessmentId:id,candidateId:id,taskId:id,result:z.enum(['needs-work','passed','excellent']),taskCompleted:z.boolean(),failedCriteria:z.array(revision),feedback:text,workspaceRevision:revision}).strict(),
])
export const receiptSchema=z.object({idempotencyKey:id,action:id,workspaceId:id.nullable(),projectId:id.nullable(),payloadHash:z.string().regex(/^[a-f0-9]{64}$/),resultRevision:revision,result:commandResultSchema.optional(),createdAt:timestamp}).strict()
export const learnLoopStateSchema=z.object({schemaVersion:z.literal(7),revision,settings:settingsSchema,workspaces:z.record(id,workspaceSchema),commandReceipts:z.array(receiptSchema).max(20_000)}).strict()

export type CommandResult=z.infer<typeof commandResultSchema>; export type LearnLoopState=z.infer<typeof learnLoopStateSchema>; export type WorkspaceLearningState=z.infer<typeof workspaceSchema>; export type LearningProject=z.infer<typeof projectSchema>; export type LearnerProfile=z.infer<typeof learnerProfileSchema>; export type LearningTask=z.infer<typeof learningTaskSchema>; export type PlanVersion=z.infer<typeof planVersionSchema>; export type Evidence=z.infer<typeof evidenceSchema>; export type Assessment=z.infer<typeof assessmentSchema>; export type EvidenceCandidate=z.infer<typeof candidateSchema>; export type CriterionAssessment=z.infer<typeof criterionSchema>; export type VerifiedTaskAssessment=Assessment; export type LearningPreferences=z.infer<typeof learningPreferencesSchema>; export type CommandReceipt=z.infer<typeof receiptSchema>
export type LearnLoopErrorCode='PROJECT_NOT_FOUND'|'PROJECT_ALREADY_EXISTS'|'SESSION_MISMATCH'|'SESSION_TRANSFER_BLOCKED'|'SESSION_NOT_LIVE'|'WORKSPACE_CONTEXT_MISSING'|'WORKSPACE_NOT_FOUND'|'WORKSPACE_AMBIGUOUS'|'WORKSPACE_MISMATCH'|'PLAN_NOT_PUBLISHED'|'PLAN_ALREADY_PUBLISHED'|'INVALID_PLAN'|'TASK_NOT_FOUND'|'TASK_LOCKED'|'INVALID_TASK_TRANSITION'|'CHECK_NOT_ARMED'|'CHECK_ALREADY_ARMED'|'ANSWER_UNSUPPORTED'|'CANDIDATE_NOT_FOUND'|'CANDIDATE_NOT_READY'|'CANDIDATE_SOURCE_MISSING'|'ASSESSMENT_INVALID'|'EVIDENCE_MISMATCH'|'ADJUSTMENT_NOT_FOUND'|'INVALID_ADJUSTMENT'|'IDEMPOTENCY_KEY_REUSED'|'EXPORT_FORBIDDEN'|'REVISION_CONFLICT'
export interface StateTable{get(id:string):LearnLoopState|undefined;put(id:string,value:LearnLoopState):Promise<void>;update(id:string,update:(current:LearnLoopState)=>LearnLoopState):Promise<LearnLoopState>}
