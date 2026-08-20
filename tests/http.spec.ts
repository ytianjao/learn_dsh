import { EventEmitter } from 'node:events'
import { describe, expect, it } from 'vitest'
import { createLearnLoopHttpHandler } from '../src/http.js'
import { emptyState } from '../src/domain.js'
import type { LearnLoopState, StateTable } from '../src/types.js'
class Table implements StateTable { state = emptyState(); get(){return this.state} async put(_id:string,value:LearnLoopState){this.state=value} async update(_id:string,fn:(s:LearnLoopState)=>LearnLoopState){return this.state=fn(this.state)} }
function request(value: object, revision=0) { const req = new EventEmitter() as EventEmitter & AsyncIterable<Buffer> & { method:string; headers:Record<string,string> }; req.method='POST'; req.headers={'content-type':'application/json','x-learnloop-mutation':'1','host':'localhost'}; req[Symbol.asyncIterator]=async function*(){yield Buffer.from(JSON.stringify({...value,revision}))}; let status=0, payload=''; const res={writeHead(code:number){status=code},end(body:string){payload=body}}; return {req,res,status:()=>status,json:()=>JSON.parse(payload) as Record<string,unknown>} }
describe('LearnLoop HTTP projection',()=>{
  it('creates and returns the same authoritative project projection',async()=>{const table=new Table(),call=request({action:'initialize',goal:'学习 Agent',experience:'RAG',weeklyHours:10,idempotencyKey:'i'});await createLearnLoopHttpHandler(table)(call.req as never,call.res as never);expect(call.status()).toBe(200);expect((call.json().project as {goal:string}).goal).toBe('学习 Agent');expect(table.state.revision).toBe(1)})
  it('rejects stale concurrent writes',async()=>{const table=new Table();table.state={...table.state,revision:2};const call=request({action:'reset'},1);await createLearnLoopHttpHandler(table)(call.req as never,call.res as never);expect(call.status()).toBe(409)})
})
