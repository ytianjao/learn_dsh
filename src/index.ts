/** LearnLoop Host plugin: durable state and same-origin API. / LearnLoop Host 插件：持久状态与同源 API。 */
import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-host-webserver'
import type {} from '@deepseek-ai/dsh-storage-domain'
import type {} from '@deepseek-ai/dsh-tools'
import type {} from '@deepseek-ai/dsh-system-prompt'
import { emptyState, ensureState, learnLoopDomainSpec } from './domain.js'
import { API_PATH, createLearnLoopHttpHandler } from './http.js'
import type { StateTable } from './types.js'
import { createLearnLoopPublishPlanTool } from './tool.js'
import { renderLearnLoopSystemSection } from './prompt.js'

export * from './domain.js'
export * from './http.js'
export * from './types.js'
export * from './tool.js'
export * from './prompt.js'
export const name = 'learnloop'
export const inject = ['storageDomain', 'webServer', 'tools', 'systemPrompt']
export async function apply(ctx: Context): Promise<void> {
  const domain = await ctx.storageDomain.open(learnLoopDomainSpec)
  const table = domain.table('state') as StateTable
  await ensureState(table)
  ctx.effect(() => ctx.systemPrompt.section({ name: 'learnloop-runtime', order: 50, text: context => renderLearnLoopSystemSection(table.get('singleton') ?? emptyState(), context.agent?.id) }), 'learnloop.systemPrompt()')
  ctx.effect(() => ctx.tools.register(createLearnLoopPublishPlanTool(table)), 'learnloop.tool()')
  ctx.effect(() => async () => { await domain.close() }, 'learnloop.storage()')
  ctx.effect(() => ctx.webServer.register({ kind: 'exact', path: API_PATH, handler: createLearnLoopHttpHandler(table) }), 'learnloop.route()')
}
