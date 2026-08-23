import {createHash} from 'node:crypto'
import type {DomainSpec} from '@deepseek-ai/dsh-storage-domain'
import {learnLoopStateSchema, type LearnLoopErrorCode, type LearnLoopState, type LearningPreferences} from './types.js'
import type {StateTable} from './types.js'
export class LearnLoopDomainError extends Error{constructor(readonly code:LearnLoopErrorCode,message:string){super(message);this.name='LearnLoopDomainError'}}
export const DEFAULT_PREFERENCES:LearningPreferences={mode:'balanced',practiceCapacity:'light',explanationDepth:'standard',exampleDensity:'standard',additionalNotes:''}
export function canonicalJson(value:unknown):string{if(value===null||['boolean','number','string'].includes(typeof value))return JSON.stringify(value);if(Array.isArray(value))return `[${value.map(canonicalJson).join(',')}]`;if(typeof value==='object'){const record=Object.fromEntries(Object.entries(value).filter(([,v])=>v!==undefined));return `{${Object.keys(record).sort().map(k=>`${JSON.stringify(k)}:${canonicalJson(record[k])}`).join(',')}}`}return 'null'}
export const payloadHash=(value:unknown)=>createHash('sha256').update(canonicalJson(value)).digest('hex')
export const learnLoopDomainSpec={name:'learnloop',version:2,tables:{state:{valueSchema:learnLoopStateSchema}}} as const satisfies DomainSpec
export function emptyState(revision=0):LearnLoopState{return learnLoopStateSchema.parse({schemaVersion:5,revision,settings:{language:'zh-CN',weeklyHours:10,strictness:'balanced',autoMinorAdjustments:true,showModeExplanation:false,antiDependency:true},workspaces:{},commandReceipts:[]})}
export async function ensureState(table:StateTable){if(!table.get('singleton'))await table.put('singleton',emptyState())}
