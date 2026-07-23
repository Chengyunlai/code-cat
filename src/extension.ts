import { randomUUID } from "node:crypto";
import * as vscode from "vscode";
import { AiTutor } from "./ai/aiTutor";
import { ModelProviderService } from "./ai/modelProviderService";
import { revealLocation } from "./core/locations";
import { SessionActionCoordinator } from "./core/sessionActionCoordinator";
import { SessionStore } from "./core/sessionStore";
import { toggleSourceBreakpoint } from "./debug/breakpoints";
import { DebugSessionObserver } from "./debug/debugSessionObserver";
import { SourceLocation } from "./domain/model";
import { PythonProjectIndex } from "./project/pythonProjectIndex";
import { CallStackTree } from "./views/callStackTree";
import { RuntimeMapActions, RuntimeMapView } from "./views/runtimeMapView";

export function activate(context: vscode.ExtensionContext): void {
  const store = new SessionStore();
  const projectIndex = new PythonProjectIndex();
  const modelProvider = new ModelProviderService(context);
  const tutor = new AiTutor(projectIndex, modelProvider);
  const observer = new DebugSessionObserver(store);
  const callStackTree = new CallStackTree(store);
  const actionCoordinator = new SessionActionCoordinator(store);

  const actions: RuntimeMapActions = {
    locateRoute: (question) =>
      actionCoordinator.run("route", () => locateRoute(store, tutor, question)),
    startGuidedDebug: (question) =>
      actionCoordinator.run("debug", () =>
        startGuidedDebug(store, tutor, observer, question),
      ),
    explainPause: (question) =>
      actionCoordinator.run("pause", () => explainCurrentPause(store, tutor, question)),
    revealLocation: async (location, frameId) => {
      if (frameId !== undefined) {
        store.selectFrame(frameId);
      }
      await revealLocation(location);
    },
    toggleBreakpoint: (location) => toggleSourceBreakpoint(location),
    runDebugCommand: (command) =>
      actionCoordinator.run("control", () => runDebugCommand(store, command)),
    configureModelProvider: async () => {
      await vscode.commands.executeCommand("codeCat.configureModelProvider");
    },
    modelProviderStatus: () => modelProvider.status(),
  };
  const runtimeMap = new RuntimeMapView(context.extensionUri, store, actions);

  context.subscriptions.push(
    store,
    projectIndex,
    observer,
    callStackTree,
    runtimeMap,
    vscode.window.registerTreeDataProvider("codeCat.callStack", callStackTree),
    vscode.window.registerWebviewViewProvider("codeCat.runtimeMap", runtimeMap),
    vscode.commands.registerCommand("codeCat.askProject", async () => {
      const question = await vscode.window.showInputBox({
        title: "Locate a Python code path",
        prompt: "What behavior or request flow do you want to understand?",
        placeHolder: "How does an order move from the API to payment?",
        ignoreFocusOut: true,
      });
      if (question?.trim()) {
        await actions.locateRoute(question.trim());
      }
    }),
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
      if (!store.clear()) {
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
        toggleSourceBreakpoint(location);
      }
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
        lastPauseFrameCount: store.selectedPause()?.frames.length ?? 0,
        lastPauseVariableCount: store.selectedPause()?.variables.length ?? 0,
        callStackFrameCount: callStackTree.getChildren().length,
        runtimeMap: runtimeMap.smokeDiagnostics(),
      })),
      vscode.commands.registerCommand("codeCat.__startSmokeDebug", () =>
        launchGuidedDebugSession(observer),
      ),
      vscode.commands.registerCommand("codeCat.__showSmokeView", async () => {
        await vscode.commands.executeCommand("workbench.view.extension.codeCat");
        return runtimeMap.showForSmoke();
      }),
      vscode.commands.registerCommand("codeCat.__modelProviderStatus", () =>
        modelProvider.status(),
      ),
    );
  }
}

export function deactivate(): void {}

async function locateRoute(
  store: SessionStore,
  tutor: AiTutor,
  question: string,
): Promise<void> {
  store.setBusy("正在建立 Python 项目索引并定位代码链路…");
  try {
    const route = await vscode.window.withProgress(
      {
        location: vscode.ProgressLocation.Notification,
        title: "Code Cat is locating the code path",
        cancellable: true,
      },
      async (_progress, token) => tutor.locateRoute(question, token),
    );
    store.setRoute(route);
    await vscode.commands.executeCommand("workbench.view.extension.codeCat");
  } catch (error) {
    handleTutorError(store, error);
  }
}

async function explainCurrentPause(
  store: SessionStore,
  tutor: AiTutor,
  suppliedQuestion?: string,
): Promise<void> {
  const state = store.snapshot();
  const pause = store.selectedPause();
  if (!pause) {
    void vscode.window.showInformationMessage(
      "Start a Python debug session and pause at a breakpoint before asking for an explanation.",
    );
    return;
  }

  store.setBusy("正在根据真实调用栈和变量解释当前暂停…");
  try {
    const message = await vscode.window.withProgress(
      {
        location: vscode.ProgressLocation.Notification,
        title: "Code Cat is explaining the current pause",
        cancellable: true,
      },
      async (_progress, token) =>
        tutor.explainPause(suppliedQuestion?.trim() || state.route?.question, pause, token),
    );
    store.setTutorMessage(message);
  } catch (error) {
    handleTutorError(store, error);
  }
}

async function startGuidedDebug(
  store: SessionStore,
  tutor: AiTutor,
  observer: DebugSessionObserver,
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
    await locateRoute(store, tutor, question);
  }

  await launchGuidedDebugSession(observer);
}

async function launchGuidedDebugSession(observer: DebugSessionObserver): Promise<void> {
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
  const configuration = await chooseDebugConfiguration(configurations);
  if (configuration) {
    const started = await startObservedDebugSession(observer, folder, configuration);
    if (!started) {
      void vscode.window.showErrorMessage("VS Code could not start the selected Python debugger.");
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
  store.setTutorMessage({ id: randomUUID(), kind: "error", markdown: message });
  void vscode.window.showErrorMessage(`Code Cat: ${message}`);
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
