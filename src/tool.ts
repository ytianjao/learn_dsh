import { defineTool } from '@deepseek-ai/dsh-tools'
import { nextAction, publishGeneratedPlan } from './domain.js'
import type { StateTable } from './types.js'

const text = { type: 'string' as const, required: true as const }
const key = { ...text, description: 'Stable lowercase key matching [a-z0-9][a-z0-9-]{0,63}; never a database ID.' }
export function createLearnLoopPublishPlanTool(table: StateTable) {
  return defineTool({
    name: 'learnloop_publish_plan',
    description: 'Publish the complete authoritative LearnLoop plan. The plan MUST obey the project learningPreferences and must never change the learner-selected mode or practice capacity. dependsOn references task keys. Never provide status, database IDs, plan version, revision, or timestamps.',
    parameters: {
      stages: { type: 'array', required: true, items: { type: 'object', additionalProperties: false, properties: {
        key, title: text, tasks: { type: 'array', required: true, items: { type: 'object', additionalProperties: false, properties: {
          key, title: text, objective: text, acceptanceCriteria: { type: 'array', required: true, items: { type: 'string' } }, estimateMinutes: { type: 'integer', required: true }, conceptKey: key, conceptTitle: text, dependsOn: { type: 'array', required: true, items: { type: 'string' } }, kind: { type: 'string', required: true, enum: ['lesson', 'worked-example', 'discussion', 'exercise', 'implementation'] }, completion: { type: 'object', required: true, additionalProperties: false, properties: { kind: { type: 'string', required: true, enum: ['short-answer', 'reflection', 'artifact'] }, prompt: text } },
        } } },
      } } },
    },
    output: {
      schema: { type: 'object', additionalProperties: false, properties: {
        status: { type: 'string', const: 'published', required: true }, revision: { type: 'integer', required: true }, planVersion: { type: 'integer', required: true }, stageCount: { type: 'integer', required: true }, taskCount: { type: 'integer', required: true }, firstTask: { type: 'object', required: true, additionalProperties: false, properties: { id: text, title: text, objective: text } },
      } },
      render: (_args, value) => [{ type: 'text', text: `Plan published at revision ${value.revision}. Begin teaching firstTask "${value.firstTask.title}" now and give the learner one clear next action.` }],
    },
    async execute(args, exec) {
      if (!exec.agent) throw new Error('learnloop_publish_plan requires an agent execution')
      if (exec.signal.aborted) throw exec.signal.reason
      const updated = await table.update('singleton', state => {
        return publishGeneratedPlan(state, { stages: args.stages, sessionId: exec.agent!.id, idempotencyKey: `learnloop-plan:${exec.callId}` })
      })
      if (exec.signal.aborted) throw exec.signal.reason
      const plan = updated.plans.find(item => item.status === 'active')!
      const firstTask = nextAction(updated)!
      return { status: 'published' as const, revision: updated.revision, planVersion: plan.version, stageCount: plan.stages.length, taskCount: plan.stages.reduce((count, stage) => count + stage.tasks.length, 0), firstTask: { id: firstTask.id, title: firstTask.title, objective: firstTask.objective } }
    },
  })
}
