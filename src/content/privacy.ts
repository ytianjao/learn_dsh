import type {LessonDocumentIntent} from './schemas.js'
import {canonicalJson} from './hash.js'
export function validateShareableLesson(intent:LessonDocumentIntent,privateValues:readonly string[]=[]):void{const text=canonicalJson(intent);const forbidden=[...privateValues.filter(Boolean),'$DSH_HOME','workspaceId','projectId','sessionId','messageId','eventSeq','sourceHash','toolCallId'];if(forbidden.some(value=>text.includes(value))||/(?:sk-[A-Za-z0-9_-]{16,}|(?:^|\s)(?:\/home|\/Users|[A-Za-z]:\\)[^\s]*)/.test(text))throw new Error('CONTENT_PRIVACY_VIOLATION')}
