const assert=require('node:assert/strict');
const {spawn}=require('node:child_process');
const {createInterface}=require('node:readline');
const fs=require('node:fs/promises');
const os=require('node:os');
const path=require('node:path');
const http=require('node:http');
(async()=>{
 const temp=await fs.mkdtemp(path.join(os.tmpdir(),'codecat-engine-'));
 const source=path.join(temp,'stock.ts');await fs.writeFile(source,'const stock = 8;\nconsole.log(stock);\n');
 const server=http.createServer(async(req,res)=>{
  let raw='';for await(const c of req)raw+=c;const request=JSON.parse(raw);assert.equal(request.stream,true);
  res.writeHead(200,{'Content-Type':'text/event-stream'});
  const text=JSON.stringify({kind:'project_chat',message:'## 观察库存\n\n当前源码声明了 `stock`，运行时值需要断点证据。'});
  for(const part of [text.slice(0,45),text.slice(45)]){res.write('data: '+JSON.stringify({choices:[{delta:{content:part}}]})+'\n\n');await new Promise(r=>setTimeout(r,120));}
  res.end('data: [DONE]\n\n');
 });
 await new Promise(r=>server.listen(0,'127.0.0.1',r));
 const child=spawn(process.execPath,['packages/engine/dist/main.js',temp,path.join(temp,'state.json')],{stdio:['pipe','pipe','inherit']});
 const events=[];const lines=createInterface({input:child.stdout});lines.on('line',line=>events.push(JSON.parse(line)));
 const send=value=>child.stdin.write(JSON.stringify(value)+'\n');
 async function until(predicate){const deadline=Date.now()+7000;while(Date.now()<deadline){const found=events.find(predicate);if(found)return found;await new Promise(r=>setTimeout(r,20));}throw new Error('Timed out: '+JSON.stringify(events.slice(-2)));}
 try {
  await until(e=>e.method==='hello');send({method:'configure',params:{transport:'openai-chat',model:'test',apiKey:'test-secret',baseUrl:`http://127.0.0.1:${server.address().port}/v1`}});
  send({type:'askQuestion',question:'这个 TypeScript 项目的库存代码如何理解？'});
  await until(e=>e.method==='view'&&e.params.state.streamingAnswer?.text);
  await until(e=>e.method==='view'&&!e.params.state.requestPending&&e.params.state.chatMessages.some(m=>m.role==='assistant'));
  send({method:'started',sessionId:'missed-entry'});
  send({method:'ended',sessionId:'missed-entry'});
  await until(e=>e.method==='view'&&e.params.state.tutorMessage?.text?.includes('没有捕获到暂停'));
  send({method:'observe',params:{sessionId:'fixture',frames:[{id:1,name:'test fixture',location:{path:source,line:2,column:1}}],variables:[{name:'stock',value:'8'}],captureNote:'Protocol fixture, not a real IDE pause.'}});
  await until(e=>e.method==='view'&&e.params.state.pauses.length===1);
  send({type:'debugCommand',command:'stepOver'});await until(e=>e.method==='host'&&e.params.command==='stepOver');
  send({method:'running',sessionId:'fixture'});await until(e=>e.method==='view'&&e.params.state.debugStatus==='running');
  const hostCount=events.filter(e=>e.method==='host').length;send({type:'debugCommand',command:'stepOver'});
  send({type:'openSourceReference',reference:'../outside.ts:1'});send({type:'unknown'});await until(e=>e.method==='error');assert.equal(events.filter(e=>e.method==='host').length,hostCount);
  send({type:'askQuestion',question:'继续解释库存代码'});await until(e=>e.method==='view'&&e.params.state.requestPending&&e.params.state.chatMessages.length>=3);send({type:'cancelQuestion'});
  await until(e=>e.method==='view'&&e.params.state.tutorMessage?.text?.includes('停止'));
  child.stdin.end();await new Promise(r=>child.once('exit',r));
  const saved=await fs.readFile(path.join(temp,'state.json'),'utf8');assert.ok(!saved.includes('test-secret'));
  console.log('Engine passed: streaming, pause projection, live-only controls, traversal rejection, cancellation and persistence without credentials.');
 }finally{child.kill();server.closeAllConnections();server.close();await fs.rm(temp,{recursive:true,force:true});}
})().catch(error=>{console.error(error);process.exitCode=1;});
