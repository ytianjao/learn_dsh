import type {DomainSpec} from '@deepseek-ai/dsh-storage-domain'
import {HarnessError} from '@deepseek-ai/dsh-llm'
import {canonicalJson,canonicalHash} from './content/hash.js'
import {learnLoopStateSchema, type LearnLoopErrorCode, type LearnLoopState, type LearningPreferences} from './types.js'
import type {StateTable} from './types.js'
export class LearnLoopDomainError extends HarnessError{readonly retryable:boolean;readonly details?:Record<string,unknown>;constructor(code:LearnLoopErrorCode,message:string,details?:Record<string,unknown>,retryable=false){const safe={code,retryable,message,...details};super(`${message}\nLEARNLOOP_SAFE_ERROR:${JSON.stringify(safe)}`,code);this.name='LearnLoopDomainError';this.retryable=retryable;this.details=details}}
export const DEFAULT_PREFERENCES:LearningPreferences={mode:'balanced',practiceCapacity:'none',explanationDepth:'standard',exampleDensity:'standard',additionalNotes:''}
export {canonicalJson}
export const payloadHash=canonicalHash
export const learnLoopDomainSpec={name:'learnloop',version:12,tables:{state:{valueSchema:learnLoopStateSchema}}} as const satisfies DomainSpec
export function emptyState(revision=0):LearnLoopState{return learnLoopStateSchema.parse({schemaVersion:15,revision,settings:{language:'zh-CN',weeklyHours:10,strictness:'balanced',autoMinorAdjustments:true,showModeExplanation:false,antiDependency:true},workspaces:{},commandReceipts:[]})}
export async function ensureState(table:StateTable){if(!table.get('singleton'))await table.put('singleton',emptyState())}
