/** LearnLoop persisted vocabulary. */
export type TaskState = 'pending' | 'active' | 'blocked' | 'completed' | 'skipped'
export type MasteryLevel = 'unassessed' | 'introduced' | 'practicing' | 'demonstrated' | 'mastered'
export type AdjustmentState = 'proposed' | 'applied' | 'rejected' | 'reverted'
export type LearningMode = 'knowledge-first' | 'balanced' | 'practice-first'
export type PracticeCapacity = 'none' | 'light' | 'full'
export type ExplanationDepth = 'standard' | 'deep'
export type ExampleDensity = 'standard' | 'high'
export interface LearningPreferences { mode: LearningMode; practiceCapacity: PracticeCapacity; explanationDepth: ExplanationDepth; exampleDensity: ExampleDensity; additionalNotes: string }
export type LearningTaskKind = 'lesson' | 'worked-example' | 'discussion' | 'exercise' | 'implementation'
export type CompletionKind = 'short-answer' | 'reflection' | 'artifact'
export interface CompletionRequirement { kind: CompletionKind; prompt: string }
export interface LearningTask { id: string; title: string; objective: string; acceptanceCriteria: string[]; estimateMinutes: number; status: TaskState; conceptIds: string[]; dependsOn: string[]; kind: LearningTaskKind; completion: CompletionRequirement }
export interface Stage { id: string; title: string; tasks: LearningTask[] }
export interface GeneratedPlanTaskInput { key: string; title: string; objective: string; acceptanceCriteria: string[]; estimateMinutes: number; conceptKey: string; conceptTitle: string; dependsOn: string[]; kind: LearningTaskKind; completion: CompletionRequirement }
export interface GeneratedPlanStageInput { key: string; title: string; tasks: GeneratedPlanTaskInput[] }
export interface GeneratedPlanInput { stages: GeneratedPlanStageInput[] }
export interface PlanVersion { id: string; version: number; status: 'draft' | 'active' | 'superseded' | 'archived'; createdAt: string; stages: Stage[] }
export interface Evidence { id: string; idempotencyKey: string; conceptId: string; kind: 'explanation' | 'pseudocode' | 'implementation' | 'hypothesis' | 'assessment' | 'reflection'; summary: string; source: { sessionId: string; messageRange: string }; confidence: number; createdAt: string }
export interface MasteryState { conceptId: string; title: string; level: MasteryLevel; evidenceIds: string[]; rationale: string; updatedAt: string }
export interface Assessment { id: string; conceptId: string; result: 'needs-work' | 'passed' | 'excellent'; explanation: string; evidenceId: string; createdAt: string }
export type PlanOperation =
  | { type: 'update-task'; taskId: string; patch: Partial<Pick<LearningTask, 'title' | 'objective' | 'acceptanceCriteria' | 'estimateMinutes' | 'status'>> }
  | { type: 'move-task'; taskId: string; toStageId: string; beforeTaskId?: string }
export interface AdjustmentProposal { id: string; idempotencyKey: string; impact: 'minor' | 'major'; state: AdjustmentState; reason: string; diff: string[]; operations: PlanOperation[]; inverseOperations?: PlanOperation[]; createdAt: string; appliedPlanVersion?: number; revertedPlanVersion?: number }
export interface LearningEvent { id: string; stableId: string; type: string; summary: string; createdAt: string }
export interface LearnLoopSettings { language: 'zh-CN' | 'en'; weeklyHours: number; strictness: 'supportive' | 'balanced' | 'strict'; autoMinorAdjustments: boolean; showModeExplanation: boolean; antiDependency: boolean }
export interface LearningProject { id: string; title: string; goal: string; experience: string; weeklyHours: number; status: 'active' | 'archived'; createdAt: string; sessionId: string | null; learningPreferences: LearningPreferences }
export interface LearnLoopState { schemaVersion: 2; revision: number; project: LearningProject | null; plans: PlanVersion[]; evidence: Evidence[]; mastery: MasteryState[]; assessments: Assessment[]; adjustments: AdjustmentProposal[]; events: LearningEvent[]; settings: LearnLoopSettings; misconceptions: string[]; reviewQueue: string[] }
export interface StateTable { get(id: string): LearnLoopState | undefined; put(id: string, value: LearnLoopState): Promise<void>; update(id: string, update: (current: LearnLoopState) => LearnLoopState): Promise<LearnLoopState> }
