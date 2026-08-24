import { defineTool } from '@deepseek-ai/dsh-tools'
import { LearnLoopDomainError } from './domain.js'
import type { StateTable, VerifiedTaskAssessment } from './types.js'
import { activeProject, assessCurrentCandidate, workspaceForSession } from './workspace.js'
import { resolveCandidateProvenance, type CandidateSessionReader } from './evidence-bridge.js'

export interface VerifierHeader {
  provider: string
  model: string
  seq: number
  assistantMessageEventSeq: number
  turn: number
  step: number
}
export interface VerifierSessionReader extends CandidateSessionReader {
  requestHeader(sessionId: string, callId: string): VerifierHeader | null
}

export function createLearnLoopAssessmentTool(table: StateTable, sessions: VerifierSessionReader) {
  return defineTool({
    name: 'learnloop_assess_answer',
    description: 'Assess the Host-selected current candidate against every acceptance criterion exactly once. Candidate and Workspace identities are resolved by the Host.',
    parameters: {
      criteria: { type: 'array', required: true, items: { type: 'object', additionalProperties: false, properties: { criterionIndex: { type: 'integer', required: true }, result: { type: 'string', required: true, enum: ['passed', 'partial', 'failed'] }, explanation: { type: 'string', required: true } } } },
      overall: { type: 'string', required: true, enum: ['needs-work', 'passed', 'excellent'] },
      misconceptions: { type: 'array', required: true, items: { type: 'string' } },
      feedback: { type: 'string', required: true },
    },
    output: { schema: { type: 'object', additionalProperties: false, properties: { status: { type: 'string', const: 'assessed', required: true }, result: { type: 'string', required: true, enum: ['needs-work', 'passed', 'excellent'] }, revision: { type: 'integer', required: true }, candidateId: { type: 'string', required: true }, taskId: { type: 'string', required: true }, taskCompleted: { type: 'boolean', required: true }, failedCriteria: { type: 'array', required: true, items: { type: 'integer' } }, feedback: { type: 'string', required: true } } }, render: (_args, value) => [{ type: 'text', text: value.taskCompleted ? 'The task passed.' : 'The task needs more work.' }] },
    async execute(args, exec) {
      if (!exec.agent) throw new LearnLoopDomainError('SESSION_MISMATCH', 'Agent required.')
      const sessionId = String(exec.agent.id)
      const before = table.get('singleton')
      if (!before) throw new LearnLoopDomainError('CANDIDATE_NOT_FOUND', 'State missing.')
      const project = activeProject(workspaceForSession(before, sessionId))
      const prior = project.assessments.find(item => item.verifier.toolCallId === exec.callId)
      const candidate = project.evidenceCandidates.find(item => item.id === (project.execution?.candidateId ?? prior?.candidateId))
      if (!candidate) throw new LearnLoopDomainError('CANDIDATE_NOT_FOUND', 'Candidate missing.')
      const provenance = resolveCandidateProvenance(candidate, sessionId, sessions)
      const header = sessions.requestHeader(sessionId, exec.callId)
      if (!header) throw new LearnLoopDomainError('CANDIDATE_SOURCE_MISSING', 'Verifier tool call or request header missing.')
      const verifier: VerifiedTaskAssessment['verifier'] = { provider: header.provider, model: header.model, requestEventSeq: header.seq, assistantMessageEventSeq: header.assistantMessageEventSeq, turn: header.turn, step: header.step, toolCallId: exec.callId, policyVersion: 'learnloop-verifier-v1', rubricVersion: 'learnloop-rubric-v1' }
      const updated = await table.update('singleton', state => assessCurrentCandidate(state, { sessionId, idempotencyKey: `assessment:${exec.callId}`, ...args, verifier, provenance }))
      const assessment = activeProject(workspaceForSession(updated, sessionId)).assessments.find(item => item.candidateId === candidate.id)
      if (!assessment) throw new LearnLoopDomainError('ASSESSMENT_INVALID', 'Assessment settlement produced no assessment.')
      return { status: 'assessed' as const, result: assessment.result, revision: updated.revision, candidateId: candidate.id, taskId: candidate.taskId, taskCompleted: assessment.result !== 'needs-work', failedCriteria: assessment.criteria.filter(item => item.result !== 'passed').map(item => item.criterionIndex), feedback: assessment.feedback }
    },
  })
}
