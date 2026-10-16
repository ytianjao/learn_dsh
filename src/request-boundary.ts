/**
 * The HTTP request boundary every LearnLoop mutation passes through.
 *
 * DSH's web server registers routes and serves them, but it owns none of the guards a write
 * endpoint needs: its `origin` is the bound address read back as a URL, and its only
 * `content-type` use is the gzip filter. There is no CSRF check, no body limit, and no 413.
 * The product contract promises those on the LearnLoop mutation API, so LearnLoop implements
 * them here.
 *
 * This is local isolation, not authentication. It keeps a page loaded from another origin
 * from driving a mutation through the browser, and it bounds how many bytes a single request
 * may hand the Host. It is not a multi-user identity system and must not be described as one.
 */
import type {IncomingMessage} from 'node:http'
import {LearnLoopDomainError} from './domain.js'

/** The product contract's request limit: 128 KiB, counted in bytes as they arrive. */
export const MAX_REQUEST_BYTES=128*1024
/** A non-simple header, so a cross-origin `fetch` must preflight before it can send it. */
export const MUTATION_HEADER='x-learnloop-mutation'
export const MUTATION_HEADER_VALUE='learnloop-v3'

const forbidden=(message:string)=>new LearnLoopDomainError('REQUEST_FORBIDDEN',message)

/**
 * Read a JSON request body under a hard byte ceiling.
 *
 * The limit is enforced on the stream rather than on `Content-Length`, because a chunked
 * request declares no length and a request that lies about its length must not be believed
 * either. A request over the limit stops accumulating at once: the rest of the stream is
 * drained so the socket stays usable, but nothing further is buffered.
 */
export async function readJsonBody(req:IncomingMessage,max=MAX_REQUEST_BYTES){
 if(req.method==='GET'||req.method==='HEAD')throw forbidden('This route requires a request body.')
 const chunks:Buffer[]=[]
 let size=0,overflow=false
 for await(const chunk of req){
  if(overflow)continue
  const buffer=Buffer.from(chunk)
  size+=buffer.byteLength
  if(size>max){overflow=true;chunks.length=0;continue}
  chunks.push(buffer)
 }
 if(overflow)throw new LearnLoopDomainError('REQUEST_TOO_LARGE',`Request body exceeds the ${max} byte limit.`)
 try{return JSON.parse(Buffer.concat(chunks).toString()) as unknown}
 catch{throw forbidden('The request body is not valid JSON.')}
}

/**
 * The guards that run before a body is read. Content type and the mutation header are
 * required; `Origin`, when a browser sends one, must match the Host the request arrived on.
 * A request with no `Origin` at all — curl, a test harness, a local tool — is allowed through
 * on the header alone, because the header cannot be set cross-origin without a preflight this
 * server never grants, so it already carries the CSRF guarantee.
 */
export function assertMutationRequest(req:IncomingMessage){
 const contentType=req.headers['content-type']
 if(typeof contentType!=='string'||!contentType.toLowerCase().startsWith('application/json'))throw forbidden('Mutations require a JSON content type.')
 const header=req.headers[MUTATION_HEADER]
 if(header!==MUTATION_HEADER_VALUE)throw forbidden(`Mutations require the ${MUTATION_HEADER} header.`)
 const origin=req.headers.origin
 if(origin===undefined)return
 const host=req.headers.host
 if(typeof host==='string'&&origin===`http://${host}`)return
 throw forbidden('The request Origin does not match the host it was sent to.')
}
