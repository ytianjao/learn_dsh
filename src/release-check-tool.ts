import { defineTool } from '@deepseek-ai/dsh-tools'
import { LearnLoopDomainError } from './domain.js'
import type { StateTable } from './types.js'
import { commandResultFor, releaseCurrentCandidate, workspaceForSession } from './workspace.js'
import { finalizeLearnLoopToolError } from './tool-protocol.js'

/**
 * While a check is armed, the learner's next message is captured as the answer. A learner may ask
 * something instead; grading that as a wrong answer punishes the question. This tool lets the
 * verifier release such a message: the check returns to teaching, no assessment is written, and the
 * attempt is not counted. An attempt to answer, however wrong, must still be assessed.
 */
export function createLearnLoopReleaseCheckTool(table: StateTable) {
  return defineTool({
    name: 'learnloop_release_check',
    description: 'Release the captured message back to teaching when it is a question, a request, or off-topic, not an attempt to answer the check prompt. No assessment is written. Never use it for a wrong or partial answer; assess those with learnloop_assess_answer.',
    parameters: {
      reason: { type: 'string', required: true, enum: ['question', 'request', 'off-topic'], title: 'Reason', description: 'question: the learner asks about the material; request: the learner asks for something else (more explanation, an example, a change); off-topic: unrelated to the task.' },
    },
    output: {
      schema: { type: 'object', additionalProperties: false, properties: { status: { type: 'string', const: 'released', required: true }, taskId: { type: 'string', required: true } } },
      render: () => [{ type: 'text', text: 'The check was released back to teaching. Answer the learner now; when they are ready they can start the check again from the LearnLoop UI.' }],
    },
    finalizeContent: finalizeLearnLoopToolError,
    async execute(args, exec) {
      if (!exec.agent) throw new LearnLoopDomainError('SESSION_MISMATCH', 'Agent required.')
      const sessionId = String(exec.agent.id)
      const before = table.get('singleton')
      if (!before) throw new LearnLoopDomainError('CANDIDATE_NOT_FOUND', 'State missing.')
      const workspace = workspaceForSession(before, sessionId)
      const idempotencyKey = `release-check:${exec.callId}`
      const updated = await table.update('singleton', state => releaseCurrentCandidate(state, { sessionId, idempotencyKey, reason: args.reason }))
      const result = commandResultFor(updated, workspace.workspaceId, idempotencyKey, 'candidate-discarded')
      if (!result) throw new LearnLoopDomainError('CANDIDATE_NOT_READY', 'Canonical release receipt is missing.')
      return { status: 'released' as const, taskId: result.taskId }
    },
  })
}
