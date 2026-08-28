import {describe,expect,it} from 'vitest'
import {resolveCanonicalWorkspace} from '../src/index.js'

const workspace=(id:string,sessionIds:string[])=>({id,path:`/work/${id}`,title:`Workspace ${id}`,sessionIds})
const registry=(items:ReturnType<typeof workspace>[])=>({list:()=>items})

describe('canonical DSH Workspace identity',()=>{
 it('fails closed when the Session has no Workspace',()=>expect(()=>resolveCanonicalWorkspace(registry([workspace('one',[])]),'missing')).toThrowError(expect.objectContaining({code:'WORKSPACE_NOT_FOUND'})))
 it('fails closed when the Session appears in multiple Workspaces',()=>expect(()=>resolveCanonicalWorkspace(registry([workspace('one',['s']),workspace('two',['s'])]),'s')).toThrowError(expect.objectContaining({code:'WORKSPACE_AMBIGUOUS'})))
 it('resolves a later Session to the same Workspace while isolating another Workspace',()=>{const r=registry([workspace('one',['old','new']),workspace('two',['other'])]);expect(resolveCanonicalWorkspace(r,'new').workspaceId).toBe('one');expect(resolveCanonicalWorkspace(r,'other').workspaceId).toBe('two')})
})
