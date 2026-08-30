import {createHash} from 'node:crypto'
import type {DomainSpec} from '@deepseek-ai/dsh-storage-domain'
import {HarnessError} from '@deepseek-ai/dsh-llm'
import {learnLoopStateSchema, type LearnLoopErrorCode, type LearnLoopState, type LearningPreferences} from './types.js'
import type {StateTable} from './types.js'
export class LearnLoopDomainError extends HarnessError{readonly retryable:boolean;readonly details?:Record<string,unknown>;constructor(code:LearnLoopErrorCode,message:string,details?:Record<string,unknown>,retryable=false){const safe={code,retryable,message,...details};super(`${message}\nLEARNLOOP_SAFE_ERROR:${JSON.stringify(safe)}`,code);this.name='LearnLoopDomainError';this.retryable=retryable;this.details=details}}
export const DEFAULT_PREFERENCES:LearningPreferences={mode:'balanced',practiceCapacity:'none',explanationDepth:'standard',exampleDensity:'standard',additionalNotes:''}
export function canonicalJson(value:unknown):string{if(value===null||['boolean','number','string'].includes(typeof value))return JSON.stringify(value);if(Array.isArray(value))return `[${value.map(canonicalJson).join(',')}]`;if(typeof value==='object'){const record=Object.fromEntries(Object.entries(value).filter(([,v])=>v!==undefined));return `{${Object.keys(record).sort().map(k=>`${JSON.stringify(k)}:${canonicalJson(record[k])}`).join(',')}}`}return 'null'}
export const payloadHash=(value:unknown)=>createHash('sha256').update(canonicalJson(value)).digest('hex')
export const learnLoopDomainSpec={name:'learnloop',version:9,tables:{state:{valueSchema:learnLoopStateSchema}}} as const satisfies DomainSpec
export function emptyState(revision=0):LearnLoopState{return learnLoopStateSchema.parse({schemaVersion:12,revision,settings:{language:'zh-CN',weeklyHours:10,strictness:'balanced',autoMinorAdjustments:true,showModeExplanation:false,antiDependency:true},workspaces:{},commandReceipts:[]})}
export async function ensureState(table:StateTable){if(!table.get('singleton'))await table.put('singleton',emptyState())}
