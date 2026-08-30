import {describe,expect,it} from 'vitest'
import {encodeToolError,LEARNLOOP_TOOL_ERROR_MARKER} from '../src/tool-protocol.js'
describe('tool error recovery v2',()=>{it('encodes an explicit bounded directive',()=>{const value=encodeToolError({code:'INVALID_ARGS',category:'pre-execution',message:'invalid',recovery:{kind:'correct-and-retry',maxAttempts:1}});expect(value).toContain(LEARNLOOP_TOOL_ERROR_MARKER);expect(JSON.parse(value.split('\n')[2]!)).toMatchObject({version:2,recovery:{kind:'correct-and-retry',maxAttempts:1}})})})
