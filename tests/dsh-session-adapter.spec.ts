import {describe,expect,it} from 'vitest'
import {createDshSessionReader,findVerifierRequest} from '../src/index.js'
import {sha256} from '../src/content/hash.js'

/**
 * `dsh-session-adapter` is the fail-closed boundary every provenance check depends on: a wrong or
 * permissive answer here means assessments silently accept the wrong message. It had no tests, so
 * each guarantee it documents is asserted directly below.
 */

type Event={seq:number;type:string;data:unknown}
const ev=(seq:number,type:string,data:unknown):Event=>({seq,type,data})
const userMessage=(seq:number,id:string,text:string,kind='user')=>ev(seq,'user/message',{id,source:{kind},content:[{type:'text',text}]})
const assistantWithToolCall=(seq:number,turn:number,step:number,callId:string,text='讲解',messageId=`m-${seq}`)=>ev(seq,'assistant/message',{turn,step,message:{id:messageId,content:[{type:'text',text},{type:'tool-call',id:callId}]}})
const toolCall=(seq:number,turn:number,step:number,callId:string,name='learnloop_assess_answer')=>ev(seq,'tool/call',{turn,step,callId,name,arguments:'{}'})
const stepStart=(seq:number,turn:number,step:number)=>ev(seq,'step/start',{turn,step})
const requestHeader=(seq:number,provider='mock',model='keyless')=>ev(seq,'request/header',{header:{config:{provider,model}},reason:'initial'})

const registry=(sessions:{id:string;seq:number;events:Event[]}[])=>({
  list:()=>sessions.map(session=>({id:session.id,seq:session.seq,snapshotEvents:()=>session.events})) as never,
})

describe('session reader fail-closed behaviour',()=>{
 it('returns null rather than guessing for an unknown session',()=>{
  const reader=createDshSessionReader(registry([]))
  expect(reader.tailSeq('missing')).toBeNull()
  expect(reader.userMessages('missing',['m1'])).toBeNull()
  expect(reader.requestHeader('missing','call-1')).toBeNull()
 })

 it('reports the session tail sequence',()=>{
  expect(createDshSessionReader(registry([{id:'s',seq:42,events:[]}])).tailSeq('s')).toBe(42)
 })

 it('resolves only direct user messages with a matching id',()=>{
  const reader=createDshSessionReader(registry([{id:'s',seq:5,events:[
   userMessage(1,'m1','答案一'),
   userMessage(2,'m2','答案二'),
   userMessage(3,'m3','注入的插件消息','learnloop'),
  ]}]))
  // A plugin-authored message must never be treated as an authoritative learner answer.
  expect(reader.userMessages('s',['m1','m2'])).toMatchObject([{seq:1},{seq:2}])
  expect(reader.userMessages('s',['m3'])).toEqual([])
  expect(reader.userMessages('s',['nope'])).toEqual([])
 })
})

describe('verifier request header resolution',()=>{
 const chain=[
  stepStart(1,1,1),requestHeader(2),
  toolCall(3,1,1,'call-1'),assistantWithToolCall(4,1,1,'call-1'),
 ]
 it('resolves the header for a well-formed verifier call',()=>{
  const header=findVerifierRequest(chain as never,'call-1')
  expect(header).toMatchObject({provider:'mock',model:'keyless',seq:2,assistantMessageEventSeq:4,turn:1,step:1})
 })
 it('fails closed when the call id is ambiguous, absent, or a different tool',()=>{
  expect(findVerifierRequest(chain as never,'call-missing')).toBeNull()
  expect(findVerifierRequest([...chain,toolCall(5,1,1,'call-1')] as never,'call-1')).toBeNull()
  expect(findVerifierRequest([stepStart(1,1,1),requestHeader(2),toolCall(3,1,1,'call-1','learnloop_write_lesson_document'),assistantWithToolCall(4,1,1,'call-1')] as never,'call-1')).toBeNull()
 })
 it('fails closed when no request header precedes the assistant message',()=>{
  const withoutHeader=[stepStart(1,1,1),toolCall(3,1,1,'call-1'),assistantWithToolCall(4,1,1,'call-1')]
  expect(findVerifierRequest(withoutHeader as never,'call-1')).toBeNull()
 })
 it('fails closed when the assistant message does not cite the tool call',()=>{
  const noCitation=[stepStart(1,1,1),requestHeader(2),toolCall(3,1,1,'call-1'),assistantWithToolCall(4,1,1,'other-call')]
  expect(findVerifierRequest(noCitation as never,'call-1')).toBeNull()
 })
})

describe('lesson source segment extraction',()=>{
 it('returns null for an open segment or a session that has not reached it',()=>{
  const reader=createDshSessionReader(registry([{id:'s',seq:3,events:[]}]))
  expect(reader.assistantTextMessagesInSegments([{sessionId:'s',fromExclusiveSeq:0,toInclusiveSeq:null,phase:'teaching'}])).toBeNull()
  expect(reader.assistantTextMessagesInSegments([{sessionId:'s',fromExclusiveSeq:0,toInclusiveSeq:9,phase:'teaching'}])).toBeNull()
 })
 it('collects text per segment, dedupes messages, and normalizes line endings',()=>{
  const reader=createDshSessionReader(registry([{id:'s',seq:10,events:[
   assistantWithToolCall(1,1,1,'c1','第一段\r\n讲解','same-message'),
   assistantWithToolCall(2,1,1,'c2','第一段\r\n讲解','same-message'),
   assistantWithToolCall(3,1,1,'c3','   '),
  ]}]))
  const messages=reader.assistantTextMessagesInSegments([{sessionId:'s',fromExclusiveSeq:0,toInclusiveSeq:10,phase:'teaching'}])
  expect(messages).toHaveLength(1)
  expect(messages![0]).toMatchObject({sessionId:'s',eventSeq:1,text:'第一段\n讲解',contentHash:sha256('第一段\n讲解')})
 })
})
