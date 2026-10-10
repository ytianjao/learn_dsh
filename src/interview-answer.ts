/**
 * Pure interview pipeline: builds what the learner sees from the Host spec plus optional model
 * enhancements, and reads every answer back into canonical codes. A model that supplies nothing
 * gets the Host defaults; a model that supplies something invalid gets the same defaults plus a
 * report of what was rejected. Nothing here throws on model input.
 */
import {copyFor,INTERVIEW_PROBES,OTHER_CODE,RECOMMENDED_CRITERIA_BY_OUTCOME,UNSURE_CODE,probeDefinition,unsafeText,validateProbeQuestion,type InterviewProbeDefinition,type Language} from './interview-probes.js'
import {goalIntents,type EnhancementReport,type GoalIntent,type InterviewOption,type InterviewProbeId,type ProbeValue,type ProfileChoice,type ProfileDeadline,type ProfileInterviewState} from './types.js'

export const MAX_INFERENCES=3
export const MAX_FOLLOW_UPS=3
export const MAX_ADDED_PROBES=4
const MAX_VARIANTS=3
const MAX_OPTIONS=10

export type AnswerOutcome={kind:'value';value:ProbeValue;origin:'learner'|'host-recommendation';codes:string[];uncertain:boolean}|{kind:'empty'}|{kind:'clarify'}
export interface QuestionSnapshot{question:string;header:string;detail:string|null;multiSelect:boolean;options:InterviewOption[];report:EnhancementReport}

const record=(value:unknown):value is Record<string,unknown>=>typeof value==='object'&&value!==null&&!Array.isArray(value)
const emptyReport=():EnhancementReport=>({applied:[],rejected:[]})
const reject=(report:EnhancementReport,field:string,reason:string)=>{report.rejected.push({field,reason:reason.slice(0,200)})}
const uncertainWords=['不知道','不确定','随便','都可以','以后再说','说不清','unknown','not sure',"don't know",'no idea']
export const isUncertain=(text:string)=>uncertainWords.includes(text.trim().toLowerCase())
const sameText=(a:string,b:string)=>a.trim().toLowerCase()===b.trim().toLowerCase()

export const subjectOf=(interview:ProfileInterviewState)=>{const value=interview.probes['goal.subject']?.value;return value?.kind==='text'?value.text:''}
export const outcomeOf=(interview:ProfileInterviewState):GoalIntent=>{const value=interview.probes['goal.outcome']?.value,code=value?.kind==='choices'?value.choices[0]?.code:undefined;return goalIntents.includes(code as GoalIntent)?code as GoalIntent:'overview'}
export function hostOptions(definition:InterviewProbeDefinition,language:Language):InterviewOption[]{return[...definition.options.map(option=>({code:option.code,label:copyFor(option.host,language),source:'host' as const})),...(definition.unsure?[{code:UNSURE_CODE,label:copyFor(definition.unsure,language),source:'host' as const}]:[])]}
export function valueLabel(value:ProbeValue,language:Language){return value.kind==='text'?value.text:value.kind==='choices'?value.choices.map(choice=>choice.label).join(language==='en'?', ':'、'):value.kind==='hours'?value.label:value.deadline.label}
const hoursLabel=(hours:number,language:Language)=>language==='en'?`${hours} hour${hours===1?'':'s'}`:`${hours} 小时`

/** The value recorded when the learner asks for a recommendation or the clarification budget is spent. */
export function recommendationValue(definition:InterviewProbeDefinition,interview:ProfileInterviewState,language:Language):ProbeValue|null{
 const rec=definition.recommendation
 if(rec===null)return null
 if(typeof rec==='number')return{kind:'hours',hours:rec,label:hoursLabel(rec,language)}
 const codes=rec==='by-outcome'?RECOMMENDED_CRITERIA_BY_OUTCOME[outcomeOf(interview)]:rec
 const options=hostOptions(definition,language)
 if(definition.kind==='deadline'){const option=options.find(x=>x.code===codes[0])!;return{kind:'deadline',deadline:{code:option.code as ProfileDeadline['code'],label:option.label,date:null}}}
 return{kind:'choices',choices:codes.map(code=>{const option=options.find(x=>x.code===code)!;return{code,label:option.label,source:'host' as const}})}
}

/** Merge model-written labels into the Host options: relabel existing codes only, all-or-nothing. */
function mergeModelOptions(definition:InterviewProbeDefinition,language:Language,raw:unknown,report:EnhancementReport):InterviewOption[]{
 const base=hostOptions(definition,language)
 if(raw===undefined)return base
 const fail=(reason:string)=>{reject(report,'options',reason);return base}
 if(definition.kind==='free-text')return fail('free-text Probes take no options')
 if(!Array.isArray(raw)||!raw.length||raw.length>MAX_OPTIONS)return fail(`options must be an array of 1-${MAX_OPTIONS} items`)
 const relabelable=new Set(definition.options.filter(option=>!option.exclusive).map(option=>option.code)),byCode=new Map<string,InterviewOption[]>()
 for(const item of raw){
  if(!record(item))return fail('each option must be an object')
  const {code,label,description}=item
  if(typeof code!=='string'||!relabelable.has(code))return fail(`unknown or Host-owned code: ${String(code).slice(0,40)}`)
  if(typeof label!=='string'||label.trim().length<2||label.trim().length>100||unsafeText(label))return fail(`invalid label for ${code}`)
  if(description!==undefined&&(typeof description!=='string'||!description.trim()||description.length>240||unsafeText(description)))return fail(`invalid description for ${code}`)
  byCode.set(code,[...(byCode.get(code)??[]),{code,label:label.trim(),...(typeof description==='string'?{description:description.trim()}:{}),source:'model' as const}])
 }
 const variants=[...byCode.values()].reduce((count,list)=>count+list.length-1,0)
 if(variants&&definition.kind!=='multi')return fail('only multi-select Probes accept more than one label per code')
 if(variants>MAX_VARIANTS)return fail(`at most ${MAX_VARIANTS} extra labels per Probe`)
 const merged=base.flatMap(option=>byCode.get(option.code)??[option])
 if(merged.length>MAX_OPTIONS+1)return fail('too many options after merging')
 const labels=merged.map(option=>option.label.toLowerCase())
 if(new Set(labels).size!==labels.length)return fail('labels collide after merging')
 report.applied.push('options')
 return merged
}

/** Assumptions recorded since the learner last answered, listed on the next native question. */
function pendingInferenceNotice(interview:ProfileInterviewState,language:Language){
 const recent=[]
 for(const answer of [...interview.answers].reverse()){if(answer.source!=='model-inference')break;recent.unshift(answer)}
 const lines=recent.flatMap(answer=>{const value=interview.probes[answer.probeId].value;if(!value)return[];const title=copyFor(probeDefinition(answer.probeId).title,language);return[language==='en'?`${title}: ${valueLabel(value,language)} (${answer.inference?.reason??''})`:`${title}：${valueLabel(value,language)}（${answer.inference?.reason??''}）`]})
 if(!lines.length)return null
 return language==='en'?`Inferred from your earlier answers — correct them when you review your profile:\n${lines.map(line=>`- ${line}`).join('\n')}`:`根据你之前的回答推断了以下内容，如有不对，可在审阅学习档案时修改：\n${lines.map(line=>`- ${line}`).join('\n')}`
}

export function questionText(definition:InterviewProbeDefinition,interview:ProfileInterviewState,language:Language){return copyFor(definition.question(subjectOf(interview)),language)}

/** Everything the native question shows for the current Probe, with the model's enhancements merged in. */
export function buildQuestionSnapshot(interview:ProfileInterviewState,enhancement:{probeId?:unknown;question?:unknown;options?:unknown},language:Language):QuestionSnapshot{
 const pending=interview.pendingQuestion!,definition=probeDefinition(pending.probeId),report=emptyReport()
 const bound=enhancement.probeId===undefined||enhancement.probeId===definition.id
 if(!bound)reject(report,'probeId',`does not match the current Probe ${definition.id}; enhancements ignored`)
 let question=questionText(definition,interview,language)
 if(bound&&enhancement.question!==undefined){const reworded=validateProbeQuestion(enhancement.question);if(reworded){question=reworded;report.applied.push('question')}else reject(report,'question','must be 4-600 characters without control markers or internal identifiers')}
 const options=bound?mergeModelOptions(definition,language,enhancement.options,report):hostOptions(definition,language)
 const clarification=pending.stage==='clarification'?(language==='en'?'The previous answer did not match an option. Please choose one, or say it another way.':'上一次的回答没能对应到选项，请从选项中选择，或换一种说法。'):null
 const detail=[clarification,pendingInferenceNotice(interview,language)].filter(Boolean).join('\n\n')||null
 return{question,header:copyFor(definition.header,language),detail,multiSelect:definition.kind==='multi',options,report}
}

const chineseDigits:Record<string,number>={零:0,一:1,二:2,两:2,三:3,四:4,五:5,六:6,七:7,八:8,九:9}
function chineseNumber(text:string){if(text==='十')return 10;const [tens,ones]=text.includes('十')?text.split('十'):['',text];const t=tens===''&&text.includes('十')?1:tens?chineseDigits[tens]??NaN:0,u=ones?chineseDigits[ones]??NaN:0;return text.includes('十')?t*10+u:u}
const withArabic=(text:string)=>text.replace(/[零一二两三四五六七八九十]+/g,match=>String(chineseNumber(match)))
/** Weekly hours from free text such as "4", "每周 3 小时", "三个小时", "2-3 hours" (first number wins). */
export function parseHours(text:string):number|null{
 const cleaned=text.trim().replace(/^(?:每周|一周|每星期|每个星期|per week|a week)\s*/i,'').replace(/\s*(?:每周|一周|per week|a week)$/i,'')
 const match=withArabic(cleaned).match(/^(?:大约|大概|约|about|around)?\s*(\d{1,2})(?:\s*[-~～到至]\s*\d{1,2})?\s*(?:个)?\s*(?:小时|钟头|hours?|hrs?|h)?\s*(?:左右|上下)?$/i)
 const hours=match?Number(match[1]):NaN
 return Number.isInteger(hours)&&hours>=1&&hours<=80?hours:null
}
/** A deadline from free text: an explicit date, a duration bucket, or `other` with the learner's words. */
export function parseDeadline(text:string,today=new Date()):ProfileDeadline{
 const label=text.trim().slice(0,500),pad=(n:number)=>String(n).padStart(2,'0')
 const full=label.match(/(\d{4})\s*[-/.年]\s*(\d{1,2})\s*[-/.月]\s*(\d{1,2})/)
 if(full){const [y,m,d]=[Number(full[1]),Number(full[2]),Number(full[3])];if(m>=1&&m<=12&&d>=1&&d<=31)return{code:'date',label,date:`${y}-${pad(m)}-${pad(d)}`}}
 const monthDay=label.match(/(\d{1,2})\s*月\s*(\d{1,2})\s*[日号]?/)
 if(monthDay){const [m,d]=[Number(monthDay[1]),Number(monthDay[2])];if(m>=1&&m<=12&&d>=1&&d<=31){const passed=m<today.getMonth()+1||m===today.getMonth()+1&&d<today.getDate();return{code:'date',label,date:`${today.getFullYear()+(passed?1:0)}-${pad(m)}-${pad(d)}`}}}
 const duration=withArabic(label.replace(/半年/g,'6个月')).match(/(\d+)\s*(?:个)?\s*(周|星期|weeks?|月|months?|年|years?)/i)
 if(duration){const n=Number(duration[1]),unit=duration[2]!.toLowerCase(),weeks=/周|星期|week/.test(unit)?n:/月|month/.test(unit)?n*4.35:n*52;const code=weeks<=4.5?'1-month':weeks<=13.1?'3-months':weeks<=26.2?'6-months':weeks<=52.2?'1-year':null;if(code)return{code,label,date:null}}
 return{code:'other',label,date:null}
}

const optionChoice=(option:InterviewOption):ProfileChoice=>({code:option.code,label:option.label,source:option.source})
const learnerChoice=(code:string,label:string):ProfileChoice=>({code,label:label.slice(0,500),source:'learner'})
const choicesValue=(choices:ProfileChoice[],origin:'learner'|'host-recommendation'='learner',uncertain=false):AnswerOutcome=>({kind:'value',value:{kind:'choices',choices},origin,codes:choices.map(choice=>choice.code),uncertain})
function recommended(definition:InterviewProbeDefinition,interview:ProfileInterviewState,language:Language):AnswerOutcome{const value=recommendationValue(definition,interview,language);if(!value)return{kind:'clarify'};return{kind:'value',value,origin:'host-recommendation',codes:value.kind==='choices'?value.choices.map(x=>x.code):value.kind==='deadline'?[value.deadline.code]:[],uncertain:true}}

/**
 * Read one answer into canonical codes. Every selected label counts; on multi-select Probes a
 * substantive choice outranks an exclusive one ("none", "cannot tell") picked alongside it.
 */
export function normalizeAnswer(definition:InterviewProbeDefinition,options:readonly InterviewOption[],selected:readonly string[],custom:string|null|undefined,interview:ProfileInterviewState,language:Language,today=new Date()):AnswerOutcome{
 const text=(custom??'').trim()
 const picked=selected.map(label=>options.find(option=>option.label===label.trim())).filter((option):option is InterviewOption=>Boolean(option)).filter((option,index,all)=>all.findIndex(other=>other.label===option.label)===index)
 if(!picked.length&&!text)return{kind:'empty'}
 const asksForRecommendation=picked.some(option=>option.code===UNSURE_CODE)||Boolean(text)&&isUncertain(text)&&Boolean(definition.unsure)
 const textOption=text?options.find(option=>sameText(option.label,text)||sameText(option.code,text)):undefined
 const uncertainText=Boolean(text)&&isUncertain(text)
 if(definition.kind==='free-text'){if(uncertainText||text.length<2)return{kind:'clarify'};return{kind:'value',value:{kind:'text',text:text.slice(0,2_000)},origin:'learner',codes:[],uncertain:false}}
 if(definition.kind==='number'){
  const option=picked.find(x=>x.code!==UNSURE_CODE)??(textOption?.code!==UNSURE_CODE?textOption:undefined)
  if(option){const hours=definition.options.find(x=>x.code===option.code)?.hours;if(hours)return{kind:'value',value:{kind:'hours',hours,label:option.label},origin:'learner',codes:[option.code],uncertain:false}}
  if(asksForRecommendation)return recommended(definition,interview,language)
  const hours=parseHours(text);if(hours)return{kind:'value',value:{kind:'hours',hours,label:hoursLabel(hours,language)},origin:'learner',codes:[],uncertain:false}
  return{kind:'clarify'}
 }
 if(definition.kind==='deadline'){
  const option=picked[0]??textOption
  if(option)return{kind:'value',value:{kind:'deadline',deadline:{code:option.code as ProfileDeadline['code'],label:option.label,date:null}},origin:'learner',codes:[option.code],uncertain:false}
  if(uncertainText)return recommended(definition,interview,language)
  const deadline=parseDeadline(text,today);return{kind:'value',value:{kind:'deadline',deadline},origin:'learner',codes:[deadline.code],uncertain:false}
 }
 if(definition.kind==='multi'){
  let chosen=picked.filter(option=>option.code!==UNSURE_CODE).map(optionChoice)
  if(text&&!uncertainText)chosen=[...chosen,textOption?optionChoice(textOption):learnerChoice(OTHER_CODE,text)]
  const exclusive=new Set(definition.options.filter(option=>option.exclusive).map(option=>option.code))
  if(chosen.some(choice=>!exclusive.has(choice.code)))chosen=chosen.filter(choice=>!exclusive.has(choice.code))
  chosen=chosen.filter((choice,index,all)=>all.findIndex(other=>other.label===choice.label)===index)
  if(chosen.length)return choicesValue(chosen)
  if(asksForRecommendation)return recommended(definition,interview,language)
  if(uncertainText&&definition.uncertainCode){const option=options.find(x=>x.code===definition.uncertainCode)!;return choicesValue([optionChoice(option)])}
  return{kind:'clarify'}
 }
 // single and ordinal
 const option=picked[0]??textOption
 if(option?.code===UNSURE_CODE||!option&&asksForRecommendation)return recommended(definition,interview,language)
 if(option)return choicesValue([optionChoice(option)])
 if(uncertainText&&definition.uncertainCode){const fallback=options.find(x=>x.code===definition.uncertainCode)!;return choicesValue([optionChoice(fallback)])}
 if(!uncertainText&&definition.custom==='other')return choicesValue([learnerChoice(OTHER_CODE,text)])
 return{kind:'clarify'}
}

/** A chat reply to a fallback Probe: labels from the latest snapshot (or the Host's), split on list separators for multi-select. */
export function normalizeChatAnswer(definition:InterviewProbeDefinition,options:readonly InterviewOption[],text:string,interview:ProfileInterviewState,language:Language,today=new Date()){
 const known=options.length?options:hostOptions(definition,language)
 if(definition.kind!=='multi'){const exact=known.find(option=>sameText(option.label,text));return normalizeAnswer(definition,known,exact?[exact.label]:[],exact?null:text,interview,language,today)}
 const parts=text.split(/[，、,;；\n]+/).map(part=>part.trim()).filter(Boolean),selected:string[]=[],rest:string[]=[]
 for(const part of parts){const exact=known.find(option=>sameText(option.label,part));if(exact)selected.push(exact.label);else rest.push(part)}
 return normalizeAnswer(definition,known,selected,rest.join(language==='en'?', ':'，')||null,interview,language,today)
}

/** Whether a Probe belongs in this interview: required always, conditional when its askWhen holds, optional once a model added it. */
export function probeApplies(interview:ProfileInterviewState,definition:InterviewProbeDefinition){
 if(definition.presence==='optional')return interview.addedProbeIds.includes(definition.id)
 if(definition.presence==='conditional'&&definition.askWhen){const value=interview.probes[definition.askWhen.probeId].value;return value?.kind==='choices'&&!value.choices.some(choice=>definition.askWhen!.notCodes.includes(choice.code))}
 return true
}
/** The next Probe to ask: optional Probes a model added come first, then the Host baseline in spec order. */
export function nextProbeId(interview:ProfileInterviewState):InterviewProbeId|null{
 const open=(id:InterviewProbeId)=>interview.probes[id].status!=='answered'
 return interview.addedProbeIds.find(open)??INTERVIEW_PROBES.find(definition=>definition.presence!=='optional'&&open(definition.id)&&probeApplies(interview,definition))?.id??null
}
const addableProbes=(interview:ProfileInterviewState)=>INTERVIEW_PROBES.filter(definition=>definition.presence==='optional'&&!interview.addedProbeIds.includes(definition.id)&&interview.probes[definition.id].status!=='answered')
/** Validate optional Probes a model asks the Host to add; each accepted one is asked next, within the budget. */
export function validateAddProbes(interview:ProfileInterviewState,raw:unknown):{added:InterviewProbeId[];rejected:EnhancementReport['rejected']}{
 const rejected:EnhancementReport['rejected']=[],added:InterviewProbeId[]=[]
 if(!Array.isArray(raw))return{added,rejected:[{field:'addProbes',reason:'addProbes must be a list of optional Probe ids'}]}
 for(const id of raw){
  const definition=INTERVIEW_PROBES.find(item=>item.id===id)
  if(!definition||definition.presence!=='optional')rejected.push({field:'addProbes',reason:`${String(id).slice(0,60)} is not an optional Probe`})
  else if(!addableProbes(interview).some(item=>item.id===id)||added.includes(definition.id))rejected.push({field:'addProbes',reason:`${definition.id} is already added or answered`})
  else if(interview.addedProbeIds.length+added.length>=MAX_ADDED_PROBES)rejected.push({field:'addProbes',reason:`at most ${MAX_ADDED_PROBES} optional Probes per interview`})
  else added.push(definition.id)
 }
 return{added,rejected}
}

const inferencesUsed=(interview:ProfileInterviewState)=>interview.answers.filter(answer=>answer.source==='model-inference').length
export function inferenceAllowed(interview:ProfileInterviewState){const pending=interview.pendingQuestion;if(!pending)return false;const definition=probeDefinition(pending.probeId);return definition.inferable&&pending.stage==='initial'&&!interview.probes[pending.probeId].answerIds.length&&inferencesUsed(interview)<MAX_INFERENCES}
export function followUpAllowed(interview:ProfileInterviewState){const after=interview.pendingQuestion?.followUpOf;if(!after)return false;const topic=probeDefinition(after).topic;return interview.supplementaryAnswers.length<MAX_FOLLOW_UPS&&!interview.supplementaryAnswers.some(answer=>answer.topic===topic)}

/** Validate a model assumption for the current Probe; the value uses Host labels. */
export function validateAssumption(interview:ProfileInterviewState,raw:unknown,language:Language):{ok:true;value:ProbeValue;codes:string[];reason:string}|{ok:false;reason:string}{
 const pending=interview.pendingQuestion
 if(!pending)return{ok:false,reason:'no current Probe'}
 const definition=probeDefinition(pending.probeId)
 if(!inferenceAllowed(interview))return{ok:false,reason:!definition.inferable?`${definition.id} is not inferable`:inferencesUsed(interview)>=MAX_INFERENCES?`at most ${MAX_INFERENCES} assumptions per interview`:'only a first, unanswered question can be assumed'}
 if(!record(raw))return{ok:false,reason:'assume must be an object'}
 const reason=typeof raw.reason==='string'?raw.reason.trim():''
 if(reason.length<4||reason.length>300||unsafeText(reason))return{ok:false,reason:'assume.reason must be 4-300 characters without internal identifiers'}
 const options=hostOptions(definition,language).filter(option=>option.code!==UNSURE_CODE)
 if(definition.kind==='deadline'&&typeof raw.date==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(raw.date))return{ok:true,value:{kind:'deadline',deadline:{code:'date',label:raw.date,date:raw.date}},codes:['date'],reason}
 const codes=Array.isArray(raw.codes)?raw.codes.filter((code):code is string=>typeof code==='string'):[]
 if(!codes.length||codes.length!==(raw.codes as unknown[]).length||new Set(codes).size!==codes.length)return{ok:false,reason:'assume.codes must be a non-empty list of distinct codes'}
 const chosen=codes.map(code=>options.find(option=>option.code===code))
 if(chosen.some(option=>!option))return{ok:false,reason:`unknown code for ${definition.id}`}
 if(definition.kind!=='multi'&&codes.length!==1)return{ok:false,reason:`${definition.id} takes exactly one code`}
 const exclusive=definition.options.filter(option=>option.exclusive).map(option=>option.code)
 if(codes.length>1&&codes.some(code=>exclusive.includes(code)))return{ok:false,reason:'an exclusive code cannot be combined with others'}
 if(definition.kind==='deadline'){const option=chosen[0]!;return{ok:true,value:{kind:'deadline',deadline:{code:option.code as ProfileDeadline['code'],label:option.label,date:null}},codes,reason}}
 return{ok:true,value:{kind:'choices',choices:chosen.map(option=>optionChoice(option!))},codes,reason}
}

/** Validate a model follow-up question asked before the current Probe. */
export function validateFollowUp(interview:ProfileInterviewState,raw:unknown):{ok:true;question:string;multiSelect:boolean;options:InterviewOption[]}|{ok:false;reason:string}{
 if(!followUpAllowed(interview))return{ok:false,reason:interview.pendingQuestion?.followUpOf?`follow-up budget spent (one per topic, ${MAX_FOLLOW_UPS} per interview)`:'a follow-up must come right after an answered Probe'}
 if(!record(raw))return{ok:false,reason:'followUp must be an object'}
 const question=validateProbeQuestion(raw.question)
 if(!question)return{ok:false,reason:'followUp.question must be 4-600 characters without control markers or internal identifiers'}
 let options:InterviewOption[]=[]
 if(raw.options!==undefined){
  if(!Array.isArray(raw.options)||raw.options.length<2||raw.options.length>6)return{ok:false,reason:'followUp.options must have 2-6 items'}
  for(const [index,item] of raw.options.entries()){if(!record(item)||typeof item.label!=='string'||item.label.trim().length<2||item.label.trim().length>100||unsafeText(item.label))return{ok:false,reason:'followUp option labels must be 2-100 characters'};if(item.description!==undefined&&(typeof item.description!=='string'||item.description.length>240||unsafeText(item.description)))return{ok:false,reason:'followUp option descriptions must be at most 240 characters'};options.push({code:`follow-up-${index+1}`,label:item.label.trim(),...(typeof item.description==='string'&&item.description.trim()?{description:item.description.trim()}:{}),source:'model'})}
  const labels=options.map(option=>option.label.toLowerCase());if(new Set(labels).size!==labels.length)return{ok:false,reason:'followUp option labels must be distinct'}
 }
 return{ok:true,question,multiSelect:options.length>0&&raw.multiSelect===true,options}
}

/** What the model needs to enhance the current question: kind, codes with Host labels, and budgets. */
export function questionContract(interview:ProfileInterviewState,language:Language){
 const pending=interview.pendingQuestion
 if(!pending)return null
 const definition=probeDefinition(pending.probeId)
 return{token:pending.token,probeId:definition.id,kind:definition.kind,multiSelect:definition.kind==='multi',stage:pending.stage,title:copyFor(definition.title,language),hostQuestion:questionText(definition,interview,language),codes:definition.options.map(option=>({code:option.code,hostLabel:copyFor(option.host,language),...option.exclusive?{exclusive:true}:{}})),unsureOption:Boolean(definition.unsure),inferable:inferenceAllowed(interview),followUp:{allowed:followUpAllowed(interview),afterProbeId:pending.followUpOf,remaining:MAX_FOLLOW_UPS-interview.supplementaryAnswers.length},optionalProbes:interview.addedProbeIds.length<MAX_ADDED_PROBES?addableProbes(interview).map(item=>({probeId:item.id,title:copyFor(item.title,language),kind:item.kind,inferable:item.inferable})):[],addBudget:MAX_ADDED_PROBES-interview.addedProbeIds.length}
}

/** Compact answered-Probe view for the prompt: codes, labels, and who decided each value. */
export function interviewAnswerSummary(interview:ProfileInterviewState,language:Language){return INTERVIEW_PROBES.flatMap(definition=>{const probe=interview.probes[definition.id];if(probe.status!=='answered'||!probe.value)return[];return[{probeId:definition.id,topic:definition.topic,value:valueLabel(probe.value,language).slice(0,200),codes:probe.value.kind==='choices'?probe.value.choices.map(choice=>choice.code):probe.value.kind==='deadline'?[probe.value.deadline.code]:[],origin:probe.valueOrigin}]})}
export const isProbeId=(value:unknown):value is InterviewProbeId=>INTERVIEW_PROBES.some(definition=>definition.id===value)
