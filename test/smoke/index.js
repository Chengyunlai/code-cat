const assert = require("node:assert/strict");
const http = require("node:http");
const vscode = require("vscode");
const { requestHttpModel } = require("../../dist/ai/modelClients");
const {
  modelProviderSecretName,
  normalizeModelBaseUrl,
} = require("../../dist/ai/modelProviderSecurity");

const TIMEOUT_MS = 30_000;

async function run() {
  const extension = vscode.extensions.getExtension("local.code-cat");
  assert.ok(extension, "Code Cat should be discoverable in the Extension Host");
  await extension.activate();
  assert.equal(extension.isActive, true, "Code Cat should activate successfully");

  const commands = new Set(await vscode.commands.getCommands(true));
  for (const command of [
    "codeCat.startGuidedDebug",
    "codeCat.askProject",
    "codeCat.configureModelProvider",
    "codeCat.testModelProvider",
    "codeCat.clearModelApiKey",
    "codeCat.explainPause",
    "codeCat.continue",
    "codeCat.stepInto",
    "codeCat.stepOver",
    "codeCat.__startSmokeDebug",
    "codeCat.__smokeState",
    "codeCat.__showSmokeView",
    "codeCat.__modelProviderStatus",
  ]) {
    assert.ok(commands.has(command), `${command} should be registered`);
  }

  await testHttpModelClients();
  await testProviderSpecificSettings();
  testModelProviderSecurity();

  await vscode.commands.executeCommand("workbench.view.extension.codeCat");
  await vscode.commands.executeCommand("codeCat.runtimeMap.focus");
  await waitForValue(
    () => vscode.commands.executeCommand("codeCat.__showSmokeView"),
    (shown) => shown === true,
    "the Runtime Map view to resolve",
  );

  const folder = vscode.workspace.workspaceFolders?.[0];
  assert.ok(folder, "The Python example workspace should be open");
  const checkoutUri = vscode.Uri.joinPath(folder.uri, "order_service", "checkout.py");
  const document = await vscode.workspace.openTextDocument(checkoutUri);
  const breakpointLine = document
    .getText()
    .split(/\r?\n/u)
    .findIndex((line) => line.includes("reservation = reserve_inventory"));
  assert.ok(breakpointLine >= 0, "The checkout example should contain the smoke breakpoint");

  const codeCatLocation = {
    path: checkoutUri.fsPath,
    line: breakpointLine + 1,
    column: 1,
  };
  const originalBreakpoints = sourceBreakpointsAt(checkoutUri, breakpointLine).map(
    cloneSourceBreakpoint,
  );
  const breakpointInitiallyPresent = originalBreakpoints.length > 0;
  let session;
  try {
    await vscode.commands.executeCommand("codeCat.toggleBreakpoint", codeCatLocation);
    assert.equal(
      hasBreakpoint(checkoutUri, breakpointLine),
      !breakpointInitiallyPresent,
      "Code Cat should toggle the linked source breakpoint",
    );
    await vscode.commands.executeCommand("codeCat.toggleBreakpoint", codeCatLocation);
    assert.equal(
      hasBreakpoint(checkoutUri, breakpointLine),
      breakpointInitiallyPresent,
      "Code Cat should toggle the linked source breakpoint back",
    );
    replaceSourceBreakpointsAt(checkoutUri, breakpointLine, []);
    await vscode.commands.executeCommand("codeCat.toggleBreakpoint", codeCatLocation);
    assert.equal(
      hasBreakpoint(checkoutUri, breakpointLine),
      true,
      "Code Cat should create the temporary smoke breakpoint",
    );

    const started = waitForEvent(
      vscode.debug.onDidStartDebugSession,
      (candidate) => candidate.type === "debugpy",
      "debugpy session to start",
    );
    const [, startedSession] = await Promise.all([
      withTimeout(
        vscode.commands.executeCommand("codeCat.__startSmokeDebug"),
        "Code Cat smoke debug command",
      ),
      started,
    ]);
    session = startedSession;

    const stackItem = await waitForEvent(
      vscode.debug.onDidChangeActiveStackItem,
      (candidate) => candidate && "frameId" in candidate,
      "debugpy to pause at the linked breakpoint",
      () => vscode.debug.activeStackItem,
    );
    assert.equal(stackItem.session.id, session.id);
    assert.equal(typeof stackItem.frameId, "number");

    await vscode.commands.executeCommand("codeCat.runtimeMap.focus");
    await waitForValue(
      () => vscode.commands.executeCommand("codeCat.__showSmokeView"),
      (shown) => shown === true,
      "the Runtime Map view to become visible after the debugger pauses",
    );

    const firstCodeCatState = await waitForValue(
      () => vscode.commands.executeCommand("codeCat.__smokeState"),
      (state) =>
        state?.debugSessionId === session.id &&
        state.debugStatus === "paused" &&
        state.pauseCount >= 1 &&
        state.lastPauseFrameCount > 0 &&
        state.lastPauseVariableCount > 0 &&
        state.callStackFrameCount > 0 &&
        state.runtimeMap?.resolved &&
        state.runtimeMap.visible &&
        state.runtimeMap.frameCount === state.lastPauseFrameCount &&
        state.runtimeMap.lastReceivedVersion === state.runtimeMap.stateVersion &&
        state.runtimeMap.scriptError === undefined,
      "Code Cat to publish its first debug snapshot",
    );
    assert.ok(firstCodeCatState.lastPauseFrameCount > 0, "Code Cat should capture DAP frames");

    const stepped = waitForEvent(
      vscode.debug.onDidChangeActiveStackItem,
      (candidate) => candidate && "frameId" in candidate && candidate.session.id === session.id,
      "Step Over to reach the next paused frame",
    );
    await Promise.all([
      vscode.commands.executeCommand("codeCat.stepOver"),
      vscode.commands.executeCommand("codeCat.stepOver"),
    ]);
    await stepped;
    await waitForValue(
      () => vscode.commands.executeCommand("codeCat.__smokeState"),
      (state) =>
        state?.pauseCount === firstCodeCatState.pauseCount + 1 &&
        state.debugStatus === "paused",
      "Code Cat to capture exactly one pause from duplicate Step Over requests",
    );
    await vscode.debug.stopDebugging(session);
    await waitForValue(
      () => vscode.commands.executeCommand("codeCat.__smokeState"),
      (state) =>
        state?.debugStatus === "ended" &&
        state.debugSessionId === undefined &&
        state.runtimeMap?.lastReceivedVersion === state.runtimeMap.stateVersion &&
        state.runtimeMap.scriptError === undefined,
      "Code Cat to mark the guided debug session as ended",
    );
    session = undefined;
    console.log(
      "Code Cat smoke passed: model adapters, activation, linked breakpoint, debug snapshots, both views, and duplicate-control suppression.",
    );
  } finally {
    if (session) {
      await vscode.debug.stopDebugging(session);
    }
    replaceSourceBreakpointsAt(checkoutUri, breakpointLine, originalBreakpoints);
  }
}

async function testHttpModelClients() {
  const requests = [];
  const server = http.createServer(async (request, response) => {
    const body = await readRequestBody(request);
    requests.push({ url: request.url, headers: request.headers, body: JSON.parse(body) });
    response.setHeader("content-type", "application/json");
    if (request.url === "/responses") {
      response.end(JSON.stringify({ output: [{ content: [{ text: "openai-ok" }] }] }));
    } else if (request.url === "/chat/completions") {
      response.end(JSON.stringify({ choices: [{ message: { content: "chat-ok" } }] }));
    } else if (request.url === "/messages") {
      response.end(JSON.stringify({ content: [{ type: "text", text: "anthropic-ok" }] }));
    } else if (request.url === "/models/gemini-test:generateContent") {
      response.end(
        JSON.stringify({ candidates: [{ content: { parts: [{ text: "gemini-ok" }] } }] }),
      );
    } else if (request.url === "/redirect/chat/completions") {
      response.statusCode = 307;
      response.setHeader("location", "/chat/completions");
      response.end();
    } else if (request.url === "/slow/chat/completions") {
      setTimeout(() => {
        if (!response.destroyed) {
          response.end(JSON.stringify({ choices: [{ message: { content: "late" } }] }));
        }
      }, 200);
    } else {
      response.statusCode = 404;
      response.end(JSON.stringify({ error: { message: "unexpected smoke path" } }));
    }
  });
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const address = server.address();
  assert.ok(address && typeof address === "object");
  const baseUrl = `http://127.0.0.1:${address.port}`;
  const cancellation = new vscode.CancellationTokenSource();
  try {
    const common = { baseUrl, model: "smoke-model", apiKey: "smoke-secret", prompt: "ping" };
    assert.equal(
      await requestHttpModel({ ...common, transport: "openai-responses" }, cancellation.token),
      "openai-ok",
    );
    assert.equal(
      await requestHttpModel({ ...common, transport: "openai-chat" }, cancellation.token),
      "chat-ok",
    );
    assert.equal(
      await requestHttpModel({ ...common, transport: "anthropic" }, cancellation.token),
      "anthropic-ok",
    );
    assert.equal(
      await requestHttpModel(
        { ...common, transport: "gemini", model: "gemini-test" },
        cancellation.token,
      ),
      "gemini-ok",
    );
    assert.equal(requests.length, 4);
    assert.equal(requests[0].headers.authorization, "Bearer smoke-secret");
    assert.equal(requests[0].body.store, false);
    assert.equal(requests[1].body.messages[0].content, "ping");
    assert.equal(requests[2].headers["x-api-key"], "smoke-secret");
    assert.equal(requests[2].headers["anthropic-version"], "2023-06-01");
    assert.equal(requests[3].headers["x-goog-api-key"], "smoke-secret");
    assert.equal(requests[3].body.contents[0].parts[0].text, "ping");

    await assert.rejects(
      requestHttpModel(
        { ...common, baseUrl: `${baseUrl}/redirect`, transport: "openai-chat" },
        cancellation.token,
      ),
    );
    assert.deepEqual(
      requests.slice(4).map((request) => request.url),
      ["/redirect/chat/completions"],
      "redirects must not receive a second request carrying the authorization header",
    );

    await assert.rejects(
      requestHttpModel(
        {
          ...common,
          baseUrl: `${baseUrl}/slow`,
          transport: "openai-chat",
          timeoutMs: 10,
        },
        cancellation.token,
      ),
      /timed out/u,
    );

    const cancelled = new vscode.CancellationTokenSource();
    try {
      const pending = requestHttpModel(
        { ...common, baseUrl: `${baseUrl}/slow`, transport: "openai-chat" },
        cancelled.token,
      );
      setTimeout(() => cancelled.cancel(), 10);
      await assert.rejects(
        pending,
        (error) => error instanceof vscode.CancellationError,
      );
    } finally {
      cancelled.dispose();
    }
  } finally {
    cancellation.dispose();
    await new Promise((resolve) => server.close(resolve));
  }
}

async function testProviderSpecificSettings() {
  const configuration = vscode.workspace.getConfiguration("codeCat.ai");
  const previousProvider = configuration.inspect("provider")?.globalValue;
  const previousModels = configuration.inspect("models")?.globalValue;
  const previousBaseUrls = configuration.inspect("baseUrls")?.globalValue;
  try {
    await configuration.update(
      "models",
      { openai: "openai-smoke", anthropic: "anthropic-smoke" },
      vscode.ConfigurationTarget.Global,
    );
    await configuration.update(
      "baseUrls",
      { newapi: "https://newapi.example.com/v1" },
      vscode.ConfigurationTarget.Global,
    );
    await configuration.update("provider", "openai", vscode.ConfigurationTarget.Global);
    assert.deepEqual(
      await vscode.commands.executeCommand("codeCat.__modelProviderStatus"),
      { id: "openai", label: "OpenAI", detail: "openai-smoke" },
    );
    await configuration.update("provider", "anthropic", vscode.ConfigurationTarget.Global);
    assert.deepEqual(
      await vscode.commands.executeCommand("codeCat.__modelProviderStatus"),
      { id: "anthropic", label: "Anthropic Claude", detail: "anthropic-smoke" },
    );
  } finally {
    await configuration.update("provider", previousProvider, vscode.ConfigurationTarget.Global);
    await configuration.update("models", previousModels, vscode.ConfigurationTarget.Global);
    await configuration.update("baseUrls", previousBaseUrls, vscode.ConfigurationTarget.Global);
  }
}

function testModelProviderSecurity() {
  assert.equal(
    normalizeModelBaseUrl("https://newapi.example.com/v1/"),
    "https://newapi.example.com/v1",
  );
  assert.throws(
    () => normalizeModelBaseUrl("https://newapi.example.com/v1/chat/completions"),
    /API 根地址/u,
  );
  assert.throws(() => normalizeModelBaseUrl("http://newapi.example.com/v1"), /HTTPS/u);
  assert.equal(
    modelProviderSecretName("newapi", "https://newapi.example.com/v1/"),
    modelProviderSecretName("newapi", "https://newapi.example.com/v1"),
  );
  assert.notEqual(
    modelProviderSecretName("newapi", "https://first.example.com/v1"),
    modelProviderSecretName("newapi", "https://second.example.com/v1"),
    "different API roots must not share a SecretStorage key",
  );
}

function readRequestBody(request) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    request.on("data", (chunk) => chunks.push(chunk));
    request.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    request.on("error", reject);
  });
}

function withTimeout(promise, description) {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(
      () => reject(new Error(`Timed out waiting for ${description}`)),
      TIMEOUT_MS,
    );
    promise.then(
      (value) => {
        clearTimeout(timeout);
        resolve(value);
      },
      (error) => {
        clearTimeout(timeout);
        reject(error);
      },
    );
  });
}

function hasBreakpoint(uri, zeroBasedLine) {
  return sourceBreakpointsAt(uri, zeroBasedLine).length > 0;
}

function sourceBreakpointsAt(uri, zeroBasedLine) {
  return vscode.debug.breakpoints.filter(
    (breakpoint) =>
      breakpoint instanceof vscode.SourceBreakpoint &&
      breakpoint.location.uri.fsPath === uri.fsPath &&
      breakpoint.location.range.start.line === zeroBasedLine,
  );
}

function cloneSourceBreakpoint(breakpoint) {
  return new vscode.SourceBreakpoint(
    breakpoint.location,
    breakpoint.enabled,
    breakpoint.condition,
    breakpoint.hitCondition,
    breakpoint.logMessage,
  );
}

function replaceSourceBreakpointsAt(uri, zeroBasedLine, replacements) {
  const current = sourceBreakpointsAt(uri, zeroBasedLine);
  if (current.length > 0) {
    vscode.debug.removeBreakpoints(current);
  }
  if (replacements.length > 0) {
    vscode.debug.addBreakpoints(replacements);
  }
}

async function waitForValue(producer, predicate, description) {
  const deadline = Date.now() + TIMEOUT_MS;
  let lastValue;
  while (Date.now() < deadline) {
    const value = await producer();
    lastValue = value;
    if (predicate(value)) {
      return value;
    }
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error(
    `Timed out waiting for ${description}; last value: ${JSON.stringify(lastValue)}`,
  );
}

function waitForEvent(event, predicate, description, currentValue) {
  const current = currentValue?.();
  if (current && predicate(current)) {
    return Promise.resolve(current);
  }
  return new Promise((resolve, reject) => {
    let subscription;
    const timeout = setTimeout(() => {
      subscription?.dispose();
      reject(new Error(`Timed out waiting for ${description}`));
    }, TIMEOUT_MS);
    subscription = event((value) => {
      if (!predicate(value)) {
        return;
      }
      clearTimeout(timeout);
      subscription.dispose();
      resolve(value);
    });
  });
}

module.exports = { run };
