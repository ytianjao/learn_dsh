import type {LessonDocumentIntent} from './schemas.js'
import {canonicalJson} from './hash.js'
/** Host-owned markers that must never leak into a reader-facing article. */
const hostMarkers=['$DSH_HOME','LEARNLOOP_RUNTIME','LEARNLOOP_TOOL_ERROR','LEARNLOOP_VERIFIER_CONTEXT','learnloop-host-control-json','learnloop-untrusted-data-json','<learnloop']
const forbiddenPattern=/(?:sk-[A-Za-z0-9_-]{16,}|(?:^|\s)(?:\/home|\/Users|\/root|[A-Za-z]:\\)[^\s]*)/

/**
 * Deterministic shareability scan. Blocks exact Host identifier values, raw learner answers,
 * internal control markers, API-key shapes, and absolute local paths. The model's own redaction
 * is never trusted.
 */
export function validateShareableLesson(intent:LessonDocumentIntent,privateValues:readonly string[]=[]):void{
 const text=canonicalJson(intent)
 const forbidden=[...privateValues.map(value=>value.trim()).filter(value=>value.length>=8),...hostMarkers]
 if(forbidden.some(value=>text.includes(value))||forbiddenPattern.test(text))throw new Error('CONTENT_PRIVACY_VIOLATION')
}
