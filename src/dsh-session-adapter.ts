import type {Session,SessionEvent} from '@deepseek-ai/dsh-session'
import type {AuthoritativeUserMessage} from './evidence-bridge.js'
import type {VerifierHeader} from './assessment-tool.js'
import type {LessonSourceMessage,LessonSourceSegment} from './content/schemas.js'
import {sha256} from './content/hash.js'

export interface LearnLoopSessionReader {
  tailSeq(sessionId:string):number|null
  userMessages(sessionId:string,messageIds:readonly string[]):AuthoritativeUserMessage[]|null
  requestHeader(sessionId:string,toolCallId:string):VerifierHeader|null
  assistantTextMessagesInSegments(segments:readonly LessonSourceSegment[]):readonly LessonSourceMessage[]|null
}

interface SessionRegistry { list():readonly Session[] }

/** Public, typed adapter over the immutable Session event log. Missing or ambiguous provenance fails closed. */
export function createDshSessionReader(sessions:SessionRegistry):LearnLoopSessionReader {
  const find=(id:string)=>sessions.list().find(session=>String(session.id)===id)
  return {
    tailSeq(id){return find(id)?.seq??null},
    userMessages(id,messageIds){
      const session=find(id)
      if(!session)return null
      const wanted=new Set(messageIds),found:AuthoritativeUserMessage[]=[]
      for(const event of session.events)if(event.type==='user/message'&&event.data.source.kind==='user'&&wanted.has(String(event.data.id)))found.push({seq:event.seq,message:event.data})
      return found
    },
    requestHeader(id,callId){
      const session=find(id)
      if(!session)return null
      return findVerifierRequest(session.events,callId)
    },
    assistantTextMessagesInSegments(segments){const result:LessonSourceMessage[]=[],seen=new Set<string>();for(const segment of segments){if(segment.toInclusiveSeq===null)return null;const session=find(segment.sessionId);if(!session||session.seq<segment.toInclusiveSeq)return null;for(const event of session.events){if(event.seq<=segment.fromExclusiveSeq||event.seq>segment.toInclusiveSeq||event.type!=='assistant/message')continue;const messageId=String(event.data.message.id);if(seen.has(messageId))continue;const text=event.data.message.content.filter((block):block is Extract<typeof block,{type:'text'}>=>block.type==='text').map(block=>block.text).join('\n').replace(/\r\n?/g,'\n').trim();if(!text)continue;seen.add(messageId);result.push({sessionId:segment.sessionId,messageId,eventSeq:event.seq,contentHash:sha256(text),text})}}return result},
  }
}

export function findVerifierRequest(events:readonly SessionEvent[],callId:string):VerifierHeader|null {
  const calls=events.filter((event):event is SessionEvent<'tool/call'>=>event.type==='tool/call').filter(event=>String(event.data.callId)===callId)
  if(calls.length!==1)return null
  const call=calls[0]
  if(!call||call.data.name!=='learnloop_assess_answer')return null
  const assistants=events.filter((event):event is SessionEvent<'assistant/message'>=>event.type==='assistant/message').filter(event=>event.data.turn===call.data.turn&&event.data.step===call.data.step&&event.data.message.content.some(block=>block.type==='tool-call'&&String(block.id)===callId))
  if(assistants.length!==1)return null
  const assistant=assistants[0]
  const start=events.filter((event):event is SessionEvent<'step/start'>=>event.type==='step/start').find(event=>event.data.turn===call.data.turn&&event.data.step===call.data.step)
  if(!assistant||!start)return null
  const header=[...events].reverse().filter((event):event is SessionEvent<'request/header'>=>event.type==='request/header').find(event=>event.seq>start.seq&&event.seq<assistant.seq)
  if(!header)return null
  return {provider:header.data.header.config.provider,model:header.data.header.config.model,seq:header.seq,assistantMessageEventSeq:assistant.seq,turn:call.data.turn,step:call.data.step}
}
