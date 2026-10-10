/** Atomic command bus: idempotency receipts, monotonic revision CAS, event log. */
import {LearnLoopDomainError, payloadHash} from '../domain.js'
import {interviewTopics, learnLoopStateSchema, type Assessment, type CriterionAssessment, type LearnerProfile, type LearningProject, type InterviewTopic, type InterviewProbeId, type LearningTask, type LearnLoopState, type CommandResult, type VerifiedTaskAssessment, type WorkspaceLearningState} from '../types.js'
import {fail,now,uid,workspaceOf} from './shared.js'
type Context={workspaceId:string;projectId:string|null;sessionId?:string;expectedRevision:number;idempotencyKey:string;allowInactiveProject?:boolean}
export function applyWorkspaceCommand(state:LearnLoopState,context:Context,action:string,payload:unknown,mutation:(workspace:WorkspaceLearningState,project:LearningProject|null)=>WorkspaceLearningState,result?:(workspace:WorkspaceLearningState)=>CommandResult){
 const fingerprint=payloadHash({action,workspaceId:context.workspaceId,projectId:context.projectId,payload}),workspace=workspaceOf(state,context.workspaceId),prior=state.commandReceipts.find(r=>r.workspaceId===context.workspaceId&&r.idempotencyKey===context.idempotencyKey)
 if(context.sessionId&&workspace.activeSessionId!==context.sessionId)fail('SESSION_MISMATCH','Session is not attached to this workspace.')
 if(prior){if(prior.action===action&&prior.payloadHash===fingerprint)return state;fail('IDEMPOTENCY_KEY_REUSED','Idempotency key was reused with different content.')}
 const project=context.projectId?workspace.projects[context.projectId]:null;if(context.projectId&&!project&&!(context.allowInactiveProject&&prior))fail('PROJECT_NOT_FOUND','Project is not in this workspace.');if(project&&!context.allowInactiveProject&&workspace.activeProjectId!==project.id)fail('PROJECT_NOT_FOUND','Project is not active.')
 if(workspace.revision!==context.expectedRevision)fail('REVISION_CONFLICT','Workspace revision changed.')
 const changed=mutation(structuredClone(workspace),project?structuredClone(project):null);const stamp=now();const nextWorkspace={...changed,revision:workspace.revision+1,events:[...changed.events,{id:uid('event'),stableId:context.idempotencyKey,type:action,summary:action,createdAt:stamp}]};const revision=state.revision+1
 return learnLoopStateSchema.parse({...state,revision,workspaces:{...state.workspaces,[workspace.workspaceId]:nextWorkspace},commandReceipts:[...state.commandReceipts,{idempotencyKey:context.idempotencyKey,action,workspaceId:workspace.workspaceId,projectId:context.projectId,payloadHash:fingerprint,resultRevision:revision,result:result?.(nextWorkspace),createdAt:stamp}]})
}
export const commandReceiptFor=(state:LearnLoopState,workspaceId:string,idempotencyKey:string)=>state.commandReceipts.find(receipt=>receipt.workspaceId===workspaceId&&receipt.idempotencyKey===idempotencyKey)??null
export function commandResultFor<K extends CommandResult['kind']>(state:LearnLoopState,workspaceId:string,idempotencyKey:string,kind:K){const result=commandReceiptFor(state,workspaceId,idempotencyKey)?.result;return result?.kind===kind?result as Extract<CommandResult,{kind:K}>:null}
