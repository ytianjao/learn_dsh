import {zipSync,strToU8} from 'fflate'
import type {LessonDocument} from '../schemas.js'
import {escapeHtml,markdownToHtml,siteStyles} from './html.js'
import {lessonStrings} from './markdown.js'

const xmlEscape=escapeHtml

/** Minimal valid EPUB 3 package: mimetype first and uncompressed, then container, OPF, nav, and lesson XHTML. */
export function buildLessonEpub(documents:readonly LessonDocument[],meta:{title:string;identifier:string;modified:string}):Uint8Array{
 const language=documents[0]?.language??'zh-CN'
 const files:Record<string,[Uint8Array,{level:0|6}]>={}
 files['mimetype']=[strToU8('application/epub+zip'),{level:0}]
 files['META-INF/container.xml']=[strToU8(`<?xml version="1.0" encoding="UTF-8"?>
<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container"><rootfiles><rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/></rootfiles></container>`),{level:6}]
 const manifest=documents.map(document=>`<item id="lesson-${document.sequence}" href="lesson-${String(document.sequence).padStart(2,'0')}.xhtml" media-type="application/xhtml+xml"/>`).join('')
 const spine=documents.map(document=>`<itemref idref="lesson-${document.sequence}"/>`).join('')
 files['OEBPS/content.opf']=[strToU8(`<?xml version="1.0" encoding="UTF-8"?>
<package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="bookid"><metadata xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:identifier id="bookid">urn:uuid:${xmlEscape(meta.identifier)}</dc:identifier><dc:title>${xmlEscape(meta.title)}</dc:title><dc:language>${language}</dc:language><meta property="dcterms:modified">${xmlEscape(meta.modified)}</meta></metadata><manifest><item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/><item id="css" href="style.css" media-type="text/css"/>${manifest}</manifest><spine>${spine}</spine></package>`),{level:6}]
 files['OEBPS/nav.xhtml']=[strToU8(`<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops" lang="${language}"><head><meta charset="utf-8"/><title>${xmlEscape(meta.title)}</title></head><body><nav epub:type="toc"><h1>${xmlEscape(meta.title)}</h1><ol>${documents.map(document=>`<li><a href="lesson-${String(document.sequence).padStart(2,'0')}.xhtml">${xmlEscape(document.title)}</a></li>`).join('')}</ol></nav></body></html>`),{level:6}]
 files['OEBPS/style.css']=[strToU8(siteStyles),{level:6}]
 for(const document of documents){
  const t=lessonStrings(document.language)
  const body=`<header class="hero"><h1>${xmlEscape(document.title)}</h1><p>${xmlEscape(document.summary)}</p></header><article><h2>${t.objectives}</h2><ul>${document.learningObjectives.map(item=>`<li>${xmlEscape(item)}</li>`).join('')}</ul>${document.sections.map(section=>`<h2>${xmlEscape(section.title)}</h2>${markdownToHtml(section.markdown,true)}`).join('')}<h2>${t.takeaways}</h2><ul>${document.keyTakeaways.map(item=>`<li>${xmlEscape(item)}</li>`).join('')}</ul></article>`
  files[`OEBPS/lesson-${String(document.sequence).padStart(2,'0')}.xhtml`]=[strToU8(`<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml" lang="${document.language}"><head><meta charset="utf-8"/><title>${xmlEscape(document.title)}</title><link rel="stylesheet" href="style.css"/></head><body>${body}</body></html>`),{level:6}]
 }
 return zipSync(files)
}
