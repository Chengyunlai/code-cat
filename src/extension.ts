import { randomUUID } from "node:crypto";
import * as vscode from "vscode";
import { AiTutor } from "./ai/aiTutor";
import { revealLocation } from "./core/locations";
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
  const tutor = new AiTutor(projectIndex);
  const observer = new DebugSessionObserver(store);
  const callStackTree = new CallStackTree(store);

  const actions: RuntimeMapActions = {
    locateRoute: (question) => locateRoute(store, tutor, question),
    startGuidedDebug: (question) => startGuidedDebug(store, tutor, observer, question),
    explainPause: () => explainCurrentPause(store, tutor),
    revealLocation: async (location, frameId) => {
      if (frameId !== undefined) {
        store.selectFrame(frameId);
      }
      await revealLocation(location);
    },
    toggleBreakpoint: (location) => toggleSourceBreakpoint(location),
    runDebugCommand,
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
        await locateRoute(store, tutor, question.trim());
      }
    }),
    vscode.commands.registerCommand(
      "codeCat.startGuidedDebug",
      async (suppliedQuestion?: unknown) => {
        await startGuidedDebug(
          store,
          tutor,
          observer,
          typeof suppliedQuestion === "string"
            ? suppliedQuestion
            : store.snapshot().route?.question,
        );
      },
    ),
    vscode.commands.registerCommand("codeCat.explainPause", async () => {
      await explainCurrentPause(store, tutor);
    }),
    vscode.commands.registerCommand("codeCat.clearSession", () => store.clear()),
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
    vscode.commands.registerCommand("codeCat.continue", () => runDebugCommand("continue")),
    vscode.commands.registerCommand("codeCat.stepInto", () => runDebugCommand("stepInto")),
    vscode.commands.registerCommand("codeCat.stepOver", () => runDebugCommand("stepOver")),
  );

  if (context.extensionMode === vscode.ExtensionMode.Test) {
    context.subscriptions.push(
      vscode.commands.registerCommand("codeCat.__smokeState", () => ({
        debugSessionId: store.snapshot().debugSessionId,
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

async function explainCurrentPause(store: SessionStore, tutor: AiTutor): Promise<void> {
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
      async (_progress, token) => tutor.explainPause(state.route?.question, pause, token),
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
  command: "continue" | "stepInto" | "stepOver",
): Promise<void> {
  if (!vscode.debug.activeDebugSession) {
    void vscode.window.showInformationMessage("There is no active debug session.");
    return;
  }
  const commands = {
    continue: "workbench.action.debug.continue",
    stepInto: "workbench.action.debug.stepInto",
    stepOver: "workbench.action.debug.stepOver",
  } as const;
  await vscode.commands.executeCommand(commands[command]);
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
