import {unified} from 'unified'
import remarkParse from 'remark-parse'
import remarkGfm from 'remark-gfm'
import type {LessonDocument} from '../schemas.js'
import {lessonStrings} from './markdown.js'

export const escapeHtml=(value:string)=>value.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;')
const escapeAttr=escapeHtml

interface MdNode{type:string;value?:string;children?:MdNode[];depth?:number;url?:string;lang?:string|null;ordered?:boolean;start?:number|null;checked?:boolean|null;align?:Array<'left'|'center'|'right'|null>|null}

/** Render the Host-validated markdown subset to HTML; every text node is escaped and raw HTML never passes validation. */
export function markdownToHtml(markdown:string,xhtml=false):string{
 const tree=unified().use(remarkParse).use(remarkGfm).parse(markdown) as MdNode
 const selfClose=xhtml?' /':''
 const inline=(node:MdNode):string=>{
  switch(node.type){
   case 'text':return escapeHtml(node.value??'')
   case 'emphasis':return`<em>${(node.children??[]).map(inline).join('')}</em>`
   case 'strong':return`<strong>${(node.children??[]).map(inline).join('')}</strong>`
   case 'delete':return`<del>${(node.children??[]).map(inline).join('')}</del>`
   case 'inlineCode':return`<code>${escapeHtml(node.value??'')}</code>`
   case 'break':return`<br${selfClose}>`
   case 'link':{const url=String(node.url??'');const external=/^https?:/i.test(url);return`<a href="${escapeAttr(url)}"${external?' rel="noopener noreferrer"':''}>${(node.children??[]).map(inline).join('')}</a>`}
   default:return (node.children??[]).map(inline).join('')
  }
 }
 const block=(node:MdNode):string=>{
  switch(node.type){
   case 'paragraph':return`<p>${(node.children??[]).map(inline).join('')}</p>`
   case 'heading':{const depth=Math.min(6,Math.max(1,node.depth??1))+1;return`<h${Math.min(6,depth)}>${(node.children??[]).map(inline).join('')}</h${Math.min(6,depth)}>`}
   case 'code':return`<pre><code${node.lang?` class="language-${escapeAttr(node.lang)}"`:''}>${escapeHtml(node.value??'')}</code></pre>`
   case 'blockquote':return`<blockquote>${(node.children??[]).map(block).join('')}</blockquote>`
   case 'list':{const tag=node.ordered?'ol':'ul',start=node.ordered&&node.start&&node.start!==1?` start="${node.start}"`:'';return`<${tag}${start}>${(node.children??[]).map(block).join('')}</${tag}>`}
   case 'listItem':{const checkbox=node.checked===true?'☑ ':node.checked===false?'☐ ':'';return`<li>${checkbox}${(node.children??[]).map(child=>child.type==='paragraph'?child.children?.map(inline).join('')??'':block(child)).join('')}</li>`}
   case 'thematicBreak':return`<hr${selfClose}>`
   case 'table':return`<table>${(node.children??[]).map(block).join('')}</table>`
   case 'tableRow':return`<tr>${(node.children??[]).map(block).join('')}</tr>`
   case 'tableCell':return`<td>${(node.children??[]).map(inline).join('')}</td>`
   default:return (node.children??[]).map(block).join('')
  }
 }
 return (tree.children??[]).map(block).join('\n')
}

export const siteStyles=`:root{--bg:#f7f6f2;--surface:#fcfbf8;--text:#292824;--muted:#6f6b63;--border:rgba(42,40,36,.14);--accent:#a85438;--accent-soft:rgba(168,84,56,.09)}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--text);font:16px/1.75 "PingFang SC","Hiragino Sans GB","Microsoft YaHei","Noto Sans CJK SC","Source Han Sans SC",system-ui,-apple-system,"Segoe UI",sans-serif}
a{color:var(--accent);text-decoration:none}a:hover{text-decoration:underline}
.site{max-width:1080px;margin:0 auto;padding:32px 28px 72px}.layout{display:grid;grid-template-columns:240px minmax(0,760px);gap:48px;align-items:start}
.toc{position:sticky;top:24px;border-right:1px solid var(--border);padding-right:20px}.toc a{display:block;color:var(--muted);padding:6px 0;font-size:14px}.toc a[aria-current]{color:var(--accent);font-weight:600}
.hero{padding-bottom:24px;border-bottom:1px solid var(--border)}.hero h1{font-size:32px;line-height:1.2;letter-spacing:-.02em;margin:8px 0}
.meta,.muted{color:var(--muted);font-size:13px}.crumb{font-size:13px;color:var(--muted);margin-bottom:8px}
.card{border:1px solid var(--border);border-radius:14px;padding:18px 20px;background:var(--surface);margin:16px 0}
article h2{margin-top:36px;border-bottom:1px solid var(--border);padding-bottom:6px}article h3{margin-top:28px}
pre{background:#2b2a26;color:#f3efe7;padding:14px 16px;border-radius:10px;overflow:auto;font-size:13px}code{font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;font-size:.92em}
p code,li code,td code{background:var(--accent-soft);padding:1px 5px;border-radius:5px}blockquote{border-left:3px solid var(--accent);margin:16px 0;padding:4px 16px;color:var(--muted);background:var(--accent-soft);border-radius:0 8px 8px 0}
table{border-collapse:collapse;margin:16px 0}td,th{border:1px solid var(--border);padding:6px 12px}tr:nth-child(even){background:var(--accent-soft)}
.lesson-nav{display:flex;justify-content:space-between;gap:12px;margin-top:40px;border-top:1px solid var(--border);padding-top:16px}
.badge{display:inline-block;border:1px solid var(--border);border-radius:999px;padding:1px 10px;font-size:12px;color:var(--muted);margin-right:6px}
@media(max-width:900px){.layout{grid-template-columns:1fr}.toc{position:static;border-right:0;border-bottom:1px solid var(--border)}}
@media print{body{background:#fff}.toc,.lesson-nav,.no-print{display:none}.site{max-width:none;padding:0}article{break-inside:avoid-page}h2,h3{break-after:avoid}pre,blockquote,table{break-inside:avoid}}`

interface NavLink{href:string;title:string}
interface PageOptions{courseTitle:string;crumb:string;indexHref:string;prev?:NavLink;next?:NavLink;nav:readonly{href:string;title:string;sequence:number}[];showToc:boolean}

function shell(title:string,lang:string,body:string,options:PageOptions,xhtml=false):string{
 const selfClose=xhtml?' /':''
 const toc=options.showToc?`<nav class="toc" aria-label="Contents">${options.nav.map(item=>`<a href="${escapeAttr(item.href)}"${item.title===title?' aria-current="page"':''}>${item.sequence}. ${escapeHtml(item.title)}</a>`).join('')}</nav>`:''
 return`<!DOCTYPE html>
<html lang="${lang}"><head><meta charset="utf-8"${selfClose}><meta name="viewport" content="width=device-width,initial-scale=1"${selfClose}><title>${escapeHtml(title)} · ${escapeHtml(options.courseTitle)}</title><style>${siteStyles}</style></head>
<body><div class="site">${options.showToc?`<div class="layout">${toc}<div>`:''}<div class="crumb"><a href="${escapeAttr(options.indexHref)}">${escapeHtml(options.crumb)}</a></div>${body}${options.showToc?'</div>':''}</div></body></html>`
}

/** A standalone lesson page with course navigation. */
export function lessonPageHtml(document:LessonDocument,options:PageOptions,xhtml=false):string{
 const t=lessonStrings(document.language),lang=document.language
 const meta=[`${t.stage}: ${document.metadata.stageTitle}`,`${t.difficulty}: ${t.difficultyNames[document.metadata.difficulty]}`,t.minutes.replace('{n}',String(document.metadata.estimatedReadingMinutes))].join(' · ')
 const parts:string[]=[]
 parts.push(`<header class="hero"><h1>${escapeHtml(document.title)}</h1>${document.subtitle?`<p class="muted">${escapeHtml(document.subtitle)}</p>`:''}<p>${escapeHtml(document.summary)}</p><p class="meta">${escapeHtml(meta)}</p></header>`)
 parts.push(`<article><h2>${t.objectives}</h2><ul>${document.learningObjectives.map(item=>`<li>${escapeHtml(item)}</li>`).join('')}</ul>`)
 if(document.prerequisites.length)parts.push(`<h2>${t.prerequisites}</h2><ul>${document.prerequisites.map(item=>`<li>${escapeHtml(item)}</li>`).join('')}</ul>`)
 for(const section of document.sections)parts.push(`<h2>${escapeHtml(section.title)}</h2>`,markdownToHtml(section.markdown,xhtml))
 parts.push(`<h2>${t.takeaways}</h2><ul>${document.keyTakeaways.map(item=>`<li>${escapeHtml(item)}</li>`).join('')}</ul>`)
 if(document.glossary.length)parts.push(`<h2>${t.glossary}</h2><dl>${document.glossary.map(item=>`<dt><strong>${escapeHtml(item.term)}</strong></dt><dd>${escapeHtml(item.definition)}</dd>`).join('')}</dl>`)
 parts.push(`<h2>${t.review}</h2><ol>${document.reviewQuestions.map(item=>`<li>${escapeHtml(item.question)}${item.answerGuide?`<br${xhtml?' /':''}><span class="muted">${escapeHtml(t.answer)}: ${escapeHtml(item.answerGuide)}</span>`:''}</li>`).join('')}</ol>`)
 if(document.references.length)parts.push(`<h2>${t.references}</h2><ul>${document.references.map(item=>`<li>${item.url?`<a href="${escapeAttr(item.url)}" rel="noopener noreferrer">${escapeHtml(item.title)}</a>`:escapeHtml(item.title)}${item.note?` — ${escapeHtml(item.note)}`:''}</li>`).join('')}</ul>`)
 parts.push('</article>')
 const nav: string[]=['<nav class="lesson-nav">']
 nav.push(options.prev?`<a href="${escapeAttr(options.prev.href)}">← ${escapeHtml(options.prev.title)}</a>`:'<span></span>')
 nav.push(options.next?`<a href="${escapeAttr(options.next.href)}">${escapeHtml(options.next.title)} →</a>`:'<span></span>')
 nav.push('</nav>')
 return shell(document.title,lang,parts.join('\n')+nav.join(''),options,xhtml)
}

export const lessonPageFileName=(document:LessonDocument)=>`${String(document.sequence).padStart(2,'0')}-${document.slug}.html`

/** Course index page linking all lessons in plan order. */
export function courseIndexHtml(documents:readonly LessonDocument[],courseTitle:string,crumb:string,xhtml=false):string{
 const language=documents[0]?.language??'zh-CN'
 const countLabel=language==='zh-CN'?`${documents.length} 篇`:`${documents.length} lessons`
 const body=`<header class="hero"><h1>${escapeHtml(courseTitle)}</h1><p class="meta">${countLabel}</p></header>
${documents.map(document=>`<section class="card"><span class="badge">${String(document.sequence).padStart(2,'0')}</span><a href="${escapeAttr(lessonPageFileName(document))}"><strong>${escapeHtml(document.title)}</strong></a><p class="muted">${escapeHtml(document.summary)}</p><p class="meta">${escapeHtml(document.metadata.stageTitle)}</p></section>`).join('\n')}`
 return shell(courseTitle,language,body,{courseTitle,crumb,indexHref:'index.html',nav:documents.map(document=>({href:lessonPageFileName(document),title:document.title,sequence:document.sequence})),showToc:false},xhtml)
}

/** One print-oriented HTML document containing the whole course; used for PDF rendering. */
export function coursePrintHtml(documents:readonly LessonDocument[],courseTitle:string):string{
 const language=documents[0]?.language??'zh-CN',t=lessonStrings(language)
 const countLabel=language==='zh-CN'?`${documents.length} 篇`:`${documents.length} lessons`
 const parts=[`<header class="hero"><h1>${escapeHtml(courseTitle)}</h1><p class="meta">${countLabel}</p></header>`]
 for(const document of documents){
  parts.push(`<article style="break-before:page"><h1>${String(document.sequence).padStart(2,'0')} · ${escapeHtml(document.title)}</h1><p class="muted">${escapeHtml(document.summary)}</p>`)
  for(const section of document.sections)parts.push(`<h2>${escapeHtml(section.title)}</h2>`,markdownToHtml(section.markdown))
  parts.push(`<h2>${t.takeaways}</h2><ul>${document.keyTakeaways.map(item=>`<li>${escapeHtml(item)}</li>`).join('')}</ul></article>`)
 }
 return`<!DOCTYPE html>
<html lang="${language}"><head><meta charset="utf-8"><title>${escapeHtml(courseTitle)}</title><style>${siteStyles}</style></head>
<body><div class="site">${parts.join('\n')}</div></body></html>`
}
