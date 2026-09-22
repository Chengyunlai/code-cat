import { randomUUID } from "node:crypto";
import * as vscode from "vscode";
import { AiTutor, TutorGuidanceError } from "./ai/aiTutor";
import { ModelProviderService } from "./ai/modelProviderService";
import { TokenUsageTracker } from "./ai/tokenUsageTracker";
import { shouldShowDebugEvidence } from "./core/debugEvidenceVisibility";
import { revealLocation } from "./core/locations";
import { SessionActionCoordinator } from "./core/sessionActionCoordinator";
import { SessionStore } from "./core/sessionStore";
import { ManagedBreakpointService } from "./debug/breakpoints";
import { DebugSessionObserver } from "./debug/debugSessionObserver";
import {
  discoverPythonProjectScripts,
  projectScriptDebugConfiguration,
  PythonProjectScript,
  selectedPythonInterpreterPath,
} from "./debug/pythonLaunchTargets";
import { type ChatMessage, DebugPause, RoutePlan, SourceLocation } from "./domain/model";
import { PythonProjectIndex } from "./project/pythonProjectIndex";
import { CallStackTree } from "./views/callStackTree";
import { RuntimeMapActions, RuntimeMapView } from "./views/runtimeMapView";
import {
  PYTHON_SOURCE_SELECTOR,
  SourceGuidanceController,
} from "./views/sourceGuidance";
import { TokenUsageStatusBar } from "./views/tokenUsageStatusBar";

export function activate(context: vscode.ExtensionContext): void {
  const store = new SessionStore(context.workspaceState);
  const projectIndex = new PythonProjectIndex();
  const usageTracker = new TokenUsageTracker(context.workspaceState);
  const modelProvider = new ModelProviderService(context, usageTracker);
  const tutor = new AiTutor(projectIndex, modelProvider);
  const breakpoints = new ManagedBreakpointService();
  const observer = new DebugSessionObserver(store, () => breakpoints.clear());
  const callStackTree = new CallStackTree(store);
  const actionCoordinator = new SessionActionCoordinator(store);
  const sourceGuidance = new SourceGuidanceController(store, breakpoints);
  const tokenUsageStatus = new TokenUsageStatusBar(usageTracker);
  const updateDebugEvidenceContext = (): void => {
    const state = store.snapshot();
    void vscode.commands.executeCommand(
      "setContext",
      "codeCat.debugEvidenceVisible",
      shouldShowDebugEvidence(
        state,
        (location) => breakpoints.state(location) !== "none",
      ),
    );
  };
  updateDebugEvidenceContext();

  const toggleBreakpoint = (location: SourceLocation): void => {
    if (breakpoints.toggle(location) === "external") {
      void vscode.window.showInformationMessage(
        "此处已有你设置的断点。Code Cat 会保留它，不会替你移除。",
      );
    }
  };

  let activeQuestion: vscode.CancellationTokenSource | undefined;
  context.subscriptions.push({ dispose: () => { activeQuestion?.cancel(); activeQuestion?.dispose(); } });
  const actions: RuntimeMapActions = {
    askQuestion: async (question) => {
      const pause = store.selectedPause();
      const priorMessages = store.beginQuestion(question);
      if (!priorMessages) {
        return;
      }
      const cancellation = new vscode.CancellationTokenSource();
      activeQuestion = cancellation;
      try {
        await answerQuestion(store, tutor, breakpoints, question, priorMessages, cancellation.token, pause);
      } finally {
        if (activeQuestion === cancellation) activeQuestion = undefined;
        cancellation.dispose();
      }
      void vscode.commands.executeCommand("workbench.view.extension.codeCat");
    },
    cancelQuestion: () => activeQuestion?.cancel(),
    startGuidedDebug: (question) =>
      actionCoordinator.run("debug", () =>
        startGuidedDebug(
          context.extensionUri,
          store,
          tutor,
          observer,
          breakpoints,
          question,
        ),
      ),
    explainPause: async (question) => {
      if (!store.selectedPause()) {
        void vscode.window.showInformationMessage("先启动 Python 调试并命中断点，再解释暂停现场。");
        return;
      }
      await actions.askQuestion(question?.trim() || "解释这次暂停：我已经知道什么、还不能确定什么、下一步怎样验证？");
    },
    revealLocation: async (location, frameId) => {
      if (frameId !== undefined) {
        store.selectFrame(frameId);
      }
      await revealLocation(location);
    },
    toggleBreakpoint,
    breakpointState: (location) => breakpoints.state(location),
    releaseManagedBreakpoints: () => breakpoints.clear(),
    canReleaseManagedBreakpoints: () => !observer.isAwaitingGuidedSession(),
    runDebugCommand: (command) =>
      actionCoordinator.run("control", () => runDebugCommand(store, command)),
    configureModelProvider: async () => {
      await vscode.commands.executeCommand("codeCat.configureModelProvider");
    },
    modelProviderStatus: () => modelProvider.status(),
    showConversationHistory: () =>
      showConversationHistory(store, breakpoints, usageTracker),
  };
  const runtimeMap = new RuntimeMapView(context.extensionUri, store, actions);

  context.subscriptions.push(
    store,
    projectIndex,
    usageTracker,
    observer,
    callStackTree,
    breakpoints,
    sourceGuidance,
    tokenUsageStatus,
    runtimeMap,
    store.onDidChange(updateDebugEvidenceContext),
    vscode.debug.onDidChangeBreakpoints(updateDebugEvidenceContext),
    vscode.languages.registerCodeLensProvider(PYTHON_SOURCE_SELECTOR, sourceGuidance),
    vscode.languages.registerHoverProvider(PYTHON_SOURCE_SELECTOR, sourceGuidance),
    vscode.window.registerTreeDataProvider("codeCat.callStack", callStackTree),
    vscode.window.registerWebviewViewProvider("codeCat.runtimeMap", runtimeMap),
    vscode.commands.registerCommand("codeCat.askProject", async (suppliedQuestion?: unknown) => {
      const question = typeof suppliedQuestion === "string" ? suppliedQuestion : await vscode.window.showInputBox({
        title: "Locate a Python code path",
        prompt: "What behavior or request flow do you want to understand?",
        placeHolder: "How does an order move from the API to payment?",
        ignoreFocusOut: true,
      });
      if (question?.trim()) {
        await actions.askQuestion(question.trim());
      }
    }),
    vscode.commands.registerCommand("codeCat.cancelQuestion", () => actions.cancelQuestion()),
    vscode.commands.registerCommand(
      "codeCat.startGuidedDebug",
      async (suppliedQuestion?: unknown) => {
        await actions.startGuidedDebug(
          typeof suppliedQuestion === "string"
            ? suppliedQuestion
            : store.snapshot().route?.question,
        );
      },
    ),
    vscode.commands.registerCommand("codeCat.explainPause", async () => {
      await actions.explainPause();
    }),
    vscode.commands.registerCommand("codeCat.clearSession", () => {
      if (store.clear()) {
        breakpoints.clear();
        usageTracker.clearSession();
      } else {
        void vscode.window.showInformationMessage(
          "Wait for the current Code Cat request to finish before clearing the session.",
        );
      }
    }),
    vscode.commands.registerCommand("codeCat.configureModelProvider", async () => {
      if (!modelConfigurationAvailable(store)) {
        return;
      }
      await runModelProviderCommand(() => modelProvider.configure());
      runtimeMap.refresh();
    }),
    vscode.commands.registerCommand("codeCat.testModelProvider", async () => {
      if (!modelConfigurationAvailable(store)) {
        return;
      }
      await runModelProviderCommand(() =>
        actionCoordinator.run("model", () => modelProvider.testCurrent()),
      );
    }),
    vscode.commands.registerCommand("codeCat.clearModelApiKey", async () => {
      if (!modelConfigurationAvailable(store)) {
        return;
      }
      await runModelProviderCommand(() => modelProvider.clearCurrentApiKey());
    }),
    vscode.commands.registerCommand("codeCat.resetProjectTokenUsage", async () => {
      const confirmed = await vscode.window.showWarningMessage(
        "重置当前项目的 Token 用量累计？此操作只清除 Code Cat 的本地统计，不影响厂商账单。",
        { modal: true },
        "重置",
      );
      if (confirmed !== "重置") {
        return;
      }
      await usageTracker.resetProject();
      void vscode.window.showInformationMessage("已重置当前项目的 Token 用量累计。");
    }),
    vscode.commands.registerCommand("codeCat.showTokenUsage", () =>
      tokenUsageStatus.showDetails(),
    ),
    vscode.commands.registerCommand(
      "codeCat.revealLocation",
      async (location: unknown, frameId?: unknown) => {
        if (!isSourceLocation(location)) {
          return;
        }
        if (typeof frameId === "number") {
          store.selectFrame(frameId);
        }
        await revealLocation(location);
      },
    ),
    vscode.commands.registerCommand("codeCat.toggleBreakpoint", (location: unknown) => {
      if (isSourceLocation(location)) {
        toggleBreakpoint(location);
      }
    }),
    vscode.commands.registerCommand("codeCat.showRouteNodeContext", async (nodeId: unknown) => {
      if (typeof nodeId !== "string") {
        return;
      }
      const node = store.snapshot().route?.nodes.find((candidate) => candidate.id === nodeId);
      if (!node) {
        return;
      }
      await revealLocation(node.location);
      await vscode.commands.executeCommand("editor.action.showHover");
    }),
    vscode.commands.registerCommand("codeCat.continue", () => actions.runDebugCommand("continue")),
    vscode.commands.registerCommand("codeCat.stepInto", () => actions.runDebugCommand("stepInto")),
    vscode.commands.registerCommand("codeCat.stepOver", () => actions.runDebugCommand("stepOver")),
  );

  if (context.extensionMode === vscode.ExtensionMode.Test) {
    context.subscriptions.push(
      vscode.commands.registerCommand("codeCat.__smokeState", () => ({
        debugSessionId: store.snapshot().debugSessionId,
        debugStatus: store.snapshot().debugStatus,
        pauseCount: store.snapshot().pauses.length,
        chatMessageCount: store.snapshot().chatMessages.length,
        chatMessages: store.snapshot().chatMessages,
        requestKind: store.snapshot().requestKind,
        retryQuestion: store.snapshot().retryQuestion,
        conversationId: store.snapshot().conversationId,
        conversationTitle: store.snapshot().conversationTitle,
        conversationHistoryCount: store.conversationSummaries().length,
        revealedRouteNodeCount: store.snapshot().revealedRouteNodeCount,
        lastPauseFrameCount: store.selectedPause()?.frames.length ?? 0,
        lastPauseTopFramePath: store.selectedPause()?.frames[0]?.location?.path,
        lastPauseTopFrameLine: store.selectedPause()?.frames[0]?.location?.line,
        lastPauseVariableCount: store.selectedPause()?.variables.length ?? 0,
        lastPauseSource: store.selectedPause()?.source,
        callStackFrameCount: callStackTree.getChildren().length,
        tokenUsageStatus: tokenUsageStatus.diagnostics(),
        runtimeMap: runtimeMap.smokeDiagnostics(),
      })),
      vscode.commands.registerCommand("codeCat.__startSmokeDebug", () =>
        launchGuidedDebugSession(context.extensionUri, observer),
      ),
      vscode.commands.registerCommand("codeCat.__showSmokeView", async () => {
        await vscode.commands.executeCommand("workbench.view.extension.codeCat");
        return runtimeMap.showForSmoke();
      }),
      vscode.commands.registerCommand("codeCat.__runComposerSmoke", () =>
        runtimeMap.runComposerSmoke(),
      ),
      vscode.commands.registerCommand("codeCat.__runDebugInviteSmoke", () =>
        runtimeMap.runDebugInviteSmoke(),
      ),
      vscode.commands.registerCommand("codeCat.__runCoreLocationSmoke", () =>
        runtimeMap.runCoreLocationSmoke(),
      ),
      vscode.commands.registerCommand(
        "codeCat.__showSmokeTab",
        (tab: "overview" | "path" | "stack" | "variables") =>
          runtimeMap.showTabForSmoke(tab),
      ),
      vscode.commands.registerCommand("codeCat.__revealNextRouteNode", () =>
        store.revealNextRouteNode(),
      ),
      vscode.commands.registerCommand("codeCat.__modelProviderStatus", () =>
        modelProvider.status(),
      ),
      vscode.commands.registerCommand("codeCat.__seedChat", () => {
        store.addChatExchange(
          "如何继续？",
          "查看 `checkout`，再对照 **调用栈**。",
        );
      }),
      vscode.commands.registerCommand("codeCat.__seedPendingQuestion", () => {
        store.beginQuestion("这是刚刚发送、尚未回答的消息");
      }),
      vscode.commands.registerCommand("codeCat.__completePendingQuestion", () => {
        store.completeQuestionWithAnswer("这是思考结束后追加的唯一回复。");
      }),
      vscode.commands.registerCommand("codeCat.__seedUsage", async () => {
        await usageTracker.resetProject();
        usageTracker.clearSession();
        await usageTracker.record(
          {
            source: "reported",
            inputTokens: 120,
            outputTokens: 16,
            totalTokens: 136,
            cacheReadTokens: 40,
            cacheWriteTokens: 0,
          },
          { requestKind: "question", provider: "openai", model: "gpt-smoke" },
        );
        await usageTracker.record(
          {
            source: "estimated",
            inputTokens: 30,
            outputTokens: 5,
            totalTokens: 35,
            cacheReadTokens: 0,
            cacheWriteTokens: 0,
          },
          { requestKind: "pause", provider: "vscode", model: "copilot-smoke" },
        );
      }),
      vscode.commands.registerCommand("codeCat.__seedTutorError", () => {
        store.setTutorMessage({
          id: randomUUID(),
          kind: "error",
          text: "模型暂时不可用，请稍后重试。",
        });
      }),
      vscode.commands.registerCommand("codeCat.__seedStructuredPause", () => {
        store.beginDebugSession("structured-pause-smoke");
        store.recordPause({
          id: "structured-pause",
          sessionId: "structured-pause-smoke",
          reason: "breakpoint",
          threadId: 1,
          recordedAt: "2026-07-23T00:00:00.000Z",
          frames: [
            {
              id: 201,
              name: "<module>",
              location: { path: "/tmp/chat.py", line: 15, column: 1 },
            },
            {
              id: 202,
              name: "main",
              location: { path: "/tmp/main.py", line: 7, column: 1 },
            },
          ],
          variables: [
            { name: "MAX_TURNS", value: "20", type: "int" },
            {
              name: "SYSTEM_PROMPT",
              value: "这是一段已经受约束但仍然较长的运行时文本。".repeat(8),
              type: "str",
            },
            { name: "mode", value: "chat", type: "str" },
          ],
        });
        store.setTutorMessage({
          id: randomUUID(),
          kind: "pause",
          pauseId: "structured-pause",
          explanation: {
            whatHappened: "程序正在执行 `chat.py` 的模块级代码。",
            whyItMatters: "调用来自 **main.py**，它是当前可见的上游入口。",
            inspectNext: "切换到上一层调用栈，确认是否在这里触发聊天流程。",
          },
        });
      }),
      vscode.commands.registerCommand("codeCat.__seedPauseTutorError", () => {
        const pause = store.selectedPause();
        if (!pause) {
          return;
        }
        store.setTutorMessage({
          id: randomUUID(),
          kind: "pause-error",
          pauseId: pause.id,
          text: "模型没有按结构返回暂停解释，请重试或更换模型。",
        });
      }),
      vscode.commands.registerCommand(
        "codeCat.__seedRouteGuidance",
        (location: unknown) => {
          if (!isSourceLocation(location)) {
            return;
          }
          replaceReadingRoute(store, breakpoints, {
            question: "库存预留发生在哪里？",
            summary: "从结账入口观察库存预留调用。",
            nodes: [
              {
                id: "source-guidance-smoke",
                title: "预留库存",
                symbol: "checkout",
                location,
                reason: "这里把请求中的商品和数量交给库存边界，是结账能否继续的关键证据。",
                confidence: "high",
              },
              {
                id: "source-guidance-smoke-next",
                title: "继续跟进库存结果",
                symbol: "checkout",
                location: { ...location, line: location.line + 1 },
                reason: "只有用户选择继续探索后，才揭示库存结果如何影响后续结账流程。",
                confidence: "medium",
              },
            ],
          });
        },
      ),
    );
  }
}

export function deactivate(): void {}

async function showConversationHistory(
  store: SessionStore,
  breakpoints: ManagedBreakpointService,
  usageTracker: TokenUsageTracker,
): Promise<void> {
  if (store.snapshot().requestKind) {
    void vscode.window.showInformationMessage(
      "请等待当前 Code Cat 请求完成后再切换会话。",
    );
    return;
  }
  const summaries = store.conversationSummaries();
  const selection = await vscode.window.showQuickPick(
    [
      {
        label: "$(add) 新建会话",
        description: "清除临时断点，开始一个独立问题",
        conversationId: undefined,
      },
      ...summaries.map((conversation) => ({
        label: conversation.active
          ? `$(check) ${conversation.title}`
          : `$(comment-discussion) ${conversation.title}`,
        description: conversation.active
          ? "当前会话"
          : formatConversationTime(conversation.updatedAt),
        conversationId: conversation.id,
      })),
    ],
    {
      title: "Code Cat · 历史会话",
      placeHolder: summaries.length
        ? "重新打开一个问题，或开始新会话"
        : "当前还没有可恢复的历史会话",
    },
  );
  if (!selection) {
    return;
  }
  if (selection.conversationId === store.snapshot().conversationId) {
    return;
  }
  const switched =
    selection.conversationId === undefined
      ? store.clear()
      : store.switchConversation(selection.conversationId);
  if (switched) {
    breakpoints.clear();
    usageTracker.clearSession();
  }
}

function formatConversationTime(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? ""
    : new Intl.DateTimeFormat("zh-CN", {
        month: "numeric",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      }).format(date);
}

async function answerQuestion(
  store: SessionStore,
  tutor: AiTutor,
  breakpoints: ManagedBreakpointService,
  question: string,
  priorMessages: readonly ChatMessage[],
  token: vscode.CancellationToken,
  pause?: DebugPause,
): Promise<void> {
  try {
    if (pause) {
      const answer = await cancellable(tutor.answerPauseQuestion(question, priorMessages, pause, token), token);
      store.completeQuestionWithAnswer(answer, pause);
      return;
    }
    const result = await cancellable(tutor.answerQuestion(
      question,
      priorMessages,
      token,
    ), token);
    if (result.kind === "chat") {
      store.completeQuestionWithAnswer(result.answer);
    } else {
      breakpoints.clear();
      store.completeQuestionWithRoute(result.route);
    }
  } catch (error) {
    handleQuestionTutorError(store, error);
  }
}

async function cancellable<T>(work: Promise<T>, token: vscode.CancellationToken): Promise<T> {
  let listener: vscode.Disposable | undefined;
  try {
    return await Promise.race([work, new Promise<never>((_resolve, reject) => {
      listener = token.onCancellationRequested(() => reject(new vscode.CancellationError()));
      if (token.isCancellationRequested) reject(new vscode.CancellationError());
    })]);
  } finally {
    listener?.dispose();
  }
}

async function locateRoute(
  store: SessionStore,
  tutor: AiTutor,
  breakpoints: ManagedBreakpointService,
  question: string,
): Promise<void> {
  store.setBusy("正在建立 Python 项目索引并定位代码链路…");
  try {
    const route = await vscode.window.withProgress(
      {
        location: vscode.ProgressLocation.Window,
        title: "Code Cat is locating the code path",
        cancellable: true,
      },
      async (_progress, token) => tutor.locateRoute(question, token),
    );
    replaceReadingRoute(store, breakpoints, route);
    await vscode.commands.executeCommand("workbench.view.extension.codeCat");
  } catch (error) {
    handleTutorError(store, error);
  }
}

async function startGuidedDebug(
  extensionUri: vscode.Uri,
  store: SessionStore,
  tutor: AiTutor,
  observer: DebugSessionObserver,
  breakpoints: ManagedBreakpointService,
  suppliedQuestion?: string,
): Promise<void> {
  let question = suppliedQuestion?.trim();
  if (!question && !store.snapshot().route) {
    question = await vscode.window.showInputBox({
      title: "Start a guided Python debug session",
      prompt: "What code path should this session teach you?",
      ignoreFocusOut: true,
    });
  }
  if (question && store.snapshot().route?.question !== question) {
    await locateRoute(store, tutor, breakpoints, question);
  }

  ensureCoreTeachingBreakpoint(store, breakpoints);
  await launchGuidedDebugSession(extensionUri, observer);
}

function ensureCoreTeachingBreakpoint(
  store: SessionStore,
  breakpoints: ManagedBreakpointService,
): void {
  const coreLocation = store.snapshot().route?.nodes[0]?.location;
  if (coreLocation && breakpoints.state(coreLocation) === "none") {
    breakpoints.toggle(coreLocation);
  }
}

async function launchGuidedDebugSession(
  extensionUri: vscode.Uri,
  observer: DebugSessionObserver,
): Promise<void> {
  await vscode.commands.executeCommand("workbench.view.extension.codeCat");
  const activeSession = vscode.debug.activeDebugSession;
  if (activeSession) {
    if (!observer.useSession(activeSession.id)) {
      void vscode.window.showWarningMessage(
        "This debugger started before Code Cat could observe it. Stop and restart the debug session once to capture reliable runtime evidence.",
      );
      return;
    }
    void vscode.window.showInformationMessage(
      "Code Cat is now observing the active debug session. Pause or hit a breakpoint to capture the stack.",
    );
    return;
  }

  const folder = await chooseWorkspaceFolder();
  if (!folder) {
    return;
  }
  const configurations = vscode.workspace
    .getConfiguration("launch", folder.uri)
    .get<readonly vscode.DebugConfiguration[]>("configurations", [])
    .filter((configuration) => configuration.type === "python" || configuration.type === "debugpy");
  if (configurations.length > 0) {
    const configuration = await chooseDebugConfiguration(configurations);
    if (!configuration) {
      return;
    }
    const started = await startObservedDebugSession(observer, folder, configuration);
    if (!started) {
      void vscode.window.showErrorMessage("VS Code could not start the selected Python debugger.");
    }
    return;
  }

  const projectScripts = await discoverPythonProjectScripts(folder);
  if (projectScripts.length > 0) {
    const projectScript = await chooseProjectScript(projectScripts);
    if (!projectScript) {
      return;
    }
    const python = await selectedPythonInterpreterPath(folder);
    if (!python) {
      void vscode.window.showInformationMessage(
        "Select a Python interpreter for this workspace before starting its project entry point.",
      );
      await vscode.commands.executeCommand("python.setInterpreter");
      return;
    }
    const started = await startObservedDebugSession(
      observer,
      folder,
      projectScriptDebugConfiguration(folder, extensionUri, projectScript, python),
    );
    if (!started) {
      void vscode.window.showErrorMessage(
        `VS Code could not start the ${projectScript.name} project entry point.`,
      );
    }
    return;
  }

  const editor = vscode.window.activeTextEditor;
  if (editor?.document.languageId !== "python") {
    void vscode.window.showInformationMessage(
      "Add a Python launch configuration or open the Python entry file, then start guided debug again.",
    );
    await vscode.commands.executeCommand("workbench.action.debug.configure");
    return;
  }
  const started = await startObservedDebugSession(observer, folder, {
    name: "Code Cat: Current Python File",
    type: "debugpy",
    request: "launch",
    program: editor.document.uri.fsPath,
    console: "integratedTerminal",
    justMyCode: true,
  });
  if (!started) {
    void vscode.window.showErrorMessage("VS Code could not start debugpy for the active Python file.");
  }
}

async function startObservedDebugSession(
  observer: DebugSessionObserver,
  folder: vscode.WorkspaceFolder,
  configuration: vscode.DebugConfiguration,
): Promise<boolean> {
  observer.armNextSession();
  try {
    const started = await vscode.debug.startDebugging(folder, configuration);
    if (!started) {
      observer.disarmNextSession();
    }
    return started;
  } catch (error) {
    observer.disarmNextSession();
    throw error;
  }
}

async function chooseWorkspaceFolder(): Promise<vscode.WorkspaceFolder | undefined> {
  const folders = vscode.workspace.workspaceFolders ?? [];
  if (folders.length === 0) {
    void vscode.window.showInformationMessage("Open a Python project folder first.");
    return undefined;
  }
  if (folders.length === 1) {
    return folders[0];
  }
  const selection = await vscode.window.showQuickPick(
    folders.map((folder) => ({ label: folder.name, folder })),
    { title: "Choose the Python workspace to debug", ignoreFocusOut: true },
  );
  return selection?.folder;
}

async function chooseDebugConfiguration(
  configurations: readonly vscode.DebugConfiguration[],
): Promise<vscode.DebugConfiguration | undefined> {
  if (configurations.length === 0) {
    return undefined;
  }
  if (configurations.length === 1) {
    return configurations[0];
  }
  const selection = await vscode.window.showQuickPick(
    configurations.map((configuration) => ({
      label: typeof configuration.name === "string" ? configuration.name : "Python configuration",
      configuration,
    })),
    { title: "Choose a Python debug configuration", ignoreFocusOut: true },
  );
  return selection?.configuration;
}

async function chooseProjectScript(
  scripts: readonly PythonProjectScript[],
): Promise<PythonProjectScript | undefined> {
  if (scripts.length === 1) {
    return scripts[0];
  }
  const selection = await vscode.window.showQuickPick(
    scripts.map((script) => ({
      label: script.name,
      description: `${script.module}:${script.callable}`,
      script,
    })),
    {
      title: "Choose the Python project entry point to debug",
      placeHolder: "Entry points declared in pyproject.toml [project.scripts]",
      ignoreFocusOut: true,
    },
  );
  return selection?.script;
}

async function runDebugCommand(
  store: SessionStore,
  command: "continue" | "stepInto" | "stepOver",
): Promise<void> {
  const session = vscode.debug.activeDebugSession;
  const state = store.snapshot();
  const selectedPause = store.selectedPause();
  const livePause = state.pauses.at(-1);
  if (!session) {
    void vscode.window.showInformationMessage("There is no active debug session.");
    return;
  }
  if (
    state.debugSessionId !== session.id ||
    state.debugStatus !== "paused" ||
    state.captureError ||
    !livePause ||
    selectedPause?.id !== livePause.id
  ) {
    void vscode.window.showInformationMessage(
      "Return to the current pause before continuing or stepping the debugger.",
    );
    return;
  }
  const commands = {
    continue: "workbench.action.debug.continue",
    stepInto: "workbench.action.debug.stepInto",
    stepOver: "workbench.action.debug.stepOver",
  } as const;
  store.markDebugSessionRunning(session.id);
  try {
    await vscode.commands.executeCommand(commands[command]);
  } catch (error) {
    store.restoreDebugSessionPaused(session.id);
    throw error;
  }
}

function handleTutorError(store: SessionStore, error: unknown): void {
  if (error instanceof vscode.CancellationError) {
    store.setBusy(undefined);
    return;
  }
  const message = error instanceof Error ? error.message : String(error);
  if (error instanceof TutorGuidanceError) {
    store.setTutorMessage({ id: randomUUID(), kind: "system", text: message });
    void vscode.commands.executeCommand("workbench.view.extension.codeCat");
    return;
  }
  store.setTutorMessage({ id: randomUUID(), kind: "error", text: message });
  void vscode.commands.executeCommand("workbench.view.extension.codeCat");
}

function handleQuestionTutorError(store: SessionStore, error: unknown): void {
  const cancelled = error instanceof vscode.CancellationError;
  const message = cancelled ? "已停止回答。现场与草稿已保留，你可以修改问题后重试。"
    : error instanceof Error ? error.message : String(error);
  store.completeQuestionWithTutorMessage({
    id: randomUUID(),
    kind: cancelled || error instanceof TutorGuidanceError ? "system" : "error",
    text: message,
  });
}

async function runModelProviderCommand(action: () => Promise<void>): Promise<void> {
  try {
    await action();
  } catch (error) {
    if (error instanceof vscode.CancellationError) {
      return;
    }
    const message = error instanceof Error ? error.message : String(error);
    void vscode.window.showErrorMessage(`Code Cat model provider: ${message}`);
  }
}

function modelConfigurationAvailable(store: SessionStore): boolean {
  if (!store.snapshot().requestKind) {
    return true;
  }
  void vscode.window.showInformationMessage(
    "Wait for the current Code Cat request to finish before changing the model provider.",
  );
  return false;
}

function isSourceLocation(value: unknown): value is SourceLocation {
  if (!value || typeof value !== "object") {
    return false;
  }
  const candidate = value as Partial<SourceLocation>;
  return (
    typeof candidate.path === "string" &&
    typeof candidate.line === "number" &&
    typeof candidate.column === "number"
  );
}

function replaceReadingRoute(
  store: SessionStore,
  breakpoints: ManagedBreakpointService,
  route: RoutePlan,
): void {
  breakpoints.clear();
  store.setRoute(route);
}
