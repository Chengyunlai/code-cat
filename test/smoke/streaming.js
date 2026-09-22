const assert = require('node:assert/strict');
const http = require('node:http');
const vscode = require('vscode');
const { requestHttpModel } = require('../../dist/ai/modelClients');
const { partialAnswer } = require('../../dist/ai/streamingText');

exports.run = async () => {
  const expected = JSON.stringify({ message: '## 先理解入口\n\n库存为 `8`。\n\n```ts\nreturn false;\n```' });
  for (let i = 0; i <= expected.length; i++) {
    const text = partialAnswer(expected.slice(0, i));
    assert.ok(JSON.parse(expected).message.startsWith(text), 'partial JSON never leaks envelopes or escapes');
  }
  assert.equal(partialAnswer('{"message":"\\u4f60\\u597d"}'), '你好');
  const server = http.createServer(async (req, res) => {
    let raw = ''; for await (const chunk of req) raw += chunk;
    const body = JSON.parse(raw);
    const transport = req.url.split('/')[1];
    if (transport !== 'gemini') assert.equal(body.stream, true);
    res.writeHead(200, { 'Content-Type': 'text/event-stream' });
    const send = value => res.write(`data: ${typeof value === 'string' ? value : JSON.stringify(value)}\r\n\r\n`);
    if (transport === 'anthropic') send({type: 'message_start', message: {usage: {input_tokens: 7}}});
    for (const delta of [expected.slice(0, 20), expected.slice(20)]) {
      let value;
      if (transport === 'anthropic') value = {type:'content_block_delta', delta:{type:'text_delta', text:delta}};
      else if (transport === 'openai-responses') value = {type:'response.output_text.delta', delta};
      else if (transport === 'gemini') value = {candidates:[{content:{parts:[{text:delta}]}}]};
      else value = {choices:[{delta:{content:delta}}]};
      // Deliberately split inside JSON and multibyte UTF-8 rather than on event boundaries.
      const buffer = Buffer.from(`data: ${JSON.stringify(value)}\r\n\r\n`);
      for (let i=0; i<buffer.length; i+=7) res.write(buffer.subarray(i,i+7));
      await new Promise(resolve => setTimeout(resolve, 25));
    }
    if (req.url.includes('disconnect')) { res.end(); return; }
    if (transport === 'anthropic') { send({type:'message_delta',usage:{output_tokens:3}}); send({type:'message_stop'}); }
    else if (transport === 'openai-responses') send({type:'response.completed',response:{usage:{input_tokens:7,output_tokens:3,total_tokens:10}}});
    else if (transport === 'gemini') send({candidates:[{finishReason:'STOP'}],usageMetadata:{promptTokenCount:7,candidatesTokenCount:3,totalTokenCount:10}});
    else { send({choices:[],usage:{prompt_tokens:7,completion_tokens:3,total_tokens:10}}); send('[DONE]'); }
    res.end();
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  try {
    for (const transport of ['openai-chat','openai-responses','anthropic','gemini']) {
      const cancellation = new vscode.CancellationTokenSource();
      const partials = [];
      const request = {transport,baseUrl:`http://127.0.0.1:${server.address().port}/${transport}`,model:'test',apiKey:'test',prompt:'teach'};
      const response = await requestHttpModel(request,cancellation.token,text => partials.push(text));
      assert.equal(response.text, expected);
      assert.equal(response.usage.totalTokens,10);
      assert.equal(partials.length,2);
      assert.ok(partials[0].length < expected.length, 'text arrives before completion');
      cancellation.dispose();
    }
    const request = {transport:'openai-chat',baseUrl:`http://127.0.0.1:${server.address().port}/openai-chat/disconnect`,model:'test',apiKey:'test',prompt:'teach'};
    const cancellation = new vscode.CancellationTokenSource();
    await assert.rejects(requestHttpModel(request,cancellation.token,()=>{}), /中断/);
    await assert.rejects(requestHttpModel({...request,baseUrl:request.baseUrl.replace('/disconnect','')},cancellation.token,()=>cancellation.cancel()), error => error instanceof vscode.CancellationError);
    cancellation.dispose();
    console.log('Streaming adapters passed: four protocols, split UTF-8/SSE, partial JSON, usage, disconnect and cancellation.');
  } finally { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); }
};
