const assert = require("node:assert/strict");
const http = require("node:http");
const vscode = require("vscode");
const { AiTutor } = require("../../dist/ai/aiTutor");
const { requestHttpModel } = require("../../dist/ai/modelClients");
const { TokenUsageTracker } = require("../../dist/ai/tokenUsageTracker");
const {
  modelProviderSecretName,
  normalizeModelBaseUrl,
} = require("../../dist/ai/modelProviderSecurity");
const { SessionStore } = require("../../dist/core/sessionStore");
const { normalizeRuntimeVariables } = require("../../dist/debug/runtimeEvidence");
const { PythonProjectIndex } = require("../../dist/project/pythonProjectIndex");

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
    "codeCat.resetProjectTokenUsage",
    "codeCat.explainPause",
    "codeCat.continue",
    "codeCat.stepInto",
    "codeCat.stepOver",
    "codeCat.__startSmokeDebug",
    "codeCat.__smokeState",
    "codeCat.__showSmokeView",
    "codeCat.__runComposerSmoke",
    "codeCat.__modelProviderStatus",
    "codeCat.__seedChat",
    "codeCat.__seedTutorError",
    "codeCat.__seedStructuredPause",
    "codeCat.__seedPauseTutorError",
    "codeCat.__seedRouteGuidance",
    "codeCat.__seedUsage",
  ]) {
    assert.ok(commands.has(command), `${command} should be registered`);
  }

  await testHttpModelClients();
  await testTokenUsageTracking();
  await testRoutePreflight();
  testRuntimeEvidenceConstraints();
  testConversationState();
  await testProviderSpecificSettings();
  testModelProviderSecurity();

  await vscode.commands.executeCommand("workbench.view.extension.codeCat");
  await vscode.commands.executeCommand("codeCat.runtimeMap.focus");
  await waitForValue(
    () => vscode.commands.executeCommand("codeCat.__showSmokeView"),
    (shown) => shown === true,
    "the Runtime Map view to resolve",
  );
  await vscode.commands.executeCommand("codeCat.__runComposerSmoke");
  const composerKeyboardState = await waitForValue(
    () => vscode.commands.executeCommand("codeCat.__smokeState"),
    (state) => state?.runtimeMap?.composerSmokeResultCount === 1,
    "the Runtime Map to exercise its composer keyboard behavior",
  );
  assert.equal(
    composerKeyboardState.runtimeMap.composerEnterDefaultPrevented,
    true,
    "Enter must submit instead of inserting a line break",
  );
  assert.equal(
    composerKeyboardState.runtimeMap.composerShiftEnterDefaultPrevented,
    false,
    "Shift+Enter must preserve the textarea line break",
  );
  assert.match(
    composerKeyboardState.runtimeMap.renderedComposerShortcutText,
    /Enter.*发送.*Shift.*Enter.*换行/u,
  );
  await vscode.commands.executeCommand("codeCat.__seedUsage");
  const renderedUsageState = await waitForValue(
    () => vscode.commands.executeCommand("codeCat.__smokeState"),
    (state) =>
      state?.runtimeMap?.renderedUsageSectionCount === 1 &&
      state.runtimeMap.renderedUsageScopeCount === 3 &&
      state.runtimeMap.renderedUsageReportedCount >= 2 &&
      state.runtimeMap.renderedUsageEstimatedCount >= 2 &&
      state.runtimeMap.renderedUsageCacheCount >= 1 &&
      state.runtimeMap.scriptError === undefined,
    "the Runtime Map to render reported, estimated, and cached token usage",
  );
  assert.equal(renderedUsageState.runtimeMap.renderedUsageResetButtonCount, 1);
  assert.equal(
    renderedUsageState.runtimeMap.renderedUsageLastCacheDetailCount,
    1,
    "the latest request must show its cache-read amount, including zero",
  );
  await vscode.commands.executeCommand("codeCat.__seedChat");
  const renderedChatState = await waitForValue(
    () => vscode.commands.executeCommand("codeCat.__smokeState"),
    (state) =>
      state?.chatMessageCount === 2 &&
      state.runtimeMap?.renderedChatMessageCount === 2 &&
      state.runtimeMap.renderedContentMode === "chat" &&
      state.runtimeMap.scriptError === undefined,
    "the Runtime Map to render a chat exchange",
  );
  assert.equal(
    renderedChatState.runtimeMap.renderedChatRoleLabelCount,
    0,
    "chat turns must not render floating visible role labels",
  );
  assert.equal(
    renderedChatState.runtimeMap.renderedRichTextElementCount,
    2,
    "chat answers must render inline code and emphasis as structured DOM",
  );
  assert.equal(
    renderedChatState.runtimeMap.renderedUserMessageSurfaceDeclared,
    true,
    "user messages must use their own restrained surface token",
  );
  assert.equal(
    renderedChatState.runtimeMap.renderedUserMessageSurfaceDistinct,
    true,
    "the user-message surface must remain visible against the editor background",
  );
  await vscode.commands.executeCommand("codeCat.__seedTutorError");
  await waitForValue(
    () => vscode.commands.executeCommand("codeCat.__smokeState"),
    (state) =>
      state?.runtimeMap?.renderedContentMode === "message" &&
      state.runtimeMap.tutorMessageRendered === true &&
      state.runtimeMap.scriptError === undefined,
    "the Runtime Map to render tutor feedback in its main content area",
  );
  await vscode.commands.executeCommand("codeCat.__seedStructuredPause");
  const structuredPauseState = await waitForValue(
    () => vscode.commands.executeCommand("codeCat.__smokeState"),
    (state) =>
      state?.runtimeMap?.renderedContentMode === "debug" &&
      state.runtimeMap.lastReceivedVersion === state.runtimeMap.stateVersion &&
      state.runtimeMap.scriptError === undefined,
    "the Runtime Map to render a structured pause",
  );
  assert.equal(structuredPauseState.runtimeMap.renderedPauseExplanationSectionCount, 3);
  assert.equal(structuredPauseState.runtimeMap.renderedPauseRichTextElementCount, 2);
  assert.equal(structuredPauseState.runtimeMap.renderedRuntimeEvidenceGroupCount, 2);
  assert.equal(structuredPauseState.runtimeMap.renderedVariablePreviewCount, 3);
  assert.ok(structuredPauseState.runtimeMap.renderedVariablePreviewMaxLength <= 120);
  const interactionMotion = structuredPauseState.runtimeMap.renderedInteractionMotion;
  assert.match(
    interactionMotion.actionTransitionProperty,
    /transform/u,
    "action buttons must provide restrained press feedback",
  );
  assert.doesNotMatch(
    interactionMotion.actionTransitionProperty,
    /(?:^|,\s*)all(?:,|$)/u,
    "action buttons must transition explicit properties instead of all",
  );
  assert.notEqual(
    interactionMotion.actionTransitionDuration,
    "0s",
    "pointer feedback must use a short non-zero transition",
  );
  assert.match(
    interactionMotion.sourceLinkTransitionProperty,
    /transform/u,
    "source navigation must share the same tactile press feedback",
  );
  assert.equal(
    interactionMotion.tabTransitionDuration,
    "0s",
    "high-frequency keyboard tab navigation must remain immediate",
  );
  await vscode.commands.executeCommand("codeCat.__seedPauseTutorError");
  const preservedPauseState = await waitForValue(
    () => vscode.commands.executeCommand("codeCat.__smokeState"),
    (state) =>
      state?.runtimeMap?.renderedContentMode === "debug" &&
      state.runtimeMap.tutorMessageRendered === true &&
      state.runtimeMap.lastReceivedVersion === state.runtimeMap.stateVersion,
    "the Runtime Map to preserve runtime evidence after a structured explanation error",
  );
  assert.equal(preservedPauseState.runtimeMap.renderedPauseExplanationSectionCount, 3);
  assert.equal(preservedPauseState.runtimeMap.renderedRuntimeEvidenceGroupCount, 2);
  await vscode.commands.executeCommand("codeCat.clearSession");

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
  let session;
  try {
    await vscode.commands.executeCommand("codeCat.__seedRouteGuidance", codeCatLocation);
    const routeCodeLenses = await vscode.commands.executeCommand(
      "vscode.executeCodeLensProvider",
      checkoutUri,
      20,
    );
    const routeCodeLensTitles = routeCodeLenses.map((lens) => lens.command?.title);
    assert.ok(
      routeCodeLensTitles.some((title) => title?.includes("Code Cat · 第 1/1 步")),
      "the route source line should expose its teaching context as CodeLens",
    );
    assert.ok(
      routeCodeLensTitles.includes("在此暂停"),
      "the route source line should let the learner add a precise managed breakpoint",
    );
    const routeHovers = await vscode.commands.executeCommand(
      "vscode.executeHoverProvider",
      checkoutUri,
      new vscode.Position(breakpointLine, 0),
    );
    const routeHoverText = routeHovers
      .flatMap((hover) => hover.contents)
      .map((content) => typeof content === "string" ? content : content.value)
      .join("\n");
    assert.match(routeHoverText, /为什么在这里停/u);
    assert.match(routeHoverText, /预留库存/u);
    await vscode.commands.executeCommand("codeCat.toggleBreakpoint", codeCatLocation);
    await vscode.commands.executeCommand("workbench.action.closeSidebar");
    await waitForValue(
      () => Promise.resolve(hasBreakpoint(checkoutUri, breakpointLine)),
      (present) => present === false,
      "closing the idle Code Cat view to clear managed breakpoints",
    );
    await vscode.commands.executeCommand("workbench.view.extension.codeCat");
    await vscode.commands.executeCommand("codeCat.runtimeMap.focus");

    replaceSourceBreakpointsAt(checkoutUri, breakpointLine, []);
    const userBreakpoint = new vscode.SourceBreakpoint(
      new vscode.Location(checkoutUri, new vscode.Position(breakpointLine, 0)),
      true,
      "request.quantity > 0",
    );
    vscode.debug.addBreakpoints([userBreakpoint]);
    await vscode.commands.executeCommand("codeCat.toggleBreakpoint", codeCatLocation);
    assert.equal(
      vscode.debug.breakpoints.includes(userBreakpoint),
      true,
      "Code Cat must never remove a user-owned breakpoint at the same source line",
    );
    replaceSourceBreakpointsAt(checkoutUri, breakpointLine, []);

    await vscode.commands.executeCommand("codeCat.toggleBreakpoint", codeCatLocation);
    assert.equal(
      hasBreakpoint(checkoutUri, breakpointLine),
      true,
      "Code Cat should toggle the linked source breakpoint",
    );
    await vscode.commands.executeCommand("codeCat.toggleBreakpoint", codeCatLocation);
    assert.equal(
      hasBreakpoint(checkoutUri, breakpointLine),
      false,
      "Code Cat should toggle the linked source breakpoint back",
    );
    replaceSourceBreakpointsAt(checkoutUri, breakpointLine, []);
    await vscode.commands.executeCommand("codeCat.toggleBreakpoint", codeCatLocation);
    assert.equal(
      hasBreakpoint(checkoutUri, breakpointLine),
      true,
      "Code Cat should create the temporary smoke breakpoint",
    );
    await vscode.commands.executeCommand("codeCat.__seedRouteGuidance", codeCatLocation);
    assert.equal(
      hasBreakpoint(checkoutUri, breakpointLine),
      false,
      "replacing the reading route must remove the previous route's managed breakpoints",
    );
    await vscode.commands.executeCommand("codeCat.toggleBreakpoint", codeCatLocation);
    await vscode.commands.executeCommand("codeCat.clearSession");
    assert.equal(
      hasBreakpoint(checkoutUri, breakpointLine),
      false,
      "starting a new Code Cat conversation must remove managed breakpoints",
    );
    await vscode.commands.executeCommand("codeCat.__seedRouteGuidance", codeCatLocation);
    await vscode.commands.executeCommand("codeCat.toggleBreakpoint", codeCatLocation);

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
    const pausedCodeLenses = await vscode.commands.executeCommand(
      "vscode.executeCodeLensProvider",
      checkoutUri,
      20,
    );
    const pausedCodeLensTitles = pausedCodeLenses.map((lens) => lens.command?.title);
    for (const title of ["解释此处", "继续运行", "进入函数", "单步跳过"]) {
      assert.ok(
        pausedCodeLensTitles.includes(title),
        `the live source line should expose the ${title} operation`,
      );
    }

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
    assert.equal(
      hasBreakpoint(checkoutUri, breakpointLine),
      false,
      "ending guided debug must remove Code Cat's managed breakpoint",
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

async function testTokenUsageTracking() {
  const values = new Map();
  const workspaceState = {
    keys: () => [...values.keys()],
    get: (key, fallback) => (values.has(key) ? values.get(key) : fallback),
    update: async (key, value) => {
      if (value === undefined) {
        values.delete(key);
      } else {
        values.set(key, value);
      }
    },
  };
  const reported = {
    source: "reported",
    inputTokens: 120,
    outputTokens: 16,
    totalTokens: 136,
    cacheReadTokens: 40,
    cacheWriteTokens: 0,
  };
  const estimated = {
    source: "estimated",
    inputTokens: 30,
    outputTokens: 5,
    totalTokens: 35,
    cacheReadTokens: 0,
    cacheWriteTokens: 0,
  };
  const tracker = new TokenUsageTracker(workspaceState);
  await tracker.record(reported, {
    requestKind: "question",
    provider: "openai",
    model: "gpt-test",
  });
  await tracker.record(estimated, {
    requestKind: "pause",
    provider: "vscode",
    model: "copilot-test",
  });

  const snapshot = tracker.snapshot();
  assert.equal(snapshot.last.requestKind, "pause");
  assert.equal(snapshot.last.provider, "vscode");
  assert.deepEqual(snapshot.last.usage, estimated);
  assert.deepEqual(snapshot.session, {
    reported: {
      inputTokens: 120,
      outputTokens: 16,
      totalTokens: 136,
      cacheReadTokens: 40,
      cacheWriteTokens: 0,
    },
    estimated: {
      inputTokens: 30,
      outputTokens: 5,
      totalTokens: 35,
      cacheReadTokens: 0,
      cacheWriteTokens: 0,
    },
  });
  assert.deepEqual(snapshot.project, snapshot.session);

  const restored = new TokenUsageTracker(workspaceState);
  assert.deepEqual(restored.snapshot().project, snapshot.project);
  assert.deepEqual(restored.snapshot().session, {
    reported: emptyTokenCounts(),
    estimated: emptyTokenCounts(),
  });
  assert.equal(restored.snapshot().last, undefined);

  tracker.clearSession();
  assert.deepEqual(tracker.snapshot().session, {
    reported: emptyTokenCounts(),
    estimated: emptyTokenCounts(),
  });
  assert.equal(tracker.snapshot().last, undefined);
  assert.deepEqual(tracker.snapshot().project, snapshot.project);

  await tracker.resetProject();
  assert.deepEqual(tracker.snapshot().project, {
    reported: emptyTokenCounts(),
    estimated: emptyTokenCounts(),
  });
  tracker.dispose();
  restored.dispose();
}

function emptyTokenCounts() {
  return {
    inputTokens: 0,
    outputTokens: 0,
    totalTokens: 0,
    cacheReadTokens: 0,
    cacheWriteTokens: 0,
  };
}

function testRuntimeEvidenceConstraints() {
  const snapshots = normalizeRuntimeVariables(
    [
      { name: "special variables", value: "...", type: "group" },
      { name: "class variables", value: "...", type: "group" },
      { name: "password", value: "super-secret", type: "str" },
      { name: "inventory_id", value: "42", type: "int" },
      { name: "inventory_id", value: "duplicate", type: "str" },
      { name: "SYSTEM_PROMPT", value: `line one\n${"x".repeat(320)}`, type: "str" },
    ],
    4,
  );
  assert.deepEqual(
    snapshots.map(({ name }) => name),
    ["password", "inventory_id", "SYSTEM_PROMPT"],
  );
  assert.equal(snapshots[0].value, "<redacted by Code Cat>");
  assert.equal(snapshots[1].value, "42");
  assert.ok(snapshots[2].value.length <= 240);
  assert.equal(snapshots[2].value.includes("\n"), false);
  assert.equal(snapshots[2].value.endsWith("…"), true);
}

function testConversationState() {
  const store = new SessionStore();
  try {
    store.addChatExchange("你好", "你好！想聊聊什么？");
    assert.deepEqual(
      store.snapshot().chatMessages.map(({ role, text }) => ({ role, text })),
      [
        { role: "user", text: "你好" },
        { role: "assistant", text: "你好！想聊聊什么？" },
      ],
    );
    assert.equal(store.snapshot().contentMode, "chat");
    store.setRoute({
      question: "结账请求经过哪些函数？",
      summary: "结账从入口进入库存与支付流程。",
      nodes: [
        {
          id: "route-node",
          title: "Checkout",
          location: { path: "/tmp/checkout.py", line: 1, column: 1 },
          reason: "Entry point",
          confidence: "high",
        },
      ],
    });
    assert.deepEqual(
      store.snapshot().chatMessages.slice(-2).map(({ role, text }) => ({ role, text })),
      [
        { role: "user", text: "结账请求经过哪些函数？" },
        { role: "assistant", text: "结账从入口进入库存与支付流程。" },
      ],
    );
    assert.equal(store.snapshot().contentMode, "route");

    store.setTutorMessage({
      id: "model-error",
      kind: "error",
      text: "模型暂时不可用，请稍后重试。",
    });
    assert.equal(
      store.snapshot().contentMode,
      "message",
      "a tutor error must replace chat or route content instead of being hidden behind it",
    );

    store.beginDebugSession("debug-session");
    store.recordPause({
      id: "pause-1",
      sessionId: "debug-session",
      reason: "breakpoint",
      threadId: 1,
      recordedAt: "2026-07-23T00:00:00.000Z",
      frames: [
        {
          id: 101,
          name: "checkout",
          location: { path: "/tmp/checkout.py", line: 8, column: 1 },
        },
      ],
      variables: [],
    });
    assert.equal(store.snapshot().contentMode, "debug");
    store.addChatExchange("现在发生了什么？", "调试器停在 checkout。");
    assert.equal(store.snapshot().contentMode, "chat");
    store.setTutorMessage({
      id: "pause-explanation",
      kind: "pause",
      pauseId: "pause-1",
      explanation: {
        whatHappened: "当前正在处理结账。",
        whyItMatters: "这里决定是否继续支付。",
        inspectNext: "查看库存标识。",
      },
    });
    assert.equal(
      store.snapshot().contentMode,
      "debug",
      "a pause explanation must leave chat mode so the explanation is visible",
    );
    store.setTutorMessage({
      id: "pause-explanation-error",
      kind: "pause-error",
      pauseId: "pause-1",
      text: "模型解释结构无效。",
    });
    assert.equal(
      store.snapshot().contentMode,
      "debug",
      "a pause explanation error must preserve the runtime reading view",
    );

    store.setRoute({
      question: "支付失败会经过哪些函数？",
      summary: "支付失败从 checkout 进入支付适配器。",
      nodes: [
        {
          id: "payment-route-node",
          title: "Payment",
          location: { path: "/tmp/checkout.py", line: 12, column: 1 },
          reason: "Payment boundary",
          confidence: "high",
        },
      ],
    });
    assert.equal(store.snapshot().contentMode, "route");
    assert.equal(store.snapshot().debugStatus, "paused");
    assert.equal(store.snapshot().pauses.length, 1);
    assert.equal(store.snapshot().selectedPauseId, "pause-1");
    assert.equal(store.snapshot().selectedFrameId, 101);
  } finally {
    store.dispose();
  }
}

async function testRoutePreflight() {
  const cancellation = new vscode.CancellationTokenSource();
  try {
    let emptyProjectModelRequests = 0;
    const emptyProjectTutor = new AiTutor(
      {
        readinessIssue: async () => ({
          kind: "no-workspace",
          message: "请先在 VS Code 中打开一个包含 Python 代码的项目文件夹。",
        }),
        promptContext: async () => "Python files (0):\n\nSymbols (0 indexed; 0 shown):",
        resolveFile: async () => undefined,
      },
      {
        request: async () => {
          emptyProjectModelRequests += 1;
          return JSON.stringify({ summary: "none", nodes: [] });
        },
      },
    );
    await assert.rejects(
      emptyProjectTutor.locateRoute("你好", cancellation.token),
      /请先在 VS Code 中打开一个包含 Python 代码的项目文件夹/u,
    );
    assert.equal(
      emptyProjectModelRequests,
      0,
      "an unusable project must fail before spending a model request",
    );

    let greetingReadinessChecks = 0;
    let greetingIndexRequests = 0;
    let greetingModelRequests = 0;
    const greetingTutor = new AiTutor(
      {
        readinessIssue: async () => {
          greetingReadinessChecks += 1;
          return undefined;
        },
        promptContext: async () => {
          greetingIndexRequests += 1;
          return "Python files (1):\napp.py\n\nSymbols (3 indexed; 3 shown):";
        },
        resolveFile: async () => undefined,
      },
      {
        request: async () => {
          greetingModelRequests += 1;
          return JSON.stringify({ kind: "chat", message: "你好！想聊聊什么？" });
        },
      },
    );
    assert.deepEqual(
      await greetingTutor.answerQuestion("你好", [], cancellation.token),
      { kind: "chat", answer: "你好！想聊聊什么？" },
    );
    assert.equal(greetingReadinessChecks, 0, "a greeting must not inspect the project");
    assert.equal(greetingIndexRequests, 0, "a greeting must not build project context");
    assert.equal(greetingModelRequests, 0, "a greeting must not wait for the model");

    let pauseExplanationPrompt = "";
    const pauseTutor = new AiTutor(
      {
        readinessIssue: async () => undefined,
        promptContext: async () => "",
        resolveFile: async () => undefined,
      },
      {
        request: async (prompt) => {
          pauseExplanationPrompt = prompt;
          return JSON.stringify({
            whatHappened: "程序在 checkout 的库存校验前暂停。",
            whyItMatters: "这里决定订单能否继续进入支付。",
            inspectNext: "查看 inventory_id 的值，再进入 reserve_inventory。",
          });
        },
      },
    );
    const pauseExplanation = await pauseTutor.explainPause(
      "结账请求为什么失败？",
      {
        id: "pause-structured",
        sessionId: "debug-structured",
        reason: "breakpoint",
        threadId: 1,
        recordedAt: "2026-07-23T00:00:00.000Z",
        frames: [
          {
            id: 1,
            name: "checkout",
            location: { path: "/tmp/checkout.py", line: 12, column: 1 },
          },
        ],
        variables: [{ name: "inventory_id", value: "42", type: "int" }],
      },
      cancellation.token,
    );
    assert.equal(pauseExplanation.kind, "pause");
    assert.deepEqual(pauseExplanation.explanation, {
      whatHappened: "程序在 checkout 的库存校验前暂停。",
      whyItMatters: "这里决定订单能否继续进入支付。",
      inspectNext: "查看 inventory_id 的值，再进入 reserve_inventory。",
    });
    assert.match(pauseExplanationPrompt, /whatHappened/u);
    assert.match(pauseExplanationPrompt, /Return JSON only/u);
    const invalidPauseTutor = new AiTutor(
      {
        readinessIssue: async () => undefined,
        promptContext: async () => "",
        resolveFile: async () => undefined,
      },
      {
        request: async () =>
          JSON.stringify({ whatHappened: "paused", whyItMatters: "important" }),
      },
    );
    await assert.rejects(
      invalidPauseTutor.explainPause(
        undefined,
        {
          id: "invalid-pause",
          sessionId: "invalid-session",
          reason: "breakpoint",
          threadId: 1,
          recordedAt: "2026-07-23T00:00:00.000Z",
          frames: [],
          variables: [],
        },
        cancellation.token,
      ),
      /inspectNext/u,
    );
    const boundedPauseTutor = new AiTutor(
      {
        readinessIssue: async () => undefined,
        promptContext: async () => "",
        resolveFile: async () => undefined,
      },
      {
        request: async () =>
          JSON.stringify({
            whatHappened: "x".repeat(800),
            whyItMatters: "important",
            inspectNext: "inspect",
          }),
      },
    );
    const boundedPause = await boundedPauseTutor.explainPause(
      undefined,
      {
        id: "bounded-pause",
        sessionId: "bounded-session",
        reason: "breakpoint",
        threadId: 1,
        recordedAt: "2026-07-23T00:00:00.000Z",
        frames: [],
        variables: [],
      },
      cancellation.token,
    );
    assert.equal(boundedPause.explanation.whatHappened.length, 600);
    assert.equal(boundedPause.explanation.whatHappened.endsWith("…"), true);

    const folder = vscode.workspace.workspaceFolders?.[0];
    assert.ok(folder, "the route-intent test needs the smoke workspace");
    const stableIndex = new PythonProjectIndex();
    try {
      assert.equal(
        await stableIndex.promptContext("checkout"),
        await stableIndex.promptContext("inventory"),
        "small-project context must stay byte-for-byte stable across questions",
      );
    } finally {
      stableIndex.dispose();
    }
    const checkoutPath = vscode.Uri.joinPath(
      folder.uri,
      "order_service",
      "checkout.py",
    ).fsPath;
    const multilinePath = vscode.Uri.joinPath(
      folder.uri,
      "order_service",
      "multiline.py",
    ).fsPath;
    let routePrompt = "";
    const routeTutor = new AiTutor(
      {
        readinessIssue: async () => undefined,
        promptContext: async () => "Python files (1):\norder_service/checkout.py",
        resolveFile: async (candidate) =>
          candidate.endsWith("multiline.py") ? multilinePath : checkoutPath,
      },
      {
        request: async (prompt) => {
          routePrompt = prompt;
          return JSON.stringify({
            kind: "route",
            summary: "Checkout route",
            nodes: [
              {
                title: "Checkout",
                symbol: "checkout",
                file: "order_service/checkout.py",
                line: 22,
                reason: "Entry point",
                confidence: "high",
              },
              {
                title: "Transform value",
                symbol: "transform",
                file: "order_service/multiline.py",
                line: 1,
                reason: "Skip imports, decorators, and the docstring.",
                confidence: "high",
              },
            ],
          });
        },
      },
    );
    const routeResult = await routeTutor.answerQuestion(
      "结账请求经过哪些函数？",
      [
        { id: "earlier-user", role: "user", text: "先看入口" },
        { id: "earlier-assistant", role: "assistant", text: "好的" },
      ],
      cancellation.token,
    );
    assert.ok(
      routePrompt.indexOf("Python files (1)") < routePrompt.indexOf("Recent conversation:"),
      "stable project context must precede changing conversation text for prefix caching",
    );
    assert.ok(
      routePrompt.indexOf("Recent conversation:") < routePrompt.indexOf("User message:"),
      "recent conversation should remain immediately before the current user message",
    );
    assert.equal(routeResult.kind, "route");
    assert.equal(routeResult.route.nodes.length, 2);
    assert.equal(
      routeResult.route.nodes[0].location.line,
      23,
      "a function route stop should resolve to its first executable statement",
    );
    assert.equal(
      routeResult.route.nodes[1].location.line,
      9,
      "a noisy route line and multiline header should resolve through the named symbol to executable code",
    );
  } finally {
    cancellation.dispose();
  }
}

async function testHttpModelClients() {
  const requests = [];
  const server = http.createServer(async (request, response) => {
    const body = await readRequestBody(request);
    requests.push({ url: request.url, headers: request.headers, body: JSON.parse(body) });
    response.setHeader("content-type", "application/json");
    if (request.url === "/responses") {
      response.end(
        JSON.stringify({
          output: [{ content: [{ text: "openai-ok" }] }],
          usage: {
            input_tokens: 120,
            output_tokens: 16,
            total_tokens: 136,
            input_tokens_details: { cached_tokens: 40 },
          },
        }),
      );
    } else if (request.url === "/chat/completions") {
      response.end(
        JSON.stringify({
          choices: [{ message: { content: "chat-ok" } }],
          usage: {
            prompt_tokens: 80,
            completion_tokens: 12,
            total_tokens: 92,
            prompt_tokens_details: { cached_tokens: 30 },
          },
        }),
      );
    } else if (request.url === "/messages") {
      response.end(
        JSON.stringify({
          content: [{ type: "text", text: "anthropic-ok" }],
          usage: {
            input_tokens: 100,
            output_tokens: 14,
            cache_read_input_tokens: 60,
            cache_creation_input_tokens: 10,
          },
        }),
      );
    } else if (request.url === "/models/gemini-test:generateContent") {
      response.end(
        JSON.stringify({
          candidates: [{ content: { parts: [{ text: "gemini-ok" }] } }],
          usageMetadata: {
            promptTokenCount: 90,
            candidatesTokenCount: 11,
            totalTokenCount: 101,
            cachedContentTokenCount: 55,
          },
        }),
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
    } else if (request.url === "/without-usage/chat/completions") {
      response.end(JSON.stringify({ choices: [{ message: { content: "ok" } }] }));
    } else if (request.url === "/without-usage/responses") {
      response.end(JSON.stringify({ output_text: "ok" }));
    } else if (request.url === "/without-usage/messages") {
      response.end(JSON.stringify({ content: [{ type: "text", text: "ok" }] }));
    } else if (request.url === "/without-usage/models/gemini-test:generateContent") {
      response.end(
        JSON.stringify({ candidates: [{ content: { parts: [{ text: "ok" }] } }] }),
      );
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
    assert.deepEqual(
      await requestHttpModel({ ...common, transport: "openai-responses" }, cancellation.token),
      {
        text: "openai-ok",
        usage: {
          source: "reported",
          inputTokens: 120,
          outputTokens: 16,
          totalTokens: 136,
          cacheReadTokens: 40,
          cacheWriteTokens: 0,
        },
      },
    );
    assert.deepEqual(
      await requestHttpModel({ ...common, transport: "openai-chat" }, cancellation.token),
      {
        text: "chat-ok",
        usage: {
          source: "reported",
          inputTokens: 80,
          outputTokens: 12,
          totalTokens: 92,
          cacheReadTokens: 30,
          cacheWriteTokens: 0,
        },
      },
    );
    assert.deepEqual(
      await requestHttpModel({ ...common, transport: "anthropic" }, cancellation.token),
      {
        text: "anthropic-ok",
        usage: {
          source: "reported",
          inputTokens: 170,
          outputTokens: 14,
          totalTokens: 184,
          cacheReadTokens: 60,
          cacheWriteTokens: 10,
        },
      },
    );
    assert.deepEqual(
      await requestHttpModel(
        { ...common, transport: "gemini", model: "gemini-test" },
        cancellation.token,
      ),
      {
        text: "gemini-ok",
        usage: {
          source: "reported",
          inputTokens: 90,
          outputTokens: 11,
          totalTokens: 101,
          cacheReadTokens: 55,
          cacheWriteTokens: 0,
        },
      },
    );
    assert.equal(requests.length, 4);
    assert.equal(requests[0].headers.authorization, "Bearer smoke-secret");
    assert.equal(requests[0].body.store, false);
    assert.equal(requests[1].body.messages[0].content, "ping");
    assert.equal(requests[2].headers["x-api-key"], "smoke-secret");
    assert.equal(requests[2].headers["anthropic-version"], "2023-06-01");
    assert.equal(requests[3].headers["x-goog-api-key"], "smoke-secret");
    assert.equal(requests[3].body.contents[0].parts[0].text, "ping");

    assert.deepEqual(
      await requestHttpModel(
        {
          ...common,
          baseUrl: `${baseUrl}/without-usage`,
          transport: "openai-chat",
          prompt: "中文ab",
        },
        cancellation.token,
      ),
      {
        text: "ok",
        usage: {
          source: "estimated",
          inputTokens: 3,
          outputTokens: 1,
          totalTokens: 4,
          cacheReadTokens: 0,
          cacheWriteTokens: 0,
        },
      },
    );
    for (const transport of ["openai-responses", "anthropic", "gemini"]) {
      assert.deepEqual(
        await requestHttpModel(
          {
            ...common,
            baseUrl: `${baseUrl}/without-usage`,
            transport,
            model: transport === "gemini" ? "gemini-test" : common.model,
            prompt: "中文ab",
          },
          cancellation.token,
        ),
        {
          text: "ok",
          usage: {
            source: "estimated",
            inputTokens: 3,
            outputTokens: 1,
            totalTokens: 4,
            cacheReadTokens: 0,
            cacheWriteTokens: 0,
          },
        },
      );
    }

    await assert.rejects(
      requestHttpModel(
        { ...common, baseUrl: `${baseUrl}/redirect`, transport: "openai-chat" },
        cancellation.token,
      ),
    );
    assert.deepEqual(
      requests.slice(8).map((request) => request.url),
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
