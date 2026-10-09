import { defineTool } from '@deepseek-ai/dsh-tools'
import { LearnLoopDomainError, payloadHash } from './domain.js'
import type { StateTable } from './types.js'
import { activeProject, commandReceiptFor, commandResultFor, proposePlanAdjustment, workspaceForSession } from './workspace.js'
import { finalizeLearnLoopToolError } from './tool-protocol.js'

/**
 * Lets the model propose how the plan should change while teaching is underway: insert a task,
 * add remediation for a recorded misconception, split an oversized task, or reorder to defer
 * something. It supplies learning design only — the Host compiles a new immutable plan version
 * as a draft, and the learner must approve it before it becomes active. The active plan is never
 * replaced silently.
 */
export function createLearnLoopPlanAdjustmentTool(table: StateTable) {
  return defineTool({
    name: 'learnloop_propose_plan_adjustment',
    description: 'Propose a revision to the active learning plan based on observed progress. Submit a complete minimal Plan Intent for the revised plan plus the reason for the change. The Host compiles IDs, versions and statuses, keeps already completed Tasks completed, and leaves the current plan active until the learner approves the revision. Supply learning design only; do not attempt to mutate state directly.',
    parameters: {
      reason: { type: 'string', required: true, title: 'Reason', description: 'Why the plan should change, in the learner\'s language.' },
      plan: {
        type: 'object', required: true, additionalProperties: false, title: 'Revised plan intent',
        properties: {
          stages: {
            type: 'array', required: true,
            items: {
              type: 'object', additionalProperties: false,
              properties: {
                title: { type: 'string', required: true },
                outcome: { type: 'string', required: true },
                tasks: {
                  type: 'array', required: true,
                  items: {
                    type: 'object', additionalProperties: false,
                    properties: {
                      title: { type: 'string', required: true },
                      objective: { type: 'string', required: true },
                      activity: { type: 'string', required: true, enum: ['explain', 'example', 'apply'] },
                      acceptanceCriteria: { type: 'array', required: true, items: { type: 'string' } },
                      checkPrompt: { type: 'string', required: true },
                      estimateMinutes: { type: 'integer', required: true, title: 'Estimated minutes', description: 'Whole minutes from 10 through 240.' },
                      conceptKey: { type: 'string', title: 'Concept key', description: 'Stable lowercase key naming the concept a Task practises. Tasks sharing a key accumulate mastery together; reuse the existing keys of Tasks you keep. Omit for a one-off task.' },
                    },
                  },
                },
              },
            },
          },
        },
      },
    },
    output: {
      schema: { type: 'object', additionalProperties: false, properties: { status: { type: 'string', const: 'proposed', required: true }, planId: { type: 'string', required: true }, planVersion: { type: 'integer', required: true } } },
      render: (_args, value) => [{ type: 'text', text: `Plan revision ${value.planVersion} (planId=${value.planId}) awaits explicit learner approval; keep teaching the current Task until the learner approves it.` }],
    },
    finalizeContent: finalizeLearnLoopToolError,
    async execute(args, exec) {
      if (!exec.agent) throw new LearnLoopDomainError('SESSION_MISMATCH', 'Agent required.')
      const sessionId = String(exec.agent.id)
      const before = table.get('singleton')
      if (!before) throw new LearnLoopDomainError('PROJECT_NOT_FOUND', 'State missing.')
      const workspace = workspaceForSession(before, sessionId)
      const project = activeProject(workspace)
      const idempotencyKey = `plan-adjustment:${exec.callId}`
      const fingerprint = payloadHash({ action: 'workspace:propose-plan-adjustment', workspaceId: workspace.workspaceId, projectId: project.id, payload: args })
      const receipt = commandReceiptFor(before, workspace.workspaceId, idempotencyKey)
      if (receipt) {
        if (receipt.action !== 'workspace:propose-plan-adjustment' || receipt.payloadHash !== fingerprint) throw new LearnLoopDomainError('IDEMPOTENCY_KEY_REUSED', 'Plan adjustment call id was reused with different content.')
        if (!receipt.result || receipt.result.kind !== 'plan-adjustment-proposed') throw new LearnLoopDomainError('INVALID_PLAN', 'Canonical plan adjustment receipt is missing.')
        return { status: 'proposed' as const, planId: receipt.result.planId, planVersion: receipt.result.planVersion }
      }
      const updated = await table.update('singleton', state => proposePlanAdjustment(state, { sessionId, callId: exec.callId, reason: args.reason, plan: args.plan }))
      const result = commandResultFor(updated, workspace.workspaceId, idempotencyKey, 'plan-adjustment-proposed')
      if (!result) throw new LearnLoopDomainError('INVALID_PLAN', 'Canonical plan adjustment receipt is missing.')
      return { status: 'proposed' as const, planId: result.planId, planVersion: result.planVersion }
    },
  })
}
