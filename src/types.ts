/** LearnLoop persisted vocabulary. / LearnLoop 持久化领域词汇。 */
export type TaskState = 'pending' | 'active' | 'blocked' | 'completed' | 'skipped'
export type MasteryLevel = 'unassessed' | 'introduced' | 'practicing' | 'demonstrated' | 'mastered'
export type AdjustmentState = 'proposed' | 'applied' | 'rejected' | 'reverted'

export interface LearningTask {
  id: string
  title: string
  objective: string
  acceptanceCriteria: string[]
  estimateMinutes: number
  status: TaskState
  conceptIds: string[]
  dependsOn: string[]
}
export interface Stage { id: string; title: string; tasks: LearningTask[] }
export interface PlanVersion { id: string; version: number; status: 'draft' | 'active' | 'superseded' | 'archived'; createdAt: string; stages: Stage[] }
export interface Evidence { id: string; idempotencyKey: string; conceptId: string; kind: 'explanation' | 'pseudocode' | 'implementation' | 'hypothesis' | 'assessment' | 'reflection'; summary: string; source: { sessionId: string; messageRange: string }; confidence: number; createdAt: string }
export interface MasteryState { conceptId: string; title: string; level: MasteryLevel; evidenceIds: string[]; rationale: string; updatedAt: string }
export interface Assessment { id: string; conceptId: string; result: 'needs-work' | 'passed' | 'excellent'; explanation: string; evidenceId: string; createdAt: string }

/** Machine-applicable plan changes; `diff` remains the human-readable bilingual audit trail. / 可执行计划变更；`diff` 保留为双语审计摘要。 */
export type PlanOperation =
  | { type: 'update-task'; taskId: string; patch: Partial<Pick<LearningTask, 'title' | 'objective' | 'acceptanceCriteria' | 'estimateMinutes' | 'status'>> }
  | { type: 'move-task'; taskId: string; toStageId: string; beforeTaskId?: string }

export interface AdjustmentProposal {
  id: string
  idempotencyKey: string
  impact: 'minor' | 'major'
  state: AdjustmentState
  reason: string
  diff: string[]
  operations: PlanOperation[]
  inverseOperations?: PlanOperation[]
  createdAt: string
  appliedPlanVersion?: number
  revertedPlanVersion?: number
}
export interface LearningEvent { id: string; stableId: string; type: string; summary: string; createdAt: string }
export interface LearnLoopSettings { language: 'zh-CN' | 'en'; weeklyHours: number; strictness: 'supportive' | 'balanced' | 'strict'; autoMinorAdjustments: boolean; showModeExplanation: boolean; antiDependency: boolean }
export interface LearningProject { id: string; title: string; goal: string; experience: string; weeklyHours: number; status: 'active' | 'archived'; createdAt: string }
export interface LearnLoopState {
  schemaVersion: 1
  revision: number
  project: LearningProject | null
  plans: PlanVersion[]
  evidence: Evidence[]
  mastery: MasteryState[]
  assessments: Assessment[]
  adjustments: AdjustmentProposal[]
  events: LearningEvent[]
  settings: LearnLoopSettings
  misconceptions: string[]
  reviewQueue: string[]
}
export interface StateTable {
  get(id: string): LearnLoopState | undefined
  put(id: string, value: LearnLoopState): Promise<void>
  /** Storage-domain atomic update. / Storage Domain 原子更新。 */
  update(id: string, update: (current: LearnLoopState) => LearnLoopState): Promise<LearnLoopState>
}
