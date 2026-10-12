import http from 'node:http'
// Deterministic keyless provider for the Web E2E. MOCK_MODEL_POLICY=null sends only the question token
// (the null-model baseline); enhanced (default) rewords and relabels for the quant subject, adds the
// optional deadline question, and assumes the practice constraints.
const port=Number(process.argv[2]||8000),policy=process.env.MOCK_MODEL_POLICY==='null'?'null':'enhanced'
let callSequence=0
// The latest LearnLoop state block supersedes earlier ones; the question contract comes from the latest tool result.
const block=(content,tag)=>{const raw=[...content.matchAll(new RegExp(`<${tag}>\\s*({[^\\n]+})`,'g'))].at(-1)?.[1];try{return JSON.parse(raw??'{}')}catch{return{}}}
const latestContract=messages=>{const tool=messages.filter(m=>m.role==='tool').at(-1);try{return JSON.parse(typeof tool?.content==='string'?tool.content:'{}').nextQuestion??null}catch{return null}}
function decide(question,content){
 // Without a contract in hand (the first question) the call carries no token and the Host asks its current question.
 if(!question)return{}
 const args={questionToken:question.token}
 if(policy==='null')return args
 args.probeId=question.probeId
 if(question.probeId==='goal.outcome'&&/量化交易/.test(content)){args.question='关于量化交易，你希望学到什么程度？';args.options=[{code:'overview',label:'了解量化交易的基本概念和完整流程'},{code:'interpret',label:'能看懂一个简单策略及其回测结果'},{code:'guided-use',label:'能修改参数并运行现有策略'},{code:'independent-use',label:'能独立编写和回测简单策略'}];if(question.optionalProbes?.some(item=>item.probeId==='time-budget.deadline'))args.addProbes=['time-budget.deadline']}
 if(question.probeId==='constraints.constraints'&&question.inferable)args.assume={codes:['free-only'],reason:'学习者说只想用免费工具'}
 return args
}
const server=http.createServer(async(req,res)=>{if(req.method==='GET'){res.writeHead(200);res.end('ok');return}let raw='';for await(const c of req)raw+=c;let body={};try{body=JSON.parse(raw)}catch{}
 const messages=body.messages??[],content=messages.map(m=>typeof m.content==='string'?m.content:JSON.stringify(m.content)).join('\n'),host=block(content,'learnloop-host-control-json'),question=latestContract(messages)
 const asking=(host.requiredTools??[]).includes('learnloop_ask_profile_question')&&!host.awaitingChatProbeId,args=asking?decide(question,content):null
 console.log(JSON.stringify({policy,marker:/LEARNLOOP_RUNTIME_V10/.test(content),probeId:question?.probeId??null,args,visibleTools:(body.tools??[]).map(t=>t.function?.name),messages:messages.length,systemMessages:messages.filter(m=>m.role==='system').length,stateBlocks:content.split('LEARNLOOP_STATE_V1').length-1,contentChars:content.length}))
 const base={id:'mock',object:'chat.completion.chunk',created:Math.floor(Date.now()/1000),model:body.model??'mock-model'}
 // Outside the interview the mock answers in plain text, so the turn ends instead of looping on denied tools.
 const chunk=asking?{...base,choices:[{index:0,delta:{role:'assistant',tool_calls:[{index:0,id:`call_${++callSequence}`,type:'function',function:{name:'learnloop_ask_profile_question',arguments:JSON.stringify(args)}}]},finish_reason:null}]}:{...base,choices:[{index:0,delta:{role:'assistant',content:'学习档案已生成，请在 LearnLoop 中审阅。'},finish_reason:null}]}
 const done={...base,choices:[{index:0,delta:{},finish_reason:asking?'tool_calls':'stop'}]}
 res.writeHead(200,{'content-type':'text/event-stream','cache-control':'no-cache'});res.write(`data: ${JSON.stringify(chunk)}\n\n`);res.write(`data: ${JSON.stringify(done)}\n\n`);res.end('data: [DONE]\n\n')})
server.listen(port,'127.0.0.1',()=>console.log(`learner-first mock listening ${port} (policy ${policy})`))
