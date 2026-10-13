/** Declarative Host interview spec: every Probe's kind, cardinality, canonical codes, and bilingual copy. */
import type {GoalIntent,InterviewProbeId,InterviewTopic} from './types.js'

export type Language='zh-CN'|'en'
export interface Copy{zh:string;en:string}
export const copyFor=(copy:Copy,language:Language)=>language==='en'?copy.en:copy.zh
export type ProbeKind='free-text'|'single'|'ordinal'|'multi'|'number'|'deadline'
/** How learner free text is read: kept as text, recorded as `other`, re-asked, or parsed. */
export type CustomPolicy='text'|'other'|'clarify'|'hours'|'date'
export interface ProbeOption{code:string;host:Copy;exclusive?:boolean;hours?:number}
export interface InterviewProbeDefinition{
 id:InterviewProbeId;topic:InterviewTopic;kind:ProbeKind;title:Copy;header:Copy;question:(subject:string)=>Copy;options:readonly ProbeOption[]
 /** Host-owned "not sure" option; choosing it records a labelled Host recommendation. */
 unsure:Copy|null
 /** Value recorded for an unsure answer or once the clarification budget is spent; null keeps asking. */
 recommendation:readonly string[]|number|'by-outcome'|null
 /** Learner code recorded when free text expresses uncertainty on a Probe without an unsure option. */
 uncertainCode?:string
 custom:CustomPolicy
 /** Whether a model may record an assumption instead of asking; never for goal, style, or success Probes. */
 inferable:boolean
 /** required: always asked; conditional: asked when askWhen holds; optional: asked only when a model adds it. */
 presence:'required'|'conditional'|'optional'
 askWhen?:{probeId:InterviewProbeId;notCodes:readonly string[]}}

export const UNSURE_CODE='unsure'
export const OTHER_CODE='other'
const header:Copy={zh:'学习档案',en:'Learning profile'}
const unsure:Copy={zh:'还不确定，请帮我推荐',en:'Not sure — recommend for me'}
const o=(code:string,zh:string,en:string,extra:Partial<ProbeOption>={}):ProbeOption=>({code,host:{zh,en},...extra})
const q=(zh:string,en:string)=>()=>({zh,en})

export const INTERVIEW_PROBES:readonly InterviewProbeDefinition[]=[
 {id:'goal.subject',topic:'goal',kind:'free-text',title:{zh:'学习主题',en:'Learning subject'},header,question:q('你现在想学什么？\n不需要专业术语，按自己的说法描述即可。','What do you want to learn right now?\nNo jargon needed — describe it in your own words.'),options:[],unsure:null,recommendation:null,custom:'text',inferable:false,presence:'required'},
 {id:'goal.outcome',topic:'goal',kind:'ordinal',title:{zh:'期望目标',en:'Desired outcome'},header,question:subject=>({zh:`关于「${subject}」，下面哪个目标最接近你的想法？`,en:`For "${subject}", which goal is closest to what you want?`}),options:[o('explore','先简单了解它是什么','Get a quick sense of what it is'),o('overview','理解核心概念和完整流程','Understand the core concepts and the overall flow'),o('interpret','能看懂典型案例或现有方案','Read and understand typical cases or existing solutions'),o('guided-use','能跟着示例完成基础操作','Follow examples to do basic tasks'),o('independent-use','能独立完成一个基础任务','Complete a basic task on my own'),o('design','能独立设计一套完整方案','Design a complete solution on my own')],unsure:{zh:'还不确定，请根据入门目标推荐',en:'Not sure yet — recommend an entry-level goal'},recommendation:['overview'],custom:'other',inferable:false,presence:'required'},
 {id:'current-foundation.relevant-experience',topic:'current-foundation',kind:'multi',title:{zh:'相关经验',en:'Related experience'},header,question:q('你以前接触过哪些和它相关的东西？可以多选。','What related experience do you already have? Choose all that apply.'),options:[o('none','完全没接触过','None at all',{exclusive:true}),o('heard-of-it','看过或听过一些介绍','Seen or heard some introductions'),o('tried-learning','学过一点，但没学完或没坚持','Studied a bit but did not finish'),o('small-practice','做过相关的小练习或小项目','Done related exercises or small projects'),o('adjacent-skill','有相近领域的经验或技能','Experience or skills in a related area')],unsure:null,recommendation:['none'],custom:'other',inferable:false,presence:'required'},
 {id:'learning-mode.style',topic:'learning-mode',kind:'single',title:{zh:'学习方式',en:'Learning style'},header,question:q('你希望怎么学？','How would you like to learn?'),options:[o('read-only','只看和理解，暂时不动手','Read and understand only — no hands-on for now'),o('understand-first','以理解为主，偶尔做点小练习','Mostly understanding, with a little practice'),o('balanced','理解和动手练习各占一半','Half understanding, half hands-on practice'),o('hands-on','以动手实践为主，边做边学','Mostly hands-on — learn by doing')],unsure,recommendation:['balanced'],custom:'clarify',inferable:false,presence:'required'},
 {id:'time-budget.weekly-hours',topic:'time-budget',kind:'number',title:{zh:'每周时间',en:'Weekly time'},header,question:q('你每周大约能投入多少小时？也可以直接写一个数字。','About how many hours a week can you spend? You can also type a number.'),options:[o('h1','1 小时','1 hour',{hours:1}),o('h2','2 小时','2 hours',{hours:2}),o('h4','4 小时','4 hours',{hours:4}),o('h6','6 小时','6 hours',{hours:6}),o('h10','10 小时','10 hours',{hours:10})],unsure,recommendation:2,custom:'hours',inferable:false,presence:'required'},
 {id:'constraints.constraints',topic:'constraints',kind:'multi',title:{zh:'练习限制',en:'Practice constraints'},header,question:q('动手练习时有哪些限制？可以多选。','Any limits on hands-on practice? Choose all that apply.'),options:[o('none','没有特别限制','No particular constraints',{exclusive:true}),o('mobile-only','只能用手机或平板','Phone or tablet only'),o('no-install','不想安装软件或注册账号','No installing software or creating accounts'),o('free-only','只用免费的资料和工具','Free materials and tools only')],unsure:null,recommendation:['none'],custom:'other',inferable:true,presence:'conditional',askWhen:{probeId:'learning-mode.style',notCodes:['read-only']}},
 {id:'success-criteria.criteria',topic:'success-criteria',kind:'multi',title:{zh:'成功标准',en:'Success criteria'},header,question:q('学到什么程度，你会觉得这次学习成功了？可以多选。','What would make this learning a success for you? Choose all that apply.'),options:[o('explain-to-others','能用自己的话讲给别人听','Explain it to someone in my own words'),o('understand-structure','能说清它由哪些部分组成、怎么运作','Describe its parts and how it works'),o('evaluate','能判断好坏、指出问题','Judge quality and spot problems'),o('follow-discussions','能看懂相关文章和讨论','Follow related articles and discussions'),o('complete-task','能独立完成一个小任务','Complete a small task on my own'),o('build-artifact','能做出一个完整的小作品','Build a small, complete piece of work'),o('pass-quiz','能通过一次小测验','Pass a short quiz'),o('confidence','心里有底，不再觉得它很神秘','Feel confident; it no longer seems mysterious')],unsure,recommendation:'by-outcome',custom:'other',inferable:false,presence:'optional'},
 {id:'current-foundation.level',topic:'current-foundation',kind:'single',title:{zh:'当前基础',en:'Starting level'},header,question:q('你目前在这个主题上的基础处于哪个阶段？','Where are you starting from on this subject?'),options:[o('beginner','初学者，基本没有基础','Beginner — little or no background'),o('intermediate','有一定基础','Some background'),o('advanced','经验比较丰富','Quite experienced')],unsure,recommendation:['beginner'],custom:'clarify',inferable:true,presence:'optional'},
 {id:'current-foundation.existing-resources',topic:'current-foundation',kind:'multi',title:{zh:'已有资源',en:'Available resources'},header,question:q('你手头已经有哪些可以用的资料或条件？可以多选。','What materials or resources do you already have? Choose all that apply.'),options:[o('none','暂时什么都没有','Nothing yet',{exclusive:true}),o('course-or-book','一本教材或一门课程','A textbook or a course'),o('scattered-materials','一些零散的文章、视频或笔记','Scattered articles, videos, or notes'),o('mentor','可以请教的老师、同事或朋友','Someone I can ask for help'),o('tools-or-data','相关的软件、账号或数据','Related software, accounts, or data'),o('practice-environment','可以动手练习的环境','An environment to practise in')],unsure:null,recommendation:['none'],custom:'other',inferable:true,presence:'optional'},
 {id:'knowledge-gaps.primary-gaps',topic:'knowledge-gaps',kind:'multi',title:{zh:'知识缺口',en:'Knowledge gaps'},header,question:q('你觉得目前最不清楚、最想先弄明白的是哪些？可以多选。','What is least clear to you, or what do you most want to figure out first? Choose all that apply.'),options:[o('where-to-start','不知道从哪里开始','Where to start'),o('terminology','名词和术语看不懂','The terms and jargon'),o('core-logic','它背后的道理和逻辑','The logic behind it'),o('evaluation','怎么判断好坏、效果如何','How to judge whether something is good'),o('hands-on-steps','具体该怎么动手做','How to actually do it'),o('cannot-tell','说不清自己缺什么','I cannot tell what I am missing',{exclusive:true})],unsure:null,recommendation:['cannot-tell'],uncertainCode:'cannot-tell',custom:'other',inferable:false,presence:'optional'},
 {id:'time-budget.distribution',topic:'time-budget',kind:'single',title:{zh:'时间安排',en:'Time pattern'},header,question:q('这些时间大体会怎么安排？','How will that time usually be spread out?'),options:[o('daily-short','每天一小段，比较规律','A short session most days'),o('few-sessions','每周两三次，每次一小时左右','Two or three sessions a week, about an hour each'),o('weekend-block','集中在周末的整块时间','A block of time at the weekend'),o('irregular','不固定，看哪天有空','Irregular — whenever I am free'),o('fragmented','只能利用碎片时间','Only small scraps of time')],unsure:null,recommendation:['irregular'],custom:'other',inferable:true,presence:'optional'},
 {id:'time-budget.deadline',topic:'time-budget',kind:'deadline',title:{zh:'期限',en:'Deadline'},header,question:q('你希望在什么时候前达到目标？有具体日期也可以直接写。','When would you like to reach this goal? You can also type a specific date.'),options:[o('none','没有明确期限','No fixed deadline'),o('1-month','1 个月以内','Within a month'),o('3-months','3 个月以内','Within three months'),o('6-months','半年以内','Within six months'),o('1-year','一年以内','Within a year')],unsure:null,recommendation:['none'],custom:'date',inferable:true,presence:'optional'},
 {id:'learning-mode.example-preference',topic:'learning-mode',kind:'multi',title:{zh:'示例偏好',en:'Example preference'},header,question:q('你希望例子以什么形式出现？可以多选。','How would you like examples to be presented? Choose all that apply.'),options:[o('analogy','用生活里的类比讲道理','Everyday analogies'),o('walkthrough','拿一个真实的小例子从头走一遍','Walk through a small real example from start to finish'),o('compare','两个例子对比着看','Compare two examples side by side'),o('complete-example','可以直接照着做的完整例子','A complete example I can follow'),o('principle-first','先讲清原理，再看例子','The principle first, then the example'),o('pitfalls-first','先讲常见的坑和风险','Common pitfalls and risks first'),o('example-rich','尽量多举例，每个阶段都要有例子','As many examples as possible, in every stage')],unsure:null,recommendation:['walkthrough'],custom:'other',inferable:true,presence:'optional'},
]
/** How the one learning-style answer sets the two plan-gating preferences. */
export const STYLE_PREFERENCES:Readonly<Record<string,{mode:'knowledge-first'|'balanced'|'practice-first';practiceCapacity:'none'|'light'|'full'}>>={'read-only':{mode:'knowledge-first',practiceCapacity:'none'},'understand-first':{mode:'knowledge-first',practiceCapacity:'light'},balanced:{mode:'balanced',practiceCapacity:'light'},'hands-on':{mode:'practice-first',practiceCapacity:'full'}}
/** Starting level derived from experience when the level Probe was not asked: hands-on practice means some background. */
export const levelFromExperience=(codes:readonly string[]):'beginner'|'intermediate'=>codes.includes('small-practice')?'intermediate':'beginner'
/** Success criteria derived from the outcome, or recorded when the learner asks the Host to recommend them. */
export const RECOMMENDED_CRITERIA_BY_OUTCOME:Readonly<Record<GoalIntent,readonly string[]>>={explore:['confidence','follow-discussions'],overview:['explain-to-others','understand-structure'],interpret:['understand-structure','evaluate'],'guided-use':['complete-task'],'independent-use':['complete-task','build-artifact'],design:['build-artifact','evaluate']}
export const probeDefinition=(id:InterviewProbeId)=>INTERVIEW_PROBES.find(p=>p.id===id)!
export const probesForTopic=(topic:InterviewTopic)=>INTERVIEW_PROBES.filter(p=>p.topic===topic).map(p=>p.id)

const unsafe=/<[^>]+>|tool\s*call|\b(?:workspace|session|probe|project)[\s_-]*ids?\b|learnloop_|question\s*token/i
export const unsafeText=(text:string)=>unsafe.test(text)
/**
 * Validate a model-authored question for the current Probe. The model may phrase the question in
 * the learner's language and refer to the subject, but it may not smuggle control markers, tool
 * names, or internal identifiers into the learner-facing text. Returns null when unusable so the
 * caller falls back to the Host-owned wording.
 */
export function validateProbeQuestion(question:unknown):string|null{
 if(typeof question!=='string')return null
 const text=question.trim()
 if(text.length<4||text.length>600||unsafeText(text))return null
 return text
}
