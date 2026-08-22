/** LearnLoop Host plugin: durable verified-answer state and same-origin API. */
import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-host-webserver'
import type {} from '@deepseek-ai/dsh-storage-domain'
import type {} from '@deepseek-ai/dsh-tools'
import type {} from '@deepseek-ai/dsh-system-prompt'
import { emptyState, ensureState, learnLoopDomainSpec } from './domain.js'
import { API_PATH, EXPORT_PATH, createLearnLoopHttpHandler } from './http.js'
import type { StateTable } from './types.js'
import { createLearnLoopPublishPlanTool } from './tool.js'
import { renderLearnLoopSystemSection } from './prompt.js'
export * from './domain.js';export * from './http.js';export * from './types.js';export * from './tool.js';export * from './prompt.js';export * from './assessment-tool.js';export * from './evidence-bridge.js'
export const name='learnloop'
export const inject=['storageDomain','webServer','tools','systemPrompt','agents','sessions']
export async function apply(ctx:Context):Promise<void>{const domain=await ctx.storageDomain.open(learnLoopDomainSpec);const table=domain.table('state') as StateTable;await ensureState(table);ctx.effect(()=>ctx.systemPrompt.section({name:'learnloop-runtime',order:50,text:context=>renderLearnLoopSystemSection(table.get('singleton')??emptyState(),context.agent?.id)}),'learnloop.systemPrompt()');ctx.effect(()=>ctx.tools.register(createLearnLoopPublishPlanTool(table)),'learnloop.publishPlanTool()');const handler=createLearnLoopHttpHandler(table);ctx.effect(()=>ctx.webServer.register({kind:'exact',path:API_PATH,handler}),'learnloop.stateRoute()');ctx.effect(()=>ctx.webServer.register({kind:'exact',path:EXPORT_PATH,handler}),'learnloop.exportRoute()');ctx.effect(()=>async()=>{await domain.close()},'learnloop.storage()')}
