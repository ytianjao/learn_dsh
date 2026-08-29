import {createHash} from 'node:crypto'
export function canonicalJson(value:unknown):string{return JSON.stringify(value,(_,v)=>v&&typeof v==='object'&&!Array.isArray(v)?Object.fromEntries(Object.entries(v).sort(([a],[b])=>a.localeCompare(b))):v)}
export const sha256=(value:string)=>createHash('sha256').update(value).digest('hex')
export const canonicalHash=(value:unknown)=>sha256(canonicalJson(value))
