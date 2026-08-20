/** LearnLoop Host plugin: durable learning state and same-origin browser API. */
import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-host-webserver'
import type {} from '@deepseek-ai/dsh-storage-domain'
import { ensureState, learnLoopDomainSpec } from './domain.js'
import { API_PATH, createLearnLoopHttpHandler } from './http.js'
import type { StateTable } from './types.js'

export * from './domain.js'
export * from './http.js'
export * from './types.js'
export const name = 'learnloop'
export const inject = ['storageDomain', 'webServer']
export async function apply(ctx: Context): Promise<void> {
  const domain = await ctx.storageDomain.open(learnLoopDomainSpec)
  const table = domain.table('state') as StateTable
  await ensureState(table)
  ctx.effect(() => async () => { await domain.close() }, 'learnloop.storage()')
  ctx.effect(() => ctx.webServer.register({ kind: 'exact', path: API_PATH, handler: createLearnLoopHttpHandler(table) }), 'learnloop.route()')
}
