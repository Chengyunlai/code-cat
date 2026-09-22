import * as fs from "node:fs/promises";
import * as path from "node:path";
import { createInterface } from "node:readline";
import { randomUUID } from "node:crypto";
import { AiTutor, SessionStore, cancellationToken, requestHttpModel, normalizeModelBaseUrl,
  normalizeRuntimeVariables, type HttpModelTransport, type DebugPause, type Storage } from "../../core/dist";
import { FileProject } from "./project";

async function main(): Promise<void> {
  const root = await fs.realpath(process.argv[2] ?? ".");
  const stateFile = process.argv[3];
  let persisted: Record<string,unknown> = {};
  if (stateFile) { try { persisted = JSON.parse(await fs.readFile(stateFile,"utf8")); } catch { /* New host state. */ } }
  const storage: Storage = {
    get: <T>(key:string) => persisted[key] as T | undefined,
    update: async (key,value) => {
      persisted[key]=value;
      if (stateFile) {
        await fs.mkdir(path.dirname(stateFile),{recursive:true});
        await fs.writeFile(stateFile+".tmp",JSON.stringify(persisted),{mode:0o600});
        await fs.rename(stateFile+".tmp",stateFile);
      }
    },
  };
  const project = new FileProject(root);
  const store = new SessionStore(storage);
  let config: {transport:HttpModelTransport; baseUrl:string; model:string; apiKey:string} | undefined;
  let active: AbortController | undefined;
  const send = (value:unknown): void => { process.stdout.write(JSON.stringify(value)+"\n"); };
  const host = (action:string, params:unknown = {}): void => send({method:"host",params:{action,...params as object}});
  let version=0;
  let breakpoints: {path:string;line:number;managed:boolean}[]=[];
  const view = (): void => {
    const state=store.snapshot();
    const selected=store.selectedPause();
    const frame=selected?.frames.find(item=>item.id===state.selectedFrameId) ?? selected?.frames[0];
    const fileLabel=(file:string)=>path.relative(root,file);
    send({method:"view",params:{type:"state",version:++version,state:{...state,
      workspaceOpen:true, requestPending:Boolean(state.requestKind), debugging:Boolean(state.debugSessionId),
      modelProvider:{label:config?.model ?? "配置模型"},
      livePauseId:state.debugStatus==="paused" ? state.pauses.at(-1)?.id : undefined,
      route:state.route ? {...state.route,totalNodeCount:state.route.nodes.length,
        canRevealMore:state.revealedRouteNodeCount<state.route.nodes.length,
        nodes:state.route.nodes.slice(0,state.revealedRouteNodeCount).map(node=>{
          const bp=breakpoints.find(item=>item.path===node.location.path&&item.line===node.location.line);
          return {...node,fileLabel:fileLabel(node.location.path),breakpoint:Boolean(bp),breakpointState:bp?(bp.managed?"managed":"external"):"none"};
        })}:undefined,
      chatMessages:state.chatMessages.map(message=>{
        const target=store.routeForMessage(message.id)?.nodes[0];
        return {...message,debugTarget:target?{title:target.title,fileLabel:fileLabel(target.location.path),line:target.location.line}:undefined};
      }),
      pauses:state.pauses.map(pause=>({...pause,frameCount:pause.frames.length,variableCount:pause.variables.length,label:pause.frames[0]?.name ?? "暂停",selected:pause.id===selected?.id,
        frames:pause.frames.map(item=>({...item,fileLabel:item.location?fileLabel(item.location.path)+":"+item.location.line:item.name}))})),
      frames:selected?.frames.map(item=>({...item,displayName:item.name,fileLabel:item.location?fileLabel(item.location.path)+":"+item.location.line:item.name,selected:item.id===frame?.id})) ?? [],
      variables:selected?.variables ?? [], debugEvidenceVisible:Boolean(selected),
    }}});
  };
  store.onDidChange(view);
  const tutor = new AiTutor(project,{request:async(prompt,token,_kind,onText)=>{
    if (!config) throw new Error("请先在“更多”中配置模型。");
    return (await requestHttpModel({...config,prompt},token,onText)).text;
  }});
  async function ask(question:string): Promise<void> {
    const previous=store.beginQuestion(question);
    if (!previous) return;
    const pause=store.selectedPause();
    const controller=new AbortController(); active=controller;
    const token=cancellationToken(controller.signal);
    let last=0;
    const stream=(text:string)=>{ if (!controller.signal.aborted && Date.now()-last>70) {last=Date.now();store.streamAnswer(text,pause?.id);} };
    try {
      const operation=pause?tutor.answerPauseQuestion(question,previous,pause,token,stream):tutor.answerQuestion(question,previous,token,stream);
      const answer=await Promise.race([operation,new Promise<never>((_,reject)=>controller.signal.addEventListener("abort",()=>reject(new Error("回答已停止，可以继续提问。")),{once:true}))]);
      if (controller.signal.aborted) return;
      if (typeof answer==="string") store.completeQuestionWithAnswer(answer,pause);
      else if (answer.kind==="chat") store.completeQuestionWithAnswer(answer.answer);
      else store.completeQuestionWithRoute(answer.route);
    } catch(error) {
      store.completeQuestionWithTutorMessage({id:randomUUID(),kind:"error",text:error instanceof Error?error.message:"回答失败，请重试。"});
    } finally { if(active===controller)active=undefined; }
  }
  async function open(location: {path:string;line:number}|undefined, action="openSource"): Promise<void> {
    if(!location || !await project.validateAbsolute(location.path)) throw new Error("源码不在当前项目或已不存在。");
    const document=await project.readSourceFile(location.path);
    if(!Number.isSafeInteger(location.line)||location.line<1||location.line>document.lineCount)throw new Error("源码行号已失效。");
    host(action,{location});
  }
  async function dispatch(message: any): Promise<void> {
    switch(message.method ?? message.type) {
      case "configure": {
        const value=message.params;
        if(!["openai-chat","openai-responses","anthropic","gemini"].includes(value?.transport)||typeof value.model!=="string"||typeof value.apiKey!=="string")throw new Error("模型配置不完整");
        config={transport:value.transport,model:value.model,apiKey:value.apiKey,baseUrl:normalizeModelBaseUrl(value.baseUrl)};view();return;
      }
      case "ready":view();return;
      case "breakpoints":breakpoints=Array.isArray(message.params)?message.params.slice(0,1000):[];view();return;
      case "askQuestion":if(typeof message.question==="string"&&message.question.length<=20000)await ask(message.question);return;
      case "cancelQuestion":active?.abort();return;
      case "observe": {
        const input=message.params;
        if(!input || typeof input.sessionId!=="string" || !Array.isArray(input.frames))throw new Error("无效暂停证据");
        const frames=input.frames.slice(0,30);
        const first=frames[0]?.location;
        let source:string|undefined;
        if(first && await project.validateAbsolute(first.path)) {
          const doc=await project.readSourceFile(first.path);const start=Math.max(0,first.line-7);const lines=[];
          for(let i=start;i<Math.min(doc.lineCount,start+13);i++)lines.push(`${i+1===first.line?">":" "} ${i+1}: ${doc.lineAt(i).text}`);
          source=lines.join("\n");
        }
        store.beginDebugSession(input.sessionId);
        const pause:DebugPause={id:randomUUID(),sessionId:input.sessionId,recordedAt:new Date().toISOString(),reason:"paused",threadId:1,frames,
          variables:normalizeRuntimeVariables(input.variables,30),source,captureNote:input.captureNote};
        store.recordPause(pause);return;
      }
      case "started":store.beginDebugSession(message.sessionId);return;
      case "running":store.markDebugSessionRunning(message.sessionId);return;
      case "ended": {
        const state=store.snapshot();
        const missed=state.debugSessionId===message.sessionId&&state.pauses.length===0;
        store.endDebugSession(message.sessionId);
        if(missed)store.setTutorMessage({id:randomUUID(),kind:"system",text:"调试已结束，但没有捕获到暂停。请确认运行入口会经过目标断点，并检查 TS 的 source map 或加载器配置。"});
        return;
      }
      case "selectPause":store.selectPause(message.pauseId);return;
      case "selectFrame": {const pause=store.selectedPause();const frame=pause?.frames.find(item=>item.id===message.frameId);if(pause)store.selectPause(pause.id,message.frameId);await open(frame?.location);return;}
      case "selectRouteNode":await open(store.snapshot().route?.nodes.find(item=>item.id===message.nodeId)?.location);return;
      case "openMessageSource":await open(store.routeForMessage(message.messageId)?.nodes[0]?.location);return;
      case "openSourceReference": {const match=/^(.+):(\d+)$/u.exec(message.reference??"");if(!match)return;const file=await project.resolveFile(match[1]!);if(file)await open({path:file,line:Number(match[2])});return;}
      case "debugFromMessage": {
        if(active)return;
        const route=store.routeForMessage(message.messageId);if(!route)return;
        if(!store.snapshot().debugSessionId)store.restoreReadingRoute(route);
        await open(route.nodes[0]?.location,"startDebug");return;
      }
      case "startDebug":if(!active)await open(store.snapshot().route?.nodes[0]?.location,"startDebug");return;
      case "toggleBreakpoint":await open(store.snapshot().route?.nodes.find(item=>item.id===message.nodeId)?.location,"breakpoint");return;
      case "debugCommand": {
        const state=store.snapshot();const pause=store.selectedPause();
        if(!active&&state.debugStatus==="paused"&&pause?.id===state.pauses.at(-1)?.id&&["continue","stepInto","stepOver"].includes(message.command))host("debugCommand",{command:message.command,sessionId:state.debugSessionId});return;
      }
      case "explain":await ask(message.question || "解释这次暂停，以及下一步如何验证。");return;
      case "revealNextRouteNode":store.revealNextRouteNode();return;
      case "configureModel":host("configureModel");return;
      case "copyCode":if(typeof message.code==="string"&&message.code.length<=20000)host("copyCode",{code:message.code});return;
      case "showConversationHistory":host("history",{conversations:store.conversationSummaries()});return;
      case "switchConversation":if(!active)store.switchConversation(message.id);return;
      case "newConversation":if(!active)store.clear();return;
      case "renderedState":case "scriptError":return;
      default:throw new Error("Unsupported host request");
    }
  }
  let evidenceQueue=Promise.resolve();
  const input=createInterface({input:process.stdin,crlfDelay:Infinity});
  input.on("line",line=>{
    if(line.length>1_000_000){send({method:"error",params:{message:"Request too large"}});return;}
    const run=async()=>{try {await dispatch(JSON.parse(line));}catch(error){send({method:"error",params:{message:error instanceof Error?error.message:"Invalid request"}});}};
    try {
      const method=JSON.parse(line).method;
      if (["started","observe","running","ended"].includes(method)) evidenceQueue=evidenceQueue.then(run);
      else void run();
    } catch { void run(); }
  });
  input.on("close",()=>{active?.abort();void evidenceQueue.then(()=>store.whenPersisted()).finally(()=>process.exit(0));});
  send({method:"hello",params:{protocolVersion:1}});view();
}
void main().catch(()=>{process.stderr.write("Code Cat engine could not start. Check project and storage paths.\n");process.exitCode=1;});
