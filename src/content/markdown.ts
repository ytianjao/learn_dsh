import {unified} from 'unified'
import remarkParse from 'remark-parse'
import remarkGfm from 'remark-gfm'
interface MarkdownNode {type:string;children?:MarkdownNode[];url?:string}

const allowed=new Set(['root','paragraph','text','heading','emphasis','strong','delete','inlineCode','code','blockquote','list','listItem','break','thematicBreak','link','table','tableRow','tableCell'])
export function validateMarkdown(markdown:string):string{
  if(markdown.length>12_000)throw new Error('CONTENT_MARKDOWN_INVALID')
  const tree=unified().use(remarkParse).use(remarkGfm).parse(markdown);let nodes=0
  const visit=(node:MarkdownNode,depth:number)=>{if(++nodes>2_000||depth>32||!allowed.has(node.type))throw new Error('CONTENT_MARKDOWN_INVALID');if(node.type==='link'){const url=String((node as MarkdownNode&{url:string}).url);if(/^(javascript|data|file):/i.test(url)||url.startsWith('/')||url.startsWith('\\')||/^[a-zA-Z]:[\\/]/.test(url)||!(/^(https?:|mailto:)/i.test(url)||!url.includes(':')))throw new Error('CONTENT_MARKDOWN_INVALID')}for(const child of (node as MarkdownNode).children??[])visit(child,depth+1)}
  visit(tree,0);return markdown.replace(/\r\n?/g,'\n').trim()
}
