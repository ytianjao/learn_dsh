import {describe,expect,it} from 'vitest'
import {activeProject,beginWorkspaceOnboarding,createLearnLoopProfileQuestionTool,emptyState,workspaceOf} from '../src/index.js'
const fixture=()=>{let state=beginWorkspaceOnboarding(emptyState(),{workspaceId:'ws',sessionId:'s',expectedRevision:0,idempotencyKey:'b'});const table={get:()=>state,put:async()=>{},update:async(_id:string,fn:any)=>(state=fn(state))};return{table,state:()=>state}}
describe('tokenized Profile question Tool',()=>{
 it('declares required questionToken and persists custom before returning',async()=>{const f=fixture(),token=activeProject(workspaceOf(f.state(),'ws')).profileInterview.pendingQuestion!.token,tool=createLearnLoopProfileQuestionTool(f.table as any,{ask:async({questions}:any)=>({answers:[{id:questions[0].id,selected:[],custom:'简单了解量化交易系统'}]})},{tailSeq:()=>1} as any) as any;const result=await tool.execute({questionToken:token},{agent:{id:'s'},callId:'c1'} as any);expect(result.status).toBe('next-question-ready');expect(result.nextQuestionToken).not.toBe(token)})
 it('does not call DSH for a stale token',async()=>{const f=fixture(),ask=async()=>{throw Error('opened')},tool=createLearnLoopProfileQuestionTool(f.table as any,{ask},{tailSeq:()=>1} as any) as any;await expect(tool.execute({questionToken:'stale'},{agent:{id:'s'},callId:'c'})).rejects.toMatchObject({code:'INTERVIEW_QUESTION_STALE'})})
})
