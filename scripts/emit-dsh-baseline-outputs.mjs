import {readFile} from 'node:fs/promises'

const baseline=JSON.parse(await readFile(new URL('./dsh-baseline.json',import.meta.url),'utf8'))

if(typeof baseline.version!=='string'||baseline.version.trim()===''){
  throw new Error('DSH baseline version must be a non-empty string')
}
if(typeof baseline.commit!=='string'||!/^[0-9a-f]{40}$/i.test(baseline.commit)){
  throw new Error('DSH baseline commit must be a 40-character hexadecimal SHA')
}

process.stdout.write(`version=${baseline.version}\ncommit=${baseline.commit}\n`)
