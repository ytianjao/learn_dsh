import { readFile } from 'node:fs/promises'
import { describe, expect, it } from 'vitest'
describe('DSH rc.8 compatibility boundary',()=>{it('declares the pinned public Host and Client seams',async()=>{const pkg=JSON.parse(await readFile('package.json','utf8'));expect(pkg.peerDependencies['@deepseek-ai/dsh-host-webserver']).toBe('0.1.0-rc.8');expect(pkg.dsh.client.platform).toBe('web');const client=await readFile('client/bundle.js','utf8');for(const seam of ['window.__ModuleLoader__.load','conversation.view','conversation.input.dock','settings.section'])expect(client).toContain(seam)})})
