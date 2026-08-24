import {describe,expect,it} from 'vitest'
import {createLearnLoopBeginOnboardingTool,emptyState,resolveCanonicalWorkspace,type LearnLoopState,type StateTable} from '../src/index.js'

const workspace=(id:string,sessionIds:string[])=>({id,path:`/work/${id}`,title:`Workspace ${id}`,sessionIds})
const registry=(items:ReturnType<typeof workspace>[])=>({list:()=>items})
const exec=(sessionId:string)=>({agent:{id:sessionId},signal:new AbortController().signal}) as any
function memoryTable(){let state=emptyState();const table:StateTable={get:()=>state,put:async(_id,value)=>{state=value},update:async(_id,fn)=>state=fn(state)};return{table,state:()=>state}}

describe('canonical DSH Workspace identity',()=>{
 it('creates under the trusted DSH UUID and records registry metadata',async()=>{const memory=memoryTable(),id='5adf9874-91b8-43bd-8460-148456629acc',resolver=(sessionId:string,claim?:string)=>resolveCanonicalWorkspace(registry([workspace(id,['session-1'])]),sessionId,claim),tool=createLearnLoopBeginOnboardingTool(memory.table,resolver);await tool.execute({workspaceId:id,expectedRevision:0,idempotencyKey:'begin'},exec('session-1'));expect(Object.keys(memory.state().workspaces)).toEqual([id]);expect(memory.state().workspaces[id]).toMatchObject({workspaceId:id,workspaceRootSnapshot:`/work/${id}`,workspaceDisplayName:`Workspace ${id}`,activeSessionId:'session-1'})})
 it.each([['default'],['another-workspace-uuid']])('rejects an untrusted %s claim without any state change',async claim=>{const memory=memoryTable(),id='5adf9874-91b8-43bd-8460-148456629acc',resolver=(sessionId:string,claimed?:string)=>resolveCanonicalWorkspace(registry([workspace(id,['session-1'])]),sessionId,claimed),tool=createLearnLoopBeginOnboardingTool(memory.table,resolver);await expect(tool.execute({workspaceId:claim,expectedRevision:0,idempotencyKey:'begin'},exec('session-1'))).rejects.toMatchObject({code:'WORKSPACE_MISMATCH'});expect(memory.state()).toEqual(emptyState());expect(memory.state().workspaces.default).toBeUndefined()})
 it('fails closed when the Session has no Workspace',()=>expect(()=>resolveCanonicalWorkspace(registry([workspace('one',[])]),'missing')).toThrowError(expect.objectContaining({code:'WORKSPACE_NOT_FOUND'})))
 it('fails closed when the Session appears in multiple Workspaces',()=>expect(()=>resolveCanonicalWorkspace(registry([workspace('one',['s']),workspace('two',['s'])]),'s')).toThrowError(expect.objectContaining({code:'WORKSPACE_AMBIGUOUS'})))
 it('resolves a later Session to the same Workspace while isolating another Workspace',()=>{const r=registry([workspace('one',['old','new']),workspace('two',['other'])]);expect(resolveCanonicalWorkspace(r,'new').workspaceId).toBe('one');expect(resolveCanonicalWorkspace(r,'other').workspaceId).toBe('two')})
})
