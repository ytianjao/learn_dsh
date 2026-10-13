import { defineTool } from '@deepseek-ai/dsh-tools'
import { LearnLoopDomainError } from './domain.js'
import type { StateTable } from './types.js'
import { activeProject, requireToolPhase, workspaceForSession } from './workspace.js'
import { finalizeLearnLoopToolError } from './tool-protocol.js'
import { planIntentOf } from './plan-intent.js'

/**
 * Read-only view of the active plan as a complete Plan Intent. A plan adjustment must resubmit the
 * whole plan, but most turns never propose one, so the plan is read on demand instead of being
 * carried in every request's runtime context.
 */
export function createLearnLoopGetPlanTool(table: StateTable) {
  return defineTool({
    name: 'learnloop_get_plan',
    description: 'Read the active learning plan as a complete Plan Intent with each Task status and whether an adjustment is pending. Call it before learnloop_propose_plan_adjustment and build the revision from it. Read-only.',
    parameters: {},
    output: {
      schema: { type: 'object', additionalProperties: false, properties: { planVersion: { type: 'integer', required: true }, pendingAdjustment: { type: 'boolean', required: true }, planIntent: { type: 'json', required: true }, taskStatuses: { type: 'json', required: true } } },
      render: (_args, value) => [{ type: 'text', text: JSON.stringify(value) }],
    },
    finalizeContent: finalizeLearnLoopToolError,
    async execute(_args, exec) {
      if (!exec.agent) throw new LearnLoopDomainError('SESSION_MISMATCH', 'Agent required.')
      const state = table.get('singleton')
      if (!state) throw new LearnLoopDomainError('PROJECT_NOT_FOUND', 'State missing.')
      const project = activeProject(workspaceForSession(state, String(exec.agent.id)))
      requireToolPhase(project, 'learnloop_get_plan')
      const plan = project.plans.find(item => item.id === project.activePlanId)
      if (!plan) throw new LearnLoopDomainError('PROJECT_NOT_FOUND', 'No active plan.')
      return { planVersion: plan.version, pendingAdjustment: Boolean(project.pendingPlanAdjustment), planIntent: planIntentOf(plan), taskStatuses: plan.stages.flatMap(stage => stage.tasks.map(task => ({ title: task.title, status: task.status }))) }
    },
  })
}
