import {readFileSync} from 'node:fs'
import ts from 'typescript'
import {ESLint} from 'eslint'
import {describe,expect,it} from 'vitest'

// These prove the project's own static configuration rejects each class of defect, so turning a check off fails CI.
const options=ts.parseJsonConfigFileContent(ts.parseConfigFileTextToJson('tsconfig.json',readFileSync('tsconfig.json','utf8')).config,ts.sys,'.').options
function diagnostics(source:string){const file='/virtual/sample.ts',host=ts.createCompilerHost({...options,noEmit:true}),read=host.getSourceFile.bind(host);host.getSourceFile=(name,version)=>name===file?ts.createSourceFile(file,source,ts.ScriptTarget.ES2023,true):read(name,version);host.fileExists=(name=>name===file||ts.sys.fileExists(name));const program=ts.createProgram([file],{...options,noEmit:true,types:[]},host);return ts.getPreEmitDiagnostics(program,program.getSourceFile(file)).map(item=>item.code)}
const lint=async(code:string)=>(await new ESLint().lintText(code,{filePath:'src/index.ts'}))[0]!.messages.map(message=>message.ruleId)

describe('Host static guarantees',()=>{
 it('compiles a well-typed sample cleanly, so the probes below fail for their own reason',()=>{expect(diagnostics(`export const id=(value:string|null)=>value===null?'':value.trim()`)).toEqual([])})
 it('rejects a dereference of a value that may be null',()=>{expect(diagnostics(`export const first=(items:string[]|null)=>items.length`)).toContain(18047)})
 it('rejects a value outside a discriminated union',()=>{expect(diagnostics(`type Kind='a'|'b';export const kind:Kind='c'`)).toContain(2322)})
 it('rejects an implicit any parameter',()=>{expect(diagnostics(`export const twice=value=>value*2`)).toContain(7006)})
 it('flags a floating Promise, a Promise passed where void is expected, and a non-exhaustive switch',async()=>{const rules=await lint(`type Kind='a'|'b'\nasync function work(){return 1}\nexport function sample(kind:Kind){work();[1].forEach(async()=>{await work()});switch(kind){case 'a':return 1}return 0}\n`);expect(rules).toEqual(expect.arrayContaining(['@typescript-eslint/no-floating-promises','@typescript-eslint/no-misused-promises','@typescript-eslint/switch-exhaustiveness-check']))},30_000)
})
