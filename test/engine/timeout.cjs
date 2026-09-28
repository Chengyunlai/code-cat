const assert = require('node:assert/strict');
const net = require('node:net');
const { CancellationError, cancellationToken, requestHttpModel } = require('../../packages/core/dist');

const REQUEST = { transport: 'openai-chat', model: 'stub-model', apiKey: 'test-key', prompt: 'ping' };

/**
 * 只回响应头、不回响应体的服务器：模拟「服务端接了请求、头部先到、正文一直不来」。
 * 这正是把插件卡在「正在思考」的那种响应。刻意用裸 TCP 而不是 http.Server，
 * 以便确认问题不在 Node 的 HTTP 服务端实现上。
 */
function startStallServer(head) {
  return new Promise((resolve) => {
    const sockets = new Set();
    const server = net.createServer((socket) => {
      sockets.add(socket);
      socket.on('error', () => {});
      socket.on('close', () => sockets.delete(socket));
      socket.once('data', () => socket.write(head));
    });
    server.listen(0, '127.0.0.1', () => {
      resolve({
        baseUrl: `http://127.0.0.1:${server.address().port}/v1`,
        close: () => new Promise((done) => {
          for (const socket of sockets) socket.destroy();
          server.close(() => done());
        }),
      });
    });
  });
}

/** 记录收到几次请求的服务器：用来确认重定向目标没有被真的访问到。 */
function startCountingServer() {
  const hits = [];
  return new Promise((resolve) => {
    const server = net.createServer((socket) => {
      socket.on('error', () => {});
      socket.once('data', () => {
        hits.push(1);
        socket.end('HTTP/1.1 200 OK\r\nContent-Type: application/json\r\nContent-Length: 2\r\n\r\n{}');
      });
    });
    server.listen(0, '127.0.0.1', () => {
      resolve({
        hits,
        close: () => new Promise((done) => server.close(() => done())),
      });
    });
  });
}

/** 回一个 302 的服务器：用来确认 Base URL 写错时不会被静默跟随。 */
function startRedirectServer(location) {
  return new Promise((resolve) => {
    const server = net.createServer((socket) => {
      socket.on('error', () => {});
      socket.once('data', () => {
        socket.end(`HTTP/1.1 302 Found\r\nLocation: ${location}\r\nContent-Length: 0\r\n\r\n`);
      });
    });
    server.listen(0, '127.0.0.1', () => {
      resolve({
        baseUrl: `http://127.0.0.1:${server.address().port}/v1`,
        close: () => new Promise((done) => server.close(() => done())),
      });
    });
  });
}

/**
 * 看门狗：请求本应在预算内 settle。真挂住了就抛出带 WATCHDOG 前缀的错误，
 * 让测试以「明确失败」结束，而不是把整个测试套件一起拖住。
 */
async function withinBudget(work, budgetMs) {
  let timer;
  const watchdog = new Promise((_resolve, reject) => {
    timer = setTimeout(
      () => reject(new Error(`WATCHDOG: 请求在 ${budgetMs} ms 内没有 settle，又退回了「永久悬挂」`)),
      budgetMs,
    );
  });
  try {
    return await Promise.race([work, watchdog]);
  } finally {
    clearTimeout(timer);
  }
}

async function expectRejection(label, work, budgetMs) {
  const started = Date.now();
  let error;
  try {
    await withinBudget(work, budgetMs);
  } catch (caught) {
    error = caught;
  }
  const elapsed = Date.now() - started;
  assert.ok(error, `${label}：请求本应失败，却成功返回了`);
  assert.ok(!/^WATCHDOG/u.test(error.message), `${label}：${error.message}`);
  return { error, elapsed };
}

(async () => {
  // 阈值来自实测：redirect 为 error 时，超时小于约 8192 ms 还能生效，超过就永久悬挂。
  // 这里取 12000 ms，确保「退回旧实现」一定会被抓到，而不是靠边界运气。
  const TIMEOUT_MS = 12000;

  const json = await startStallServer(
    'HTTP/1.1 200 OK\r\nContent-Type: application/json\r\nContent-Length: 64\r\n\r\n',
  );
  try {
    const { error, elapsed } = await expectRejection(
      '非流式：正文一直不来',
      requestHttpModel({ ...REQUEST, baseUrl: json.baseUrl, timeoutMs: TIMEOUT_MS }, cancellationToken(new AbortController().signal)),
      TIMEOUT_MS + 8000,
    );
    assert.match(error.message, /timed out after 12000 ms/u);
    assert.ok(elapsed >= TIMEOUT_MS, `超时应等到 ${TIMEOUT_MS} ms，实测 ${elapsed} ms`);
  } finally {
    await json.close();
  }

  const sse = await startStallServer(
    'HTTP/1.1 200 OK\r\nContent-Type: text/event-stream\r\nTransfer-Encoding: chunked\r\n\r\n',
  );
  try {
    const { error, elapsed } = await expectRejection(
      '流式：SSE 只来头部、不来片段',
      requestHttpModel(
        { ...REQUEST, baseUrl: sse.baseUrl, timeoutMs: TIMEOUT_MS },
        cancellationToken(new AbortController().signal),
        () => {},
      ),
      TIMEOUT_MS + 8000,
    );
    assert.match(error.message, /timed out after 12000 ms/u);
    assert.ok(elapsed >= TIMEOUT_MS, `超时应等到 ${TIMEOUT_MS} ms，实测 ${elapsed} ms`);
  } finally {
    await sse.close();
  }

  // 取消同样不能只靠 abort()：正文挂住时点「停止回答」，Promise 也必须立刻 settle。
  const cancel = await startStallServer(
    'HTTP/1.1 200 OK\r\nContent-Type: application/json\r\nContent-Length: 64\r\n\r\n',
  );
  try {
    const controller = new AbortController();
    const pending = requestHttpModel(
      { ...REQUEST, baseUrl: cancel.baseUrl, timeoutMs: 60000 },
      cancellationToken(controller.signal),
    );
    setTimeout(() => controller.abort(), 300);
    const { error, elapsed } = await expectRejection('取消：正文一直不来时停止回答', pending, 5000);
    assert.ok(error instanceof CancellationError, `取消应抛出 CancellationError，实际是 ${error.name}`);
    assert.equal(error.name, 'Canceled');
    assert.ok(elapsed < 3000, `取消应立即生效，实测 ${elapsed} ms`);
  } finally {
    await cancel.close();
  }

  // 不跟随重定向，也不把凭据转发到别处。
  const target = await startCountingServer();
  const redirect = await startRedirectServer(`${target.baseUrl}/chat/completions`);
  try {
    const { error, elapsed } = await expectRejection(
      '重定向：Base URL 指向了别的地址',
      requestHttpModel({ ...REQUEST, baseUrl: redirect.baseUrl, timeoutMs: TIMEOUT_MS }, cancellationToken(new AbortController().signal)),
      5000,
    );
    assert.match(error.message, /redirected the request \(302\)/u);
    assert.equal(target.hits.length, 0, '重定向目标不应收到任何请求，凭据不能被转发');
    assert.ok(elapsed < 3000, `重定向应立即拒绝，实测 ${elapsed} ms`);
  } finally {
    await redirect.close();
    await target.close();
  }

  console.log(
    'Timeout passed: 正文挂住的非流式与流式请求都按超时失败（12000 ms，覆盖旧实现永久悬挂的区间），'
    + '取消在挂住时也能立即 settle，302 被拒绝且凭据未转发到重定向目标。',
  );
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
