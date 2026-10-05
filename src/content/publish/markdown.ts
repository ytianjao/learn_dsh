import type {LessonDocument} from '../schemas.js'

const zh={objectives:'学习目标',prerequisites:'先修知识',takeaways:'要点回顾',glossary:'术语表',review:'复习问题',references:'参考资料',answer:'参考答案',minutes:'约 {n} 分钟',difficulty:'难度',stage:'所属阶段',difficultyNames:{introductory:'入门',intermediate:'进阶',advanced:'高级'} as const}
const en={objectives:'Learning objectives',prerequisites:'Prerequisites',takeaways:'Key takeaways',glossary:'Glossary',review:'Review questions',references:'References',answer:'Answer guide',minutes:'~{n} min read',difficulty:'Difficulty',stage:'Stage',difficultyNames:{introductory:'introductory',intermediate:'intermediate',advanced:'advanced'} as const}
export const lessonStrings=(language:LessonDocument['language'])=>language==='zh-CN'?zh:en

/** Serialize a lesson document as a standalone Markdown file. */
export function renderLessonMarkdown(document:LessonDocument):string{
 const t=lessonStrings(document.language),lines:string[]=[]
 lines.push(`# ${document.title}`)
 if(document.subtitle)lines.push('',`> ${document.subtitle}`)
 lines.push('',document.summary,'')
 lines.push(`> ${t.stage}: ${document.metadata.stageTitle} · ${t.difficulty}: ${t.difficultyNames[document.metadata.difficulty]} · ${t.minutes.replace('{n}',String(document.metadata.estimatedReadingMinutes))}`)
 lines.push('',`## ${t.objectives}`,...document.learningObjectives.map(item=>`- ${item}`))
 if(document.prerequisites.length)lines.push('',`## ${t.prerequisites}`,...document.prerequisites.map(item=>`- ${item}`))
 for(const section of document.sections)lines.push('',`## ${section.title}`,'',section.markdown)
 lines.push('',`## ${t.takeaways}`,...document.keyTakeaways.map(item=>`- ${item}`))
 if(document.glossary.length)lines.push('',`## ${t.glossary}`,...document.glossary.map(item=>`- **${item.term}**：${item.definition}`))
 lines.push('',`## ${t.review}`,...document.reviewQuestions.flatMap((item,index)=>[`${index+1}. ${item.question}`,...(item.answerGuide?[`   - *${t.answer}:* ${item.answerGuide}`]:[])]))
 if(document.references.length)lines.push('',`## ${t.references}`,...document.references.map(item=>`- ${item.url?`[${item.title}](${item.url})`:item.title}${item.note?` — ${item.note}`:''}`))
 return`${lines.join('\n').replace(/\n{3,}/g,'\n\n')}\n`
}

/** Course-level index Markdown linking the per-lesson files in plan order. */
export function renderCourseMarkdownIndex(documents:readonly LessonDocument[],courseTitle:string):string{
 const lines=[`# ${courseTitle}`,'']
 for(const document of documents)lines.push(`${document.sequence}. [${document.title}](${String(document.sequence).padStart(2,'0')}-${document.slug}.md) — ${document.summary}`)
 lines.push('','---',...documents.map(d=>`- ${d.metadata.stageTitle} · ${d.metadata.difficulty}`))
 return`${lines.join('\n')}\n`
}
