import {createHash} from 'node:crypto'
/** Deterministic canonical JSON: code-unit key order (never locale-dependent), undefined object values dropped. */
export function canonicalJson(value:unknown):string{
 if(value===null||['boolean','number','string'].includes(typeof value))return JSON.stringify(value)
 if(Array.isArray(value))return `[${value.map(item=>canonicalJson(item)).join(',')}]`
 if(value&&typeof value==='object'){const record=Object.fromEntries(Object.entries(value).filter(([,entry])=>entry!==undefined));return `{${Object.keys(record).sort().map(key=>`${JSON.stringify(key)}:${canonicalJson(record[key])}`).join(',')}}`}
 return 'null'
}
export const sha256=(value:string)=>createHash('sha256').update(value).digest('hex')
export const canonicalHash=(value:unknown)=>sha256(canonicalJson(value))
export const payloadHash=canonicalHash
