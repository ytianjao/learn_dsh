import {LearnLoopDomainError} from '../domain.js'
import type {LearningProject,LearningTask,PlanVersion} from '../types.js'
import {canonicalHash} from './hash.js'
import {collectMarkdownUrls,validateMarkdown} from './markdown.js'
import {validateShareableLesson} from './privacy.js'
import {lessonDocumentIntentSchema,lessonDocumentSchema,type LessonDocument,type LessonDocumentIntent,type LessonSourceSnapshot} from './schemas.js'

/** URLs the model may reference: exactly those that appeared in the captured teaching text. */
export function verifiedReferenceUrls(snapshot:LessonSourceSnapshot):Set<string>{
 const urls=new Set<string>()
 for(const message of[...snapshot.teachingMessages,...snapshot.revisionMessages])for(const match of message.text.matchAll(/https?:\/\/[^\s)<>\]"'，。；）】]+/gi))urls.add(match[0].replace(/[.,;:!?]+$/,''))
 return urls
}

/** Validate the model intent and reject any reference link the Host cannot verify from the source snapshot. */
export function validateLessonDocumentIntent(intent:unknown,snapshot:LessonSourceSnapshot,privateValues:readonly string[]):LessonDocumentIntent{
 const parsed=lessonDocumentIntentSchema.safeParse(intent)
 if(!parsed.success)throw new LearnLoopDomainError('INVALID_ARGS',parsed.error.issues.map(issue=>`${issue.path.join('.')}: ${issue.message}`).join('; '))
 const value=parsed.data
 for(const section of value.sections)section.markdown=validateMarkdown(section.markdown)
 const allowed=verifiedReferenceUrls(snapshot),offenders:string[]=[]
 for(const section of value.sections)for(const url of collectMarkdownUrls(section.markdown))if(!allowed.has(url))offenders.push(url)
 for(const reference of value.references)if(reference.url&&!allowed.has(reference.url))offenders.push(reference.url)
 if(offenders.length)throw new LearnLoopDomainError('CONTENT_REFERENCE_UNVERIFIED',`Reference links must come from the verified teaching content; unverified: ${[...new Set(offenders)].slice(0,5).join(', ')}`,{unverified:[...new Set(offenders)].slice(0,10),verifiedCount:allowed.size})
 try{validateShareableLesson(value,privateValues)}catch{throw new LearnLoopDomainError('CONTENT_PRIVACY_VIOLATION','The article contains private identifiers, raw learner answers, credentials, or local paths.')}
 return value
}

export function slugifyLessonTitle(title:string,fallback:string):string{
 const slug=title.toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g,'').replace(/[^a-z0-9]+/g,'-').replace(/^-+|-+$/g,'').slice(0,60)
 return slug||fallback
}

interface DeriveContext{
 workspaceId:string
 project:LearningProject
 plan:PlanVersion
 task:LearningTask
 lessonId:string
 stageTitle:string
 sequence:number
 contentRevision:number
 language:'zh-CN'|'en'
 generatedBy:{provider:string;model:string;toolCallId:string;requestEventSeq:number}
 existingSlugs:readonly string[]
 now:()=>string
 newId:(prefix:string)=>string
}

/** Host derives identity, sequence, slug, metadata, provenance and hashes; the model only supplied the intent. */
export function deriveLessonDocument(intent:LessonDocumentIntent,snapshot:LessonSourceSnapshot,context:DeriveContext):LessonDocument{
 const base=slugifyLessonTitle(intent.title,`lesson-${context.sequence}`)
 let slug=base;const taken=new Set(context.existingSlugs)
 if(taken.has(slug))slug=`${base}-${context.sequence}`
 if(taken.has(slug))slug=`${base}-${context.sequence}-r${context.contentRevision}`
 const experience=context.project.profile?.experienceLevel
 const readingChars=intent.sections.reduce((total,section)=>total+section.markdown.length,0)+intent.summary.length
 const document={
  schemaVersion:1 as const,id:context.lessonId,contentRevision:context.contentRevision,
  workspaceId:context.workspaceId,projectId:context.project.id,planId:context.plan.id,planVersion:context.plan.version,taskId:context.task.id,conceptId:context.task.conceptId,
  sequence:context.sequence,slug,language:context.language,
  ...intent,
  metadata:{stageTitle:context.stageTitle,estimatedReadingMinutes:Math.max(1,Math.round(readingChars/900)),difficulty:experience==='advanced'?'advanced' as const:experience==='intermediate'?'intermediate' as const:'introductory' as const},
  sections:intent.sections.map(section=>({...section,id:context.newId('section')})),
  provenance:{sourceSnapshotId:snapshot.id,sourceHash:snapshot.sourceHash,assessmentIds:[snapshot.acceptedAssessment.assessmentId],evidenceIds:snapshot.acceptedEvidenceIds,contentPolicyVersion:'learnloop-content-v1' as const,generatedBy:context.generatedBy,generatedAt:context.now()},
  publishing:{status:'final' as const,audience:'shareable' as const},
 }
 return lessonDocumentSchema.parse({...document,contentHash:canonicalHash({id:document.id,contentRevision:document.contentRevision,title:intent.title,summary:intent.summary,learningObjectives:intent.learningObjectives,prerequisites:intent.prerequisites,sections:document.sections,keyTakeaways:intent.keyTakeaways,glossary:intent.glossary,reviewQuestions:intent.reviewQuestions,references:intent.references,language:context.language})})
}

export const lessonDocumentRelativePath=(document:LessonDocument)=>`lessons/${document.id.replaceAll(/[^a-zA-Z0-9_-]/g,'').slice(0,48)}-v${document.contentRevision}.json`
