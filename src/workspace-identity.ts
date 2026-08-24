import {LearnLoopDomainError} from './domain.js'

export interface DshWorkspaceProjection {readonly id:string;readonly path:string;readonly title:string;readonly sessionIds:readonly string[]}
export interface DshWorkspaceRegistry {list():readonly DshWorkspaceProjection[]}
export interface CanonicalWorkspaceContext {workspaceId:string;sessionId:string;workspaceRootSnapshot:string;workspaceDisplayName:string}

/** Resolve ownership exclusively from DSH's header-validated Workspace registry. */
export function resolveCanonicalWorkspace(registry:DshWorkspaceRegistry|undefined,sessionId:string|undefined,claimedWorkspaceId?:string):CanonicalWorkspaceContext {
 const canonicalSessionId=sessionId?.trim()
 if(!registry||!canonicalSessionId)throw new LearnLoopDomainError('WORKSPACE_CONTEXT_MISSING','A live DSH Session and Workspace registry are required.')
 const matches=registry.list().filter(workspace=>workspace.sessionIds.some(id=>String(id)===canonicalSessionId))
 if(matches.length===0)throw new LearnLoopDomainError('WORKSPACE_NOT_FOUND',`Session ${canonicalSessionId} is not attached to a DSH Workspace.`)
 if(matches.length!==1)throw new LearnLoopDomainError('WORKSPACE_AMBIGUOUS',`Session ${canonicalSessionId} is attached to multiple DSH Workspaces.`)
 const workspace=matches[0]!,workspaceId=String(workspace.id)
 if(claimedWorkspaceId!==undefined&&claimedWorkspaceId.trim()!==workspaceId)throw new LearnLoopDomainError('WORKSPACE_MISMATCH',`Claimed Workspace ${claimedWorkspaceId} does not match Session ${canonicalSessionId}'s DSH Workspace ${workspaceId}.`)
 return{workspaceId,sessionId:canonicalSessionId,workspaceRootSnapshot:workspace.path,workspaceDisplayName:workspace.title}
}
