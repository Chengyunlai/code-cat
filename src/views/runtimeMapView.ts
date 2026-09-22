import * as path from "node:path";
import * as vscode from "vscode";
import { shouldShowDebugEvidence } from "../core/debugEvidenceVisibility";
import { normalizePath } from "../core/locations";
import { SessionStore } from "../core/sessionStore";
import { LinkedBreakpointState } from "../debug/breakpoints";
import { RouteNode, SourceLocation, StackFrameSnapshot } from "../domain/model";
import { createRuntimeMapHtml } from "./runtimeMapHtml";

export interface RuntimeMapActions {
  askQuestion(question: string): Promise<void>;
  openSourceReference(reference: string): Promise<void>;
  debugFromMessage(messageId: string): Promise<void>;
  cancelQuestion(): void;
  startGuidedDebug(question?: string): Promise<void>;
  explainPause(question?: string): Promise<void>;
  revealLocation(location: SourceLocation, frameId?: number): Promise<void>;
  toggleBreakpoint(location: SourceLocation): void;
  breakpointState(location: SourceLocation): LinkedBreakpointState;
  releaseManagedBreakpoints(): void;
  canReleaseManagedBreakpoints(): boolean;
  runDebugCommand(command: "continue" | "stepInto" | "stepOver"): Promise<void>;
  configureModelProvider(): Promise<void>;
  modelProviderStatus(): { readonly label: string; readonly detail?: string };
  showConversationHistory(): Promise<void>;
}

interface WebviewMessage {
  readonly type?: unknown;
  readonly error?: unknown;
  readonly question?: unknown;
  readonly reference?: unknown;
  readonly messageId?: unknown;
  readonly code?: unknown;
  readonly nodeId?: unknown;
  readonly pauseId?: unknown;
  readonly frameId?: unknown;
  readonly command?: unknown;
  readonly version?: unknown;
  readonly diagnostics?: unknown;
  readonly enterDefaultPrevented?: unknown;
  readonly shiftEnterDefaultPrevented?: unknown;
  readonly tab?: unknown;
}

interface InteractionMotionDiagnostics {
  readonly actionTransitionProperty: string;
  readonly actionTransitionDuration: string;
  readonly sourceLinkTransitionProperty: string;
  readonly tabTransitionDuration: string;
}

interface RenderedDiagnostics {
  readonly chatMessageCount: number;
  readonly userMessageCount: number;
  readonly assistantMessageCount: number;
  readonly thinkingIndicatorCount: number;
  readonly thinkingLabelText: string;
  readonly thinkingDotCount: number;
  readonly thinkingBackgroundImage: string;
  readonly thinkingAnimationName: string;
  readonly answerSkeletonCount: number;
  readonly chatRoleLabelCount: number;
  readonly richTextElementCount: number;
  readonly pauseExplanationSectionCount: number;
  readonly pauseRichTextElementCount: number;
  readonly runtimeEvidenceGroupCount: number;
  readonly variablePreviewCount: number;
  readonly variablePreviewMaxLength: number;
  readonly visibleTabCount: number;
  readonly pathTabVisible: boolean;
  readonly stackTabVisible: boolean;
  readonly variablesTabVisible: boolean;
  readonly renderedRouteNodeCount: number;
  readonly renderedExplorationContextCount: number;
  readonly coreLocationCount: number;
  readonly coreLocationText: string;
  readonly debugInvitationCount: number;
  readonly debugInvitationText: string;
  readonly composerShortcutText: string;
  readonly composerPlaceholderText: string;
  readonly userMessageSurfaceDeclared: boolean;
  readonly userMessageSurfaceDistinct: boolean;
  readonly interactionMotion: InteractionMotionDiagnostics;
  readonly contentMode: string | undefined;
  readonly tutorMessageRendered: boolean;
}

export class RuntimeMapView implements vscode.WebviewViewProvider, vscode.Disposable {
  private view: vscode.WebviewView | undefined;
  private stateVersion = 0;
  private lastSentFrameCount = 0;
  private lastAcknowledgedFrameCount = 0;
  private readyCount = 0;
  private renderedStateCount = 0;
  private lastReceivedVersion: number | undefined;
  private scriptError: string | undefined;
  private composerSmokeResultCount = 0;
  private composerEnterDefaultPrevented = false;
  private composerShiftEnterDefaultPrevented = false;
  private renderedDiagnostics = emptyRenderedDiagnostics();
  private readonly disposables: vscode.Disposable[] = [];

  public constructor(
    private readonly extensionUri: vscode.Uri,
    private readonly store: SessionStore,
    private readonly actions: RuntimeMapActions,
  ) {
    this.disposables.push(
      store.onDidChange(() => this.postState()),
      vscode.debug.onDidChangeBreakpoints(() => this.postState()),
      vscode.workspace.onDidChangeWorkspaceFolders(() => this.postState()),
      vscode.workspace.onDidChangeConfiguration((event) => {
        if (event.affectsConfiguration("codeCat.ai")) {
          this.postState();
        }
      }),
    );
  }

  public resolveWebviewView(view: vscode.WebviewView): void {
    this.view = view;
    view.webview.options = {
      enableScripts: true,
      localResourceRoots: [this.extensionUri],
    };
    view.webview.html = createRuntimeMapHtml(view.webview);
    this.disposables.push(
      view.webview.onDidReceiveMessage((message: unknown) => this.handleMessage(message)),
      view.onDidChangeVisibility(() => {
        if (!view.visible) {
          this.releaseManagedBreakpointsIfIdle();
        }
      }),
      view.onDidDispose(() => {
        this.releaseManagedBreakpointsIfIdle();
        if (this.view === view) {
          this.view = undefined;
          this.lastSentFrameCount = 0;
          this.lastAcknowledgedFrameCount = 0;
          this.renderedDiagnostics = emptyRenderedDiagnostics();
        }
      }),
    );
    this.postState();
  }

  public dispose(): void {
    for (const disposable of this.disposables) {
      disposable.dispose();
    }
  }

  public smokeDiagnostics(): {
    readonly resolved: boolean;
    readonly visible: boolean;
    readonly frameCount: number;
    readonly sentFrameCount: number;
    readonly stateVersion: number;
    readonly readyCount: number;
    readonly renderedStateCount: number;
    readonly lastReceivedVersion: number | undefined;
    readonly scriptError: string | undefined;
    readonly renderedChatMessageCount: number;
    readonly renderedUserMessageCount: number;
    readonly renderedAssistantMessageCount: number;
    readonly renderedThinkingIndicatorCount: number;
    readonly renderedThinkingLabelText: string;
    readonly renderedThinkingDotCount: number;
    readonly renderedThinkingBackgroundImage: string;
    readonly renderedThinkingAnimationName: string;
    readonly renderedAnswerSkeletonCount: number;
    readonly renderedChatRoleLabelCount: number;
    readonly renderedRichTextElementCount: number;
    readonly renderedPauseExplanationSectionCount: number;
    readonly renderedPauseRichTextElementCount: number;
    readonly renderedRuntimeEvidenceGroupCount: number;
    readonly renderedVariablePreviewCount: number;
    readonly renderedVariablePreviewMaxLength: number;
    readonly visibleTabCount: number;
    readonly pathTabVisible: boolean;
    readonly stackTabVisible: boolean;
    readonly variablesTabVisible: boolean;
    readonly renderedRouteNodeCount: number;
    readonly renderedExplorationContextCount: number;
    readonly renderedCoreLocationCount: number;
    readonly renderedCoreLocationText: string;
    readonly renderedDebugInvitationCount: number;
    readonly renderedDebugInvitationText: string;
    readonly renderedComposerShortcutText: string;
    readonly renderedComposerPlaceholderText: string;
    readonly renderedUserMessageSurfaceDeclared: boolean;
    readonly renderedUserMessageSurfaceDistinct: boolean;
    readonly renderedInteractionMotion: InteractionMotionDiagnostics;
    readonly composerSmokeResultCount: number;
    readonly composerEnterDefaultPrevented: boolean;
    readonly composerShiftEnterDefaultPrevented: boolean;
    readonly renderedContentMode: string | undefined;
    readonly tutorMessageRendered: boolean;
  } {
    return {
      resolved: this.view !== undefined,
      visible: this.view?.visible ?? false,
      frameCount: this.lastAcknowledgedFrameCount,
      sentFrameCount: this.lastSentFrameCount,
      stateVersion: this.stateVersion,
      readyCount: this.readyCount,
      renderedStateCount: this.renderedStateCount,
      lastReceivedVersion: this.lastReceivedVersion,
      scriptError: this.scriptError,
      renderedChatMessageCount: this.renderedDiagnostics.chatMessageCount,
      renderedUserMessageCount: this.renderedDiagnostics.userMessageCount,
      renderedAssistantMessageCount: this.renderedDiagnostics.assistantMessageCount,
      renderedThinkingIndicatorCount:
        this.renderedDiagnostics.thinkingIndicatorCount,
      renderedThinkingLabelText: this.renderedDiagnostics.thinkingLabelText,
      renderedThinkingDotCount: this.renderedDiagnostics.thinkingDotCount,
      renderedThinkingBackgroundImage:
        this.renderedDiagnostics.thinkingBackgroundImage,
      renderedThinkingAnimationName:
        this.renderedDiagnostics.thinkingAnimationName,
      renderedAnswerSkeletonCount: this.renderedDiagnostics.answerSkeletonCount,
      renderedChatRoleLabelCount: this.renderedDiagnostics.chatRoleLabelCount,
      renderedRichTextElementCount: this.renderedDiagnostics.richTextElementCount,
      renderedPauseExplanationSectionCount:
        this.renderedDiagnostics.pauseExplanationSectionCount,
      renderedPauseRichTextElementCount:
        this.renderedDiagnostics.pauseRichTextElementCount,
      renderedRuntimeEvidenceGroupCount:
        this.renderedDiagnostics.runtimeEvidenceGroupCount,
      renderedVariablePreviewCount: this.renderedDiagnostics.variablePreviewCount,
      renderedVariablePreviewMaxLength:
        this.renderedDiagnostics.variablePreviewMaxLength,
      visibleTabCount: this.renderedDiagnostics.visibleTabCount,
      pathTabVisible: this.renderedDiagnostics.pathTabVisible,
      stackTabVisible: this.renderedDiagnostics.stackTabVisible,
      variablesTabVisible: this.renderedDiagnostics.variablesTabVisible,
      renderedRouteNodeCount: this.renderedDiagnostics.renderedRouteNodeCount,
      renderedExplorationContextCount:
        this.renderedDiagnostics.renderedExplorationContextCount,
      renderedCoreLocationCount: this.renderedDiagnostics.coreLocationCount,
      renderedCoreLocationText: this.renderedDiagnostics.coreLocationText,
      renderedDebugInvitationCount:
        this.renderedDiagnostics.debugInvitationCount,
      renderedDebugInvitationText: this.renderedDiagnostics.debugInvitationText,
      renderedComposerShortcutText: this.renderedDiagnostics.composerShortcutText,
      renderedComposerPlaceholderText:
        this.renderedDiagnostics.composerPlaceholderText,
      renderedUserMessageSurfaceDeclared:
        this.renderedDiagnostics.userMessageSurfaceDeclared,
      renderedUserMessageSurfaceDistinct:
        this.renderedDiagnostics.userMessageSurfaceDistinct,
      renderedInteractionMotion: this.renderedDiagnostics.interactionMotion,
      composerSmokeResultCount: this.composerSmokeResultCount,
      composerEnterDefaultPrevented: this.composerEnterDefaultPrevented,
      composerShiftEnterDefaultPrevented: this.composerShiftEnterDefaultPrevented,
      renderedContentMode: this.renderedDiagnostics.contentMode,
      tutorMessageRendered: this.renderedDiagnostics.tutorMessageRendered,
    };
  }

  public showForSmoke(): boolean {
    if (!this.view) {
      return false;
    }
    this.view.show(true);
    return this.view.visible;
  }

  public refresh(): void {
    this.postState();
  }

  public async runComposerSmoke(): Promise<boolean> {
    if (!this.view) {
      return false;
    }
    this.composerSmokeResultCount = 0;
    return this.view.webview.postMessage({ type: "smokeComposer" });
  }

  public async runDebugInviteSmoke(): Promise<boolean> {
    return this.view?.webview.postMessage({ type: "smokeDebugInvite" }) ??
      Promise.resolve(false);
  }

  public async runCoreLocationSmoke(): Promise<boolean> {
    return this.view?.webview.postMessage({ type: "smokeCoreLocation" }) ??
      Promise.resolve(false);
  }

  public async showTabForSmoke(tab: "overview" | "path" | "stack" | "variables"): Promise<boolean> {
    const shown = await (this.view?.webview.postMessage({ type: "smokeTab", tab }) ??
      Promise.resolve(false));
    if (shown) {
      this.postState();
    }
    return shown;
  }

  private postState(): void {
    if (!this.view) {
      return;
    }
    const state = this.store.snapshot();
    const currentPause = this.store.selectedPause();
    const routeNodes =
      state.route?.nodes.slice(0, state.revealedRouteNodeCount) ?? [];
    const selectedFrame =
      currentPause?.frames.find((frame) => frame.id === state.selectedFrameId) ??
      currentPause?.frames[0];
    const focusedNodeId = selectedFrame
      ? closestRouteNodeId(routeNodes, selectedFrame)
      : undefined;
    const activeNodeIds = new Set(
      (currentPause?.frames ?? []).flatMap((frame) => {
        const nodeId = closestRouteNodeId(routeNodes, frame);
        return nodeId ? [nodeId] : [];
      }),
    );
    const executedNodeIds = new Set(
      state.pauses.flatMap((pause) =>
        pause.frames.flatMap((frame) => {
          const nodeId = closestRouteNodeId(routeNodes, frame);
          return nodeId ? [nodeId] : [];
        }),
      ),
    );
    const route = state.route
      ? {
          ...state.route,
          totalNodeCount: state.route.nodes.length,
          canRevealMore: state.revealedRouteNodeCount < state.route.nodes.length,
          nodes: routeNodes.map((node) => {
            const breakpointState = this.actions.breakpointState(node.location);
            return {
              ...node,
              fileLabel: vscode.workspace.asRelativePath(node.location.path, false),
              breakpoint: breakpointState !== "none",
              breakpointState,
              executed: executedNodeIds.has(node.id),
              active: activeNodeIds.has(node.id),
              focused: node.id === focusedNodeId,
            };
          }),
        }
      : undefined;
    const pauses = state.pauses.map((pause) => ({
      ...pause,
      id: pause.id,
      reason: pause.reason,
      recordedAt: pause.recordedAt,
      frameCount: pause.frames.length,
      variableCount: pause.variables.length,
      label: pause.frames[0]
        ? `${displayFrameName(pause.frames[0].name)} · ${frameLocationLabel(pause.frames[0])}`
        : pause.reason,
      frames: pause.frames.map((frame) => ({ ...frame, fileLabel: frameLocationLabel(frame) })),
      selected: pause.id === currentPause?.id,
    }));
    const frames = (currentPause?.frames ?? []).map((frame, index) => ({
      ...frame,
      index,
      displayName: displayFrameName(frame.name),
      fileLabel: frameLocationLabel(frame),
      selected: frame.id === state.selectedFrameId,
    }));
    this.stateVersion += 1;
    this.lastSentFrameCount = frames.length;
    this.lastAcknowledgedFrameCount = 0;

    void this.view.webview.postMessage({
      type: "state",
      version: this.stateVersion,
      state: {
        route,
        pauses,
        frames,
        variables: currentPause?.variables ?? [],
        tutorMessage: state.tutorMessage,
        busyMessage: state.busyMessage,
        retryQuestion: state.retryQuestion,
        captureError: state.captureError,
        debugStatus: state.debugStatus ?? (state.debugSessionId ? "running" : "idle"),
        livePauseId:
          state.debugStatus === "paused" && !state.captureError ? state.pauses.at(-1)?.id : undefined,
        requestPending: Boolean(state.requestKind || state.busyMessage),
        requestKind: state.requestKind,
        streamingAnswer: state.streamingAnswer,
        modelProvider: this.actions.modelProviderStatus(),
        debugging: Boolean(state.debugSessionId),
        workspaceOpen: Boolean(vscode.workspace.workspaceFolders?.length),
        chatMessages: state.chatMessages.map(message => {
          const savedRoute = this.store.routeForMessage(message.id);
          const node = savedRoute?.nodes[0];
          return { ...message, debugTarget: node ? {
            title: node.title, fileLabel: vscode.workspace.asRelativePath(node.location.path, false),
            line: node.location.line,
          } : undefined };
        }),
        contentMode: state.contentMode,
        conversationId: state.conversationId,
        conversationTitle: state.conversationTitle,
        revealedRouteNodeCount: state.revealedRouteNodeCount,
        debugEvidenceVisible: shouldShowDebugEvidence(
          state,
          (location) => this.actions.breakpointState(location) !== "none",
        ),
      },
    });
  }

  private async handleMessage(value: unknown): Promise<void> {
    if (!isWebviewMessage(value)) {
      return;
    }
    switch (value.type) {
      case "ready":
        this.readyCount += 1;
        this.postState();
        return;
      case "renderedState":
        this.renderedStateCount += 1;
        this.lastReceivedVersion =
          typeof value.version === "number" ? value.version : undefined;
        if (this.lastReceivedVersion === this.stateVersion) {
          this.lastAcknowledgedFrameCount = this.lastSentFrameCount;
          this.renderedDiagnostics = parseRenderedDiagnostics(value.diagnostics);
        }
        return;
      case "scriptError":
        this.scriptError = typeof value.error === "string" ? value.error : "unknown script error";
        return;
      case "composerSmokeResult":
        this.composerSmokeResultCount += 1;
        this.composerEnterDefaultPrevented = value.enterDefaultPrevented === true;
        this.composerShiftEnterDefaultPrevented =
          value.shiftEnterDefaultPrevented === true;
        return;
      case "askQuestion":
        if (typeof value.question === "string" && value.question.trim()) {
          await this.actions.askQuestion(value.question.trim());
          this.postState();
        }
        return;
      case "cancelQuestion":
        this.actions.cancelQuestion();
        return;
      case "openMessageSource": {
        const route = typeof value.messageId === "string" ? this.store.routeForMessage(value.messageId) : undefined;
        if (route?.nodes[0]) await this.actions.revealLocation(route.nodes[0].location);
        return;
      }
      case "debugFromMessage":
        if (typeof value.messageId === "string") await this.actions.debugFromMessage(value.messageId);
        return;
      case "startDebug":
        await this.actions.startGuidedDebug(
          typeof value.question === "string" ? value.question.trim() : undefined,
        );
        return;
      case "explain":
        await this.actions.explainPause(
          typeof value.question === "string" ? value.question.trim() : undefined,
        );
        return;
      case "configureModel":
        await this.actions.configureModelProvider();
        this.postState();
        return;
      case "showConversationHistory":
        await this.actions.showConversationHistory();
        return;
      case "revealNextRouteNode":
        this.store.revealNextRouteNode();
        return;
      case "copyCode":
        if (typeof value.code === "string" && value.code.length <= 20000) await vscode.env.clipboard.writeText(value.code);
        return;
      case "openSourceReference":
        if (typeof value.reference === "string") await this.actions.openSourceReference(value.reference);
        return;
      case "openFolder":
        await vscode.commands.executeCommand("vscode.openFolder");
        return;
      case "selectRouteNode": {
        const node = this.store
          .snapshot()
          .route?.nodes.find((candidate) => candidate.id === value.nodeId);
        if (node) {
          await this.actions.revealLocation(node.location);
        }
        return;
      }
      case "toggleBreakpoint": {
        const node = this.store
          .snapshot()
          .route?.nodes.find((candidate) => candidate.id === value.nodeId);
        if (node) {
          this.actions.toggleBreakpoint(node.location);
        }
        return;
      }
      case "selectPause":
        if (typeof value.pauseId === "string") {
          this.store.selectPause(value.pauseId);
        }
        return;
      case "selectFrame": {
        if (typeof value.frameId !== "number") {
          return;
        }
        const pause = this.store.selectedPause();
        const frame = pause?.frames.find((candidate) => candidate.id === value.frameId);
        if (frame?.location) {
          this.store.selectFrame(frame.id);
          await this.actions.revealLocation(frame.location, frame.id);
        }
        return;
      }
      case "debugCommand":
        if (!this.selectedPauseIsLive()) {
          void vscode.window.showInformationMessage(
            "Return to the current pause before continuing or stepping the debugger.",
          );
          return;
        }
        if (
          value.command === "continue" ||
          value.command === "stepInto" ||
          value.command === "stepOver"
        ) {
          await this.actions.runDebugCommand(value.command);
        }
        return;
      default:
        return;
    }
  }

  private selectedPauseIsLive(): boolean {
    const state = this.store.snapshot();
    return (
      state.debugStatus === "paused" &&
      !state.captureError &&
      this.store.selectedPause()?.id === state.pauses.at(-1)?.id
    );
  }

  private releaseManagedBreakpointsIfIdle(): void {
    const state = this.store.snapshot();
    if (state.requestKind !== "debug" && this.actions.canReleaseManagedBreakpoints()) {
      this.actions.releaseManagedBreakpoints();
    }
  }

}

function frameLocationLabel(frame: StackFrameSnapshot): string {
  return frame.location
    ? `${path.basename(frame.location.path)}:${frame.location.line}`
    : "无源码";
}

function displayFrameName(name: string): string {
  return name === "<module>" ? "模块入口" : name;
}

function emptyRenderedDiagnostics(): RenderedDiagnostics {
  return {
    chatMessageCount: 0,
    userMessageCount: 0,
    assistantMessageCount: 0,
    thinkingIndicatorCount: 0,
    thinkingLabelText: "",
    thinkingDotCount: 0,
    thinkingBackgroundImage: "",
    thinkingAnimationName: "",
    answerSkeletonCount: 0,
    chatRoleLabelCount: 0,
    richTextElementCount: 0,
    pauseExplanationSectionCount: 0,
    pauseRichTextElementCount: 0,
    runtimeEvidenceGroupCount: 0,
    variablePreviewCount: 0,
    variablePreviewMaxLength: 0,
    visibleTabCount: 1,
    pathTabVisible: false,
    stackTabVisible: false,
    variablesTabVisible: false,
    renderedRouteNodeCount: 0,
    renderedExplorationContextCount: 0,
    coreLocationCount: 0,
    coreLocationText: "",
    debugInvitationCount: 0,
    debugInvitationText: "",
    composerShortcutText: "",
    composerPlaceholderText: "",
    userMessageSurfaceDeclared: false,
    userMessageSurfaceDistinct: false,
    interactionMotion: emptyInteractionMotionDiagnostics(),
    contentMode: undefined,
    tutorMessageRendered: false,
  };
}

function parseRenderedDiagnostics(value: unknown): RenderedDiagnostics {
  if (value === null || typeof value !== "object") {
    return emptyRenderedDiagnostics();
  }
  const diagnostics = value as Partial<Record<keyof RenderedDiagnostics, unknown>>;
  return {
    chatMessageCount: numberDiagnostic(diagnostics.chatMessageCount),
    userMessageCount: numberDiagnostic(diagnostics.userMessageCount),
    assistantMessageCount: numberDiagnostic(diagnostics.assistantMessageCount),
    thinkingIndicatorCount: numberDiagnostic(diagnostics.thinkingIndicatorCount),
    thinkingLabelText: stringDiagnostic(diagnostics.thinkingLabelText),
    thinkingDotCount: numberDiagnostic(diagnostics.thinkingDotCount),
    thinkingBackgroundImage: stringDiagnostic(diagnostics.thinkingBackgroundImage),
    thinkingAnimationName: stringDiagnostic(diagnostics.thinkingAnimationName),
    answerSkeletonCount: numberDiagnostic(diagnostics.answerSkeletonCount),
    chatRoleLabelCount: numberDiagnostic(diagnostics.chatRoleLabelCount),
    richTextElementCount: numberDiagnostic(diagnostics.richTextElementCount),
    pauseExplanationSectionCount: numberDiagnostic(
      diagnostics.pauseExplanationSectionCount,
    ),
    pauseRichTextElementCount: numberDiagnostic(diagnostics.pauseRichTextElementCount),
    runtimeEvidenceGroupCount: numberDiagnostic(diagnostics.runtimeEvidenceGroupCount),
    variablePreviewCount: numberDiagnostic(diagnostics.variablePreviewCount),
    variablePreviewMaxLength: numberDiagnostic(diagnostics.variablePreviewMaxLength),
    visibleTabCount: numberDiagnostic(diagnostics.visibleTabCount),
    pathTabVisible: diagnostics.pathTabVisible === true,
    stackTabVisible: diagnostics.stackTabVisible === true,
    variablesTabVisible: diagnostics.variablesTabVisible === true,
    renderedRouteNodeCount: numberDiagnostic(diagnostics.renderedRouteNodeCount),
    renderedExplorationContextCount: numberDiagnostic(
      diagnostics.renderedExplorationContextCount,
    ),
    coreLocationCount: numberDiagnostic(diagnostics.coreLocationCount),
    coreLocationText: stringDiagnostic(diagnostics.coreLocationText),
    debugInvitationCount: numberDiagnostic(diagnostics.debugInvitationCount),
    debugInvitationText: stringDiagnostic(diagnostics.debugInvitationText),
    composerShortcutText:
      typeof diagnostics.composerShortcutText === "string"
        ? diagnostics.composerShortcutText
        : "",
    composerPlaceholderText: stringDiagnostic(diagnostics.composerPlaceholderText),
    userMessageSurfaceDeclared: diagnostics.userMessageSurfaceDeclared === true,
    userMessageSurfaceDistinct: diagnostics.userMessageSurfaceDistinct === true,
    interactionMotion: parseInteractionMotionDiagnostics(diagnostics.interactionMotion),
    contentMode:
      typeof diagnostics.contentMode === "string" ? diagnostics.contentMode : undefined,
    tutorMessageRendered: diagnostics.tutorMessageRendered === true,
  };
}

function numberDiagnostic(value: unknown): number {
  return typeof value === "number" ? value : 0;
}

function stringDiagnostic(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function emptyInteractionMotionDiagnostics(): InteractionMotionDiagnostics {
  return {
    actionTransitionProperty: "",
    actionTransitionDuration: "",
    sourceLinkTransitionProperty: "",
    tabTransitionDuration: "",
  };
}

function parseInteractionMotionDiagnostics(
  value: unknown,
): InteractionMotionDiagnostics {
  if (value === null || typeof value !== "object") {
    return emptyInteractionMotionDiagnostics();
  }
  const diagnostics = value as Partial<
    Record<keyof InteractionMotionDiagnostics, unknown>
  >;
  return {
    actionTransitionProperty: stringDiagnostic(diagnostics.actionTransitionProperty),
    actionTransitionDuration: stringDiagnostic(diagnostics.actionTransitionDuration),
    sourceLinkTransitionProperty: stringDiagnostic(
      diagnostics.sourceLinkTransitionProperty,
    ),
    tabTransitionDuration: stringDiagnostic(diagnostics.tabTransitionDuration),
  };
}

function closestRouteNodeId(
  nodes: readonly RouteNode[],
  frame: StackFrameSnapshot,
): string | undefined {
  if (!frame.location) {
    return undefined;
  }
  const framePath = normalizePath(frame.location.path);
  const sameFile = nodes.filter(
    (node) => normalizePath(node.location.path) === framePath,
  );
  return sameFile.reduce<RouteNode | undefined>((closest, node) => {
    if (!closest) {
      return node;
    }
    return Math.abs(node.location.line - frame.location!.line) <
      Math.abs(closest.location.line - frame.location!.line)
      ? node
      : closest;
  }, undefined)?.id;
}

function isWebviewMessage(value: unknown): value is WebviewMessage {
  return value !== null && typeof value === "object";
}
