import {unified} from 'unified'
import remarkParse from 'remark-parse'
import remarkGfm from 'remark-gfm'
interface MarkdownNode {type:string;children?:MarkdownNode[];url?:string}

const allowed=new Set(['root','paragraph','text','heading','emphasis','strong','delete','inlineCode','code','blockquote','list','listItem','break','thematicBreak','link','table','tableRow','tableCell'])
const parse=(markdown:string)=>unified().use(remarkParse).use(remarkGfm).parse(markdown)
const children=(node:MarkdownNode)=>node.children??[]

export function validateMarkdown(markdown:string):string{
  if(markdown.length>12_000)throw new Error('CONTENT_MARKDOWN_INVALID')
  const tree=parse(markdown);let nodes=0
  const visit=(node:MarkdownNode,depth:number)=>{if(++nodes>2_000||depth>32||!allowed.has(node.type))throw new Error('CONTENT_MARKDOWN_INVALID');if(node.type==='link'){const url=String((node as MarkdownNode&{url:string}).url);if(/^(javascript|data|file):/i.test(url)||url.startsWith('/')||url.startsWith('\\')||/^[a-zA-Z]:[\\/]/.test(url)||!(/^(https?:|mailto:)/i.test(url)||!url.includes(':')))throw new Error('CONTENT_MARKDOWN_INVALID')}for(const child of children(node))visit(child,depth+1)}
  visit(tree,0);return markdown.replace(/\r\n?/g,'\n').trim()
}

/** Every absolute link target inside a markdown body; relative or anchor links are ignored. */
export function collectMarkdownUrls(markdown:string):string[]{
 const urls:string[]=[]
 const visit=(node:MarkdownNode)=>{if(node.type==='link'){const url=String((node as MarkdownNode&{url:string}).url);if(/^[a-z][a-z0-9+.-]*:/i.test(url))urls.push(url)}for(const child of children(node))visit(child)}
 visit(parse(markdown));return urls
}
