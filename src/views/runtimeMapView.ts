import * as path from "node:path";
import * as vscode from "vscode";
import { normalizePath } from "../core/locations";
import { SessionStore } from "../core/sessionStore";
import { hasSourceBreakpoint } from "../debug/breakpoints";
import { SourceLocation, StackFrameSnapshot } from "../domain/model";

export interface RuntimeMapActions {
  locateRoute(question: string): Promise<void>;
  startGuidedDebug(question?: string): Promise<void>;
  explainPause(question?: string): Promise<void>;
  revealLocation(location: SourceLocation, frameId?: number): Promise<void>;
  toggleBreakpoint(location: SourceLocation): void;
  runDebugCommand(command: "continue" | "stepInto" | "stepOver"): Promise<void>;
}

interface WebviewMessage {
  readonly type?: unknown;
  readonly error?: unknown;
  readonly question?: unknown;
  readonly nodeId?: unknown;
  readonly pauseId?: unknown;
  readonly frameId?: unknown;
  readonly command?: unknown;
  readonly version?: unknown;
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
  private readonly disposables: vscode.Disposable[] = [];

  public constructor(
    private readonly extensionUri: vscode.Uri,
    private readonly store: SessionStore,
    private readonly actions: RuntimeMapActions,
  ) {
    this.disposables.push(
      store.onDidChange(() => this.postState()),
      vscode.debug.onDidChangeBreakpoints(() => this.postState()),
    );
  }

  public resolveWebviewView(view: vscode.WebviewView): void {
    this.view = view;
    view.webview.options = {
      enableScripts: true,
      localResourceRoots: [this.extensionUri],
    };
    view.webview.html = createHtml(view.webview);
    this.disposables.push(
      view.webview.onDidReceiveMessage((message: unknown) => this.handleMessage(message)),
      view.onDidDispose(() => {
        if (this.view === view) {
          this.view = undefined;
          this.lastSentFrameCount = 0;
          this.lastAcknowledgedFrameCount = 0;
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
    };
  }

  public showForSmoke(): boolean {
    if (!this.view) {
      return false;
    }
    this.view.show(true);
    return this.view.visible;
  }

  private postState(): void {
    if (!this.view) {
      return;
    }
    const state = this.store.snapshot();
    const currentPause = this.store.selectedPause();
    const currentPaths = new Set(
      (currentPause?.frames ?? [])
        .flatMap((frame) => (frame.location ? [normalizePath(frame.location.path)] : [])),
    );
    const executedPaths = new Set(
      state.pauses.flatMap((pause) =>
        pause.frames.flatMap((frame) =>
          frame.location ? [normalizePath(frame.location.path)] : [],
        ),
      ),
    );
    const route = state.route
      ? {
          ...state.route,
          nodes: state.route.nodes.map((node) => ({
            ...node,
            fileLabel: vscode.workspace.asRelativePath(node.location.path, false),
            breakpoint: hasSourceBreakpoint(node.location),
            executed: executedPaths.has(normalizePath(node.location.path)),
            active: currentPaths.has(normalizePath(node.location.path)),
          })),
        }
      : undefined;
    const pauses = state.pauses.map((pause) => ({
      id: pause.id,
      reason: pause.reason,
      recordedAt: pause.recordedAt,
      frameCount: pause.frames.length,
      variableCount: pause.variables.length,
      label: pause.frames[0]
        ? `${pause.frames[0].name} · ${frameLocationLabel(pause.frames[0])}`
        : pause.reason,
      selected: pause.id === currentPause?.id,
    }));
    const frames = (currentPause?.frames ?? []).map((frame, index) => ({
      ...frame,
      index,
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
        debugging: Boolean(state.debugSessionId),
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
        }
        return;
      case "scriptError":
        this.scriptError = typeof value.error === "string" ? value.error : "unknown script error";
        return;
      case "locateRoute":
        if (typeof value.question === "string" && value.question.trim()) {
          await this.actions.locateRoute(value.question.trim());
        }
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
}

function frameLocationLabel(frame: StackFrameSnapshot): string {
  return frame.location
    ? `${path.basename(frame.location.path)}:${frame.location.line}`
    : "no source";
}

function isWebviewMessage(value: unknown): value is WebviewMessage {
  return value !== null && typeof value === "object";
}

function createHtml(webview: vscode.Webview): string {
  const nonce = getNonce();
  return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource} 'unsafe-inline'; script-src 'nonce-${nonce}';">
  <title>Code Cat Runtime Map</title>
  <style>
    :root {
      color-scheme: light dark;
      --cc-bg: #ffffff;
      --cc-panel: #f5f5f7;
      --cc-panel-strong: #eeeef1;
      --cc-border: #e0e0e3;
      --cc-ink: #18181b;
      --cc-muted: #66666f;
      --cc-faint: #71717a;
      --cc-primary: #2563eb;
      --cc-primary-soft: #e8efff;
      --cc-success: #16a34a;
      --cc-success-soft: #e8f7ee;
      --cc-danger: #dc2626;
      --cc-strong: #18181b;
      --cc-on-strong: #ffffff;
      --cc-focus: #2563eb;
      --cc-radius: 10px;
      --cc-ease: cubic-bezier(.16, 1, .3, 1);
    }
    body.vscode-dark {
      --cc-bg: var(--vscode-sideBar-background, #18181b);
      --cc-panel: var(--vscode-editorWidget-background, #242427);
      --cc-panel-strong: var(--vscode-input-background, #2d2d31);
      --cc-border: var(--vscode-panel-border, #3f3f46);
      --cc-ink: var(--vscode-foreground, #f4f4f5);
      --cc-muted: var(--vscode-descriptionForeground, #b4b4bc);
      --cc-faint: #a1a1aa;
      --cc-primary: #4f8cff;
      --cc-primary-soft: #1d2b49;
      --cc-success: #3fcf72;
      --cc-success-soft: #173623;
      --cc-strong: #f4f4f5;
      --cc-on-strong: #18181b;
    }
    * { box-sizing: border-box; }
    html, body { min-height: 100%; }
    body {
      margin: 0;
      color: var(--cc-ink);
      background: var(--cc-bg);
      font: 13px/1.5 var(--vscode-font-family, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif);
      -webkit-font-smoothing: antialiased;
    }
    button, textarea { font: inherit; }
    button { cursor: pointer; }
    button:disabled { cursor: default; opacity: .55; }
    button:focus-visible, textarea:focus-visible {
      outline: 2px solid var(--cc-focus);
      outline-offset: 2px;
    }
    .app { min-height: 100vh; display: flex; flex-direction: column; }
    .shell { width: 100%; max-width: 840px; margin: 0 auto; }
    .app-header {
      position: sticky;
      top: 0;
      z-index: 20;
      padding: 14px 16px 0;
      background: var(--cc-bg);
      border-bottom: 1px solid var(--cc-border);
    }
    .title-row { display: flex; align-items: flex-start; justify-content: space-between; gap: 12px; }
    .title-copy { min-width: 0; }
    .product-name { margin: 0; font-size: 14px; font-weight: 720; text-wrap: balance; }
    .session-title { margin: 2px 0 0; color: var(--cc-muted); font-size: 12px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .session-status { display: flex; align-items: center; gap: 7px; min-width: 0; margin-top: 8px; color: var(--cc-muted); font-size: 12px; }
    .status-dot { flex: 0 0 auto; width: 8px; height: 8px; border-radius: 50%; background: var(--cc-faint); }
    .status-dot.primary { background: var(--cc-primary); }
    .status-dot.success { background: var(--cc-success); }
    .status-label { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .header-mark {
      display: grid;
      place-items: center;
      flex: 0 0 auto;
      width: 36px;
      height: 36px;
      color: var(--cc-primary);
      background: var(--cc-primary-soft);
      border-radius: 9px;
      font-size: 17px;
      font-weight: 800;
    }
    .tabs { display: flex; gap: 4px; margin-top: 14px; overflow-x: auto; scrollbar-width: none; }
    .tabs::-webkit-scrollbar { display: none; }
    .tab {
      position: relative;
      flex: 0 0 auto;
      min-height: 36px;
      padding: 8px 10px 10px;
      color: var(--cc-muted);
      background: transparent;
      border: 0;
      border-bottom: 2px solid transparent;
      font-weight: 620;
    }
    .tab:hover { color: var(--cc-ink); }
    .tab[aria-selected="true"] { color: var(--cc-primary); border-bottom-color: var(--cc-primary); }
    .tab-count { margin-left: 4px; color: var(--cc-faint); font-size: 11px; font-variant-numeric: tabular-nums; }
    .pause-rail { display: none; gap: 6px; padding: 10px 16px; overflow-x: auto; background: var(--cc-bg); border-bottom: 1px solid var(--cc-border); }
    .pause-rail.visible { display: flex; }
    .pause-chip {
      flex: 0 0 auto;
      max-width: 210px;
      padding: 5px 9px;
      overflow: hidden;
      color: var(--cc-muted);
      background: var(--cc-panel);
      border: 1px solid transparent;
      border-radius: 999px;
      text-overflow: ellipsis;
      white-space: nowrap;
      font-size: 11px;
    }
    .pause-chip:hover { color: var(--cc-ink); }
    .pause-chip.selected { color: var(--cc-primary); background: var(--cc-primary-soft); border-color: var(--cc-primary); }
    main { flex: 1; width: 100%; max-width: 840px; margin: 0 auto; padding: 18px 16px 32px; }
    .view { animation: reveal 180ms var(--cc-ease); }
    .section-heading { display: flex; align-items: center; justify-content: space-between; gap: 12px; margin-bottom: 10px; }
    .section-heading h2 { margin: 0; font-size: 14px; font-weight: 720; text-wrap: balance; }
    .section-heading p { margin: 2px 0 0; color: var(--cc-muted); font-size: 12px; }
    .step-label { display: flex; align-items: center; gap: 8px; color: var(--cc-muted); font-size: 12px; font-weight: 650; }
    .step-icon { display: grid; place-items: center; width: 26px; height: 26px; color: var(--cc-primary); background: var(--cc-primary-soft); border-radius: 7px; }
    .source-link {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 10px;
      width: 100%;
      margin-top: 12px;
      padding: 10px 12px;
      color: var(--cc-primary);
      background: var(--cc-panel);
      border: 0;
      border-radius: 8px;
      text-align: left;
    }
    .source-link:hover { background: var(--cc-panel-strong); }
    .source-name { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-family: var(--vscode-editor-font-family, ui-monospace, monospace); font-weight: 650; }
    .lesson-copy { margin: 16px 0; max-width: 70ch; color: var(--cc-ink); font-size: 14px; white-space: pre-wrap; text-wrap: pretty; }
    .notice { padding: 12px; color: var(--cc-muted); background: var(--cc-panel); border-radius: var(--cc-radius); }
    .notice.error { color: var(--vscode-errorForeground, var(--cc-danger)); }
    .evidence-copy { margin: 0; color: var(--cc-muted); text-wrap: pretty; }
    .evidence {
      margin-top: 14px;
      padding: 12px;
      background: var(--cc-panel);
      border: 1px solid var(--cc-border);
      border-radius: var(--cc-radius);
    }
    .evidence-head { display: flex; align-items: center; justify-content: space-between; gap: 12px; margin-bottom: 8px; }
    .evidence-title { display: flex; align-items: center; gap: 7px; color: var(--cc-muted); font-size: 12px; font-weight: 650; }
    .evidence-dot { width: 7px; height: 7px; border-radius: 50%; background: var(--cc-primary); }
    .text-action { padding: 3px; color: var(--cc-primary); background: transparent; border: 0; }
    .text-action:hover { text-decoration: underline; }
    .variable-preview { display: grid; grid-template-columns: minmax(90px, .7fr) minmax(0, 1fr); gap: 6px 12px; margin: 0; }
    .variable-preview dt { color: var(--cc-muted); overflow-wrap: anywhere; }
    .variable-preview dd { margin: 0; overflow-wrap: anywhere; font-family: var(--vscode-editor-font-family, ui-monospace, monospace); }
    .action-row { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 16px; }
    .action {
      min-height: 38px;
      padding: 8px 14px;
      color: var(--cc-on-strong);
      background: var(--cc-strong);
      border: 0;
      border-radius: 6px;
      font-weight: 650;
    }
    .action:hover { filter: brightness(.92); }
    .action.primary { color: #fff; background: var(--cc-primary); }
    .action.quiet { color: var(--cc-muted); background: transparent; }
    .action.quiet:hover { color: var(--cc-ink); background: var(--cc-panel); filter: none; }
    .tags { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 16px; }
    .tag { padding: 4px 8px; color: var(--cc-muted); background: var(--cc-panel); border-radius: 4px; font-size: 11px; }
    .tag.current { color: var(--cc-primary); background: var(--cc-primary-soft); }
    .empty-state { display: grid; place-items: center; min-height: 330px; text-align: center; }
    .empty-copy { max-width: 360px; }
    .empty-symbol { display: grid; place-items: center; width: 54px; height: 54px; margin: 0 auto 18px; color: var(--cc-primary); background: var(--cc-primary-soft); border-radius: 14px; font-size: 24px; }
    .empty-state h2 { margin: 0 0 8px; font-size: 17px; }
    .empty-state p { margin: 0; color: var(--cc-muted); text-wrap: pretty; }
    .route-summary { margin-bottom: 16px; padding: 12px; color: var(--cc-muted); background: var(--cc-panel); border-radius: var(--cc-radius); }
    .legend { display: flex; flex-wrap: wrap; gap: 10px 14px; margin-bottom: 14px; color: var(--cc-muted); font-size: 11px; }
    .legend-item { display: flex; align-items: center; gap: 5px; }
    .legend-swatch { width: 9px; height: 9px; border-radius: 3px; background: var(--cc-panel-strong); border: 1px solid var(--cc-border); }
    .legend-swatch.current { background: var(--cc-primary); border-color: var(--cc-primary); }
    .legend-swatch.executed { background: var(--cc-muted); border-color: var(--cc-muted); }
    .legend-swatch.breakpoint { border-radius: 50%; background: var(--cc-danger); border-color: var(--cc-danger); }
    .path-scroll { overflow-x: auto; padding: 8px 2px 18px; }
    .path-flow { display: flex; align-items: stretch; width: max-content; min-width: 100%; }
    .path-node-wrap { position: relative; display: flex; align-items: center; padding-right: 30px; }
    .path-node-wrap:not(:last-child)::after { content: ''; position: absolute; top: 50%; right: 0; width: 30px; height: 2px; background: var(--cc-border); }
    .path-node-wrap.executed:not(:last-child)::after,
    .path-node-wrap.active:not(:last-child)::after { background: var(--cc-primary); }
    .path-node {
      width: 190px;
      min-height: 122px;
      padding: 12px;
      color: var(--cc-ink);
      background: var(--cc-bg);
      border: 1px dashed var(--cc-border);
      border-radius: var(--cc-radius);
      text-align: left;
    }
    .path-node:hover { border-color: var(--cc-primary); }
    .path-node.executed { border-style: solid; }
    .path-node.active { background: var(--cc-primary-soft); border: 2px solid var(--cc-primary); }
    .path-kicker { display: flex; align-items: center; justify-content: space-between; gap: 8px; color: var(--cc-muted); font-size: 10px; }
    .path-index { color: var(--cc-primary); font-variant-numeric: tabular-nums; }
    .path-title { display: block; margin-top: 8px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 14px; font-weight: 700; }
    .path-file { display: block; margin-top: 5px; overflow: hidden; color: var(--cc-muted); text-overflow: ellipsis; white-space: nowrap; font-family: var(--vscode-editor-font-family, ui-monospace, monospace); font-size: 11px; }
    .path-reason { display: -webkit-box; margin-top: 8px; overflow: hidden; color: var(--cc-muted); font-size: 11px; -webkit-box-orient: vertical; -webkit-line-clamp: 2; }
    .breakpoint-control {
      position: absolute;
      top: 8px;
      right: 38px;
      z-index: 2;
      width: 24px;
      height: 24px;
      padding: 0;
      color: var(--cc-faint);
      background: var(--cc-bg);
      border: 1px solid var(--cc-border);
      border-radius: 50%;
    }
    .breakpoint-control:hover, .breakpoint-control.on { color: var(--cc-danger); border-color: var(--cc-danger); }
    .stack-list, .variable-list { background: var(--cc-panel); border-radius: var(--cc-radius); overflow: hidden; }
    .stack-frame { display: grid; grid-template-columns: 32px minmax(0, 1fr) auto; align-items: center; gap: 8px; width: 100%; min-height: 52px; padding: 9px 12px; color: var(--cc-ink); background: transparent; border: 0; border-bottom: 1px solid var(--cc-border); text-align: left; }
    .stack-frame:last-child { border-bottom: 0; }
    .stack-frame:hover { background: var(--cc-panel-strong); }
    .stack-frame.selected { color: var(--cc-primary); background: var(--cc-primary-soft); }
    .frame-number { color: var(--cc-faint); font-family: var(--vscode-editor-font-family, ui-monospace, monospace); font-size: 11px; }
    .frame-copy { min-width: 0; }
    .frame-name { display: block; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-weight: 650; }
    .frame-file { display: block; overflow: hidden; color: var(--cc-muted); text-overflow: ellipsis; white-space: nowrap; font-family: var(--vscode-editor-font-family, ui-monospace, monospace); font-size: 11px; }
    .frame-arrow { color: var(--cc-faint); }
    .variable-row { display: grid; grid-template-columns: minmax(90px, .65fr) minmax(0, 1.35fr); gap: 12px; padding: 11px 12px; border-bottom: 1px solid var(--cc-border); }
    .variable-row:last-child { border-bottom: 0; }
    .variable-key { min-width: 0; }
    .variable-name { display: block; overflow-wrap: anywhere; color: var(--cc-primary); font-family: var(--vscode-editor-font-family, ui-monospace, monospace); font-weight: 650; }
    .variable-type { display: block; margin-top: 2px; color: var(--cc-faint); font-size: 10px; }
    .variable-value { overflow-wrap: anywhere; font-family: var(--vscode-editor-font-family, ui-monospace, monospace); }
    .complete { max-width: 540px; margin: 80px auto 0; text-align: center; }
    .complete-mark { display: grid; place-items: center; width: 56px; height: 56px; margin: 0 auto 20px; color: var(--cc-success); background: var(--cc-success-soft); border-radius: 50%; font-size: 28px; }
    .complete h2 { margin: 0; font-size: 20px; }
    .complete p { margin: 8px 0 0; color: var(--cc-muted); }
    .complete-stats { margin: 24px 0 16px; padding: 14px 16px; background: var(--cc-panel); border-radius: var(--cc-radius); text-align: left; }
    .stat { display: flex; align-items: center; justify-content: space-between; gap: 16px; padding: 5px 0; }
    .stat-label { color: var(--cc-muted); }
    .stat-value { font-weight: 700; font-variant-numeric: tabular-nums; }
    .skeleton { overflow: hidden; }
    .skeleton-line { height: 14px; margin: 10px 0; background: var(--cc-panel); border-radius: 4px; }
    .skeleton-line.short { width: 42%; }
    .skeleton-line.medium { width: 68%; }
    .skeleton-block { height: 118px; margin-top: 20px; background: var(--cc-panel); border-radius: var(--cc-radius); }
    .busy-label { color: var(--cc-primary); font-weight: 650; }
    .composer {
      position: sticky;
      bottom: 0;
      z-index: 20;
      margin-top: auto;
      padding: 12px 16px 14px;
      background: var(--cc-bg);
      border-top: 1px solid var(--cc-border);
    }
    .composer-inner { display: flex; align-items: flex-end; gap: 8px; width: 100%; max-width: 808px; margin: 0 auto; padding: 7px; background: var(--cc-strong); border-radius: 9px; }
    .composer textarea { flex: 1; min-width: 0; min-height: 38px; max-height: 110px; padding: 9px 8px; resize: vertical; color: var(--cc-on-strong); background: transparent; border: 0; line-height: 1.35; }
    .composer textarea::placeholder { color: color-mix(in srgb, var(--cc-on-strong) 68%, transparent); opacity: 1; }
    .composer textarea:focus-visible { outline: 0; }
    .send {
      display: grid;
      place-items: center;
      flex: 0 0 auto;
      width: 38px;
      height: 38px;
      padding: 0;
      color: #fff;
      background: var(--cc-primary);
      border: 0;
      border-radius: 7px;
      font-size: 18px;
    }
    .send:hover { filter: brightness(.94); }
    .composer-hint { max-width: 808px; margin: 6px auto 0; color: var(--cc-faint); text-align: center; font-size: 10px; }
    @keyframes reveal { from { opacity: .65; transform: translateY(3px); } to { opacity: 1; transform: none; } }
    @media (min-width: 620px) {
      .app-header { padding-inline: 22px; }
      main { padding: 24px 22px 40px; }
      .pause-rail { padding-inline: 22px; }
      .composer { padding-inline: 22px; }
      .overview-grid { display: grid; grid-template-columns: minmax(0, 1.3fr) minmax(220px, .7fr); gap: 16px; align-items: start; }
      .overview-grid .evidence { margin-top: 0; }
    }
    @media (prefers-reduced-motion: reduce) {
      *, *::before, *::after { scroll-behavior: auto !important; animation-duration: .01ms !important; transition-duration: .01ms !important; }
    }
  </style>
</head>
<body>
  <div class="app">
    <header class="app-header">
      <div class="shell">
        <div class="title-row">
          <div class="title-copy">
            <h1 class="product-name">Code Cat</h1>
            <p id="session-title" class="session-title">Python 代码阅读助手</p>
            <div class="session-status" aria-live="polite">
              <span id="status-dot" class="status-dot"></span>
              <span id="status-label" class="status-label">提出问题，建立第一条代码路径</span>
            </div>
          </div>
          <div class="header-mark" aria-hidden="true">⌁</div>
        </div>
        <nav id="tabs" class="tabs" aria-label="Code Cat 视图">
          <button type="button" class="tab" data-tab="overview" aria-selected="true">当前步骤</button>
          <button type="button" class="tab" data-tab="path" aria-selected="false">执行路径<span id="path-count" class="tab-count"></span></button>
          <button type="button" class="tab" data-tab="stack" aria-selected="false">调用栈<span id="stack-count" class="tab-count"></span></button>
          <button type="button" class="tab" data-tab="variables" aria-selected="false">变量<span id="variable-count" class="tab-count"></span></button>
        </nav>
      </div>
    </header>
    <div id="pause-rail" class="pause-rail shell" aria-label="暂停历史"></div>
    <main id="content"></main>
    <footer class="composer">
      <div class="composer-inner">
        <textarea id="question" rows="1" aria-label="代码问题" placeholder="为什么停在这里？或者输入新的代码问题"></textarea>
        <button id="locate" type="button" class="send" aria-label="定位代码路径" title="定位代码路径">↑</button>
      </div>
      <div id="composer-hint" class="composer-hint">⌘/Ctrl + Enter 定位代码路径</div>
    </footer>
  </div>

  <template id="debug-actions">
    <div class="action-row">
      <button type="button" class="action primary" data-debug="continue">继续</button>
      <button type="button" class="action" data-debug="stepInto">进入函数</button>
      <button type="button" class="action" data-debug="stepOver">跳过此层</button>
      <button type="button" class="action quiet" data-action="explain">详细解释</button>
    </div>
  </template>

  <script nonce="${nonce}">
    const vscode = acquireVsCodeApi();
    window.addEventListener('error', (event) => {
      vscode.postMessage({ type: 'scriptError', error: String(event.error || event.message) });
    });
    const elements = {
      content: document.getElementById('content'),
      composerHint: document.getElementById('composer-hint'),
      pathCount: document.getElementById('path-count'),
      pauseRail: document.getElementById('pause-rail'),
      question: document.getElementById('question'),
      sessionTitle: document.getElementById('session-title'),
      stackCount: document.getElementById('stack-count'),
      statusDot: document.getElementById('status-dot'),
      statusLabel: document.getElementById('status-label'),
      tabs: document.getElementById('tabs'),
      variableCount: document.getElementById('variable-count'),
    };
    let activeTab = 'overview';
    let currentState = {
      route: undefined,
      pauses: [],
      frames: [],
      variables: [],
      tutorMessage: undefined,
      busyMessage: undefined,
      debugging: false,
    };

    document.getElementById('locate').addEventListener('click', submitQuestion);
    elements.question.addEventListener('keydown', (event) => {
      if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
        event.preventDefault();
        submitQuestion();
      }
    });
    elements.tabs.addEventListener('click', (event) => {
      const tab = event.target.closest('[data-tab]');
      if (!tab) return;
      activeTab = tab.dataset.tab;
      render(currentState);
    });

    window.addEventListener('message', (event) => {
      if (event.data?.type === 'state') {
        currentState = event.data.state;
        render(currentState);
        vscode.postMessage({ type: 'renderedState', version: event.data.version });
      }
    });

    function render(state) {
      const route = state.route;
      const frames = state.frames || [];
      const variables = state.variables || [];
      const pauses = state.pauses || [];
      if (route && !elements.question.value) elements.question.value = route.question;
      elements.sessionTitle.textContent = route?.question || 'Python 代码阅读助手';
      elements.pathCount.textContent = route ? String(route.nodes.length) : '';
      elements.stackCount.textContent = frames.length ? String(frames.length) : '';
      elements.variableCount.textContent = variables.length ? String(variables.length) : '';
      updateStatus(state);
      updateTabs();
      renderPauseRail(pauses);
      elements.content.replaceChildren();
      const view = document.createElement('div');
      view.className = 'view';
      elements.composerHint.textContent = frames.length
        ? '当前暂停追问 · ⌘/Ctrl + Enter 发送'
        : '⌘/Ctrl + Enter 定位代码路径';
      if (state.busyMessage) renderBusy(view, state.busyMessage, state);
      else if (activeTab === 'path') renderPath(view, route);
      else if (activeTab === 'stack') renderStack(view, frames);
      else if (activeTab === 'variables') renderVariables(view, variables);
      else renderOverview(view, state);
      elements.content.appendChild(view);
    }

    function submitQuestion() {
      const question = elements.question.value.trim();
      if (!question) {
        elements.question.focus();
        return;
      }
      if ((currentState.frames || []).length) {
        vscode.postMessage({ type: 'explain', question });
      } else {
        vscode.postMessage({ type: 'locateRoute', question });
      }
    }

    function updateTabs() {
      elements.tabs.querySelectorAll('[data-tab]').forEach((tab) => {
        tab.setAttribute('aria-selected', String(tab.dataset.tab === activeTab));
      });
    }

    function updateStatus(state) {
      const pauses = state.pauses || [];
      const frames = state.frames || [];
      const selectedPauseIndex = Math.max(0, pauses.findIndex((pause) => pause.selected));
      elements.statusDot.className = 'status-dot';
      if (state.busyMessage) {
        elements.statusDot.classList.add('primary');
        elements.statusLabel.textContent = state.busyMessage;
      } else if (!state.debugging && pauses.length) {
        elements.statusDot.classList.add('success');
        elements.statusLabel.textContent = 'Python · 本次阅读完成';
      } else if (frames.length) {
        elements.statusDot.classList.add('primary');
        elements.statusLabel.textContent = '已捕获 ' + frames[0].fileLabel + ' · ' + (selectedPauseIndex + 1) + '/' + pauses.length;
      } else if (state.debugging) {
        elements.statusDot.classList.add('primary');
        elements.statusLabel.textContent = '调试已连接，等待命中断点';
      } else if (state.route) {
        elements.statusDot.classList.add('primary');
        elements.statusLabel.textContent = '已规划 ' + state.route.nodes.length + ' 个关键节点';
      } else {
        elements.statusLabel.textContent = '提出问题，建立第一条代码路径';
      }
    }

    function renderPauseRail(pauses) {
      elements.pauseRail.replaceChildren();
      elements.pauseRail.classList.toggle('visible', pauses.length > 0);
      pauses.forEach((pause, index) => {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'pause-chip' + (pause.selected ? ' selected' : '');
        button.textContent = String(index + 1).padStart(2, '0') + ' · ' + pause.label;
        button.title = pause.label;
        button.addEventListener('click', () => vscode.postMessage({ type: 'selectPause', pauseId: pause.id }));
        elements.pauseRail.appendChild(button);
      });
    }

    function renderBusy(root, message, state) {
      const title = (state.frames || []).length ? '正在解释当前暂停' : '正在理解项目';
      const heading = sectionHeading(title, message);
      const skeleton = document.createElement('div');
      skeleton.className = 'skeleton';
      skeleton.innerHTML = '<div class="skeleton-line short"></div><div class="skeleton-line medium"></div><div class="skeleton-line"></div><div class="skeleton-block"></div>';
      root.append(heading, skeleton);
    }

    function renderOverview(root, state) {
      const route = state.route;
      const pauses = state.pauses || [];
      const frames = state.frames || [];
      if (!state.debugging && pauses.length) {
        renderComplete(root, state);
      } else if (frames.length) {
        renderPausedOverview(root, state);
      } else if (route) {
        renderRouteReady(root, state);
      } else {
        renderEmpty(root);
      }
    }

    function renderEmpty(root) {
      const empty = document.createElement('section');
      empty.className = 'empty-state';
      empty.innerHTML = '<div class="empty-copy"><div class="empty-symbol">⌁</div><h2>从一个真实问题开始</h2><p>Code Cat 会先规划候选阅读路径，再用断点、调用栈和变量把猜测替换成运行时证据。</p></div>';
      root.appendChild(empty);
    }

    function renderRouteReady(root, state) {
      const route = state.route;
      const heading = sectionHeading('阅读路线已准备', route.nodes.length + ' 个关键节点');
      const summary = document.createElement('p');
      summary.className = 'lesson-copy';
      summary.textContent = state.tutorMessage?.markdown || route.summary;
      const evidence = document.createElement('div');
      evidence.className = 'evidence';
      const linked = route.nodes.filter((node) => node.breakpoint).length;
      evidence.innerHTML = '<div class="evidence-head"><div class="evidence-title"><span class="evidence-dot"></span>调试准备</div></div>';
      const prep = document.createElement('p');
      prep.className = 'evidence-copy';
      prep.textContent = linked
        ? '已有 ' + linked + ' 个节点联动断点，可以开始教学调试。'
        : '先到“执行路径”选择关键节点并联动断点，再开始调试。';
      evidence.appendChild(prep);
      const actions = document.createElement('div');
      actions.className = 'action-row';
      actions.append(
        actionButton('查看执行路径', 'primary', () => switchTab('path')),
        actionButton('开始教学调试', '', () => vscode.postMessage({ type: 'startDebug', question: route.question })),
      );
      root.append(heading, summary, evidence, actions);
    }

    function renderPausedOverview(root, state) {
      const route = state.route;
      const frames = state.frames || [];
      const variables = state.variables || [];
      const frame = frames.find((candidate) => candidate.selected) || frames[0];
      const node = currentRouteNode(route, frame);
      const nodeIndex = route && node ? route.nodes.findIndex((candidate) => candidate.id === node.id) : -1;
      const heading = document.createElement('div');
      heading.className = 'step-label';
      const stepIcon = document.createElement('span');
      stepIcon.className = 'step-icon';
      stepIcon.textContent = '⌁';
      const stepText = document.createElement('span');
      stepText.textContent = nodeIndex >= 0 ? '第 ' + (nodeIndex + 1) + ' 步 · ' + node.title : '当前运行时断点';
      heading.append(stepIcon, stepText);
      const source = document.createElement('button');
      source.type = 'button';
      source.className = 'source-link';
      const sourceName = document.createElement('span');
      sourceName.className = 'source-name';
      sourceName.textContent = node ? node.fileLabel + ':' + node.location.line : frame.fileLabel;
      const sourceArrow = document.createElement('span');
      sourceArrow.textContent = '→';
      source.append(sourceName, sourceArrow);
      source.addEventListener('click', () => {
        if (node) vscode.postMessage({ type: 'selectRouteNode', nodeId: node.id });
        else vscode.postMessage({ type: 'selectFrame', frameId: frame.id });
      });
      const grid = document.createElement('div');
      grid.className = 'overview-grid';
      const lesson = document.createElement('div');
      const copy = document.createElement('p');
      copy.className = 'lesson-copy';
      if (state.tutorMessage?.kind === 'error') copy.classList.add('notice', 'error');
      copy.textContent = state.tutorMessage?.markdown || node?.reason || '调试器已经在真实代码路径中暂停。先观察当前变量和调用栈，再决定继续、进入函数或跳过此层。';
      lesson.append(heading, source, copy);
      appendDebugActions(lesson);
      const evidence = variableEvidence(variables);
      grid.append(lesson, evidence);
      const tags = document.createElement('div');
      tags.className = 'tags';
      tags.append(tag('Current file', 'current'), tag('Debug session', ''), tag(frames.length + ' frames', ''));
      root.append(grid, tags);
    }

    function variableEvidence(variables) {
      const evidence = document.createElement('section');
      evidence.className = 'evidence';
      const head = document.createElement('div');
      head.className = 'evidence-head';
      head.innerHTML = '<div class="evidence-title"><span class="evidence-dot"></span>当前观察</div>';
      const more = document.createElement('button');
      more.type = 'button';
      more.className = 'text-action';
      more.textContent = variables.length ? '查看全部' : '等待变量';
      more.disabled = variables.length === 0;
      more.addEventListener('click', () => switchTab('variables'));
      head.appendChild(more);
      evidence.appendChild(head);
      if (!variables.length) {
        const empty = document.createElement('div');
        empty.className = 'evidence-copy';
        empty.textContent = '当前暂停没有可展示的顶层变量。';
        evidence.appendChild(empty);
        return evidence;
      }
      const list = document.createElement('dl');
      list.className = 'variable-preview';
      variables.slice(0, 4).forEach((variable) => {
        const name = document.createElement('dt');
        const value = document.createElement('dd');
        name.textContent = variable.name;
        value.textContent = variable.value;
        list.append(name, value);
      });
      evidence.appendChild(list);
      return evidence;
    }

    function appendDebugActions(root) {
      const fragment = document.getElementById('debug-actions').content.cloneNode(true);
      fragment.querySelectorAll('[data-debug]').forEach((button) => {
        button.addEventListener('click', () => vscode.postMessage({ type: 'debugCommand', command: button.dataset.debug }));
      });
      fragment.querySelector('[data-action="explain"]').addEventListener('click', () => vscode.postMessage({ type: 'explain' }));
      root.appendChild(fragment);
    }

    function renderPath(root, route) {
      root.appendChild(sectionHeading('Code Reading Map', route ? route.nodes.length + ' 个候选节点' : '尚未生成路径'));
      if (!route) {
        root.appendChild(emptyNotice('先在底部输入一个项目问题，Code Cat 会生成 3–8 个候选阅读节点。'));
        return;
      }
      const summary = document.createElement('div');
      summary.className = 'route-summary';
      summary.textContent = route.summary;
      const legend = document.createElement('div');
      legend.className = 'legend';
      legend.innerHTML = '<span class="legend-item"><span class="legend-swatch current"></span>当前</span><span class="legend-item"><span class="legend-swatch executed"></span>已执行</span><span class="legend-item"><span class="legend-swatch breakpoint"></span>断点</span><span class="legend-item"><span class="legend-swatch"></span>候选</span>';
      const scroll = document.createElement('div');
      scroll.className = 'path-scroll';
      const flow = document.createElement('div');
      flow.className = 'path-flow';
      route.nodes.forEach((node, index) => flow.appendChild(pathNode(node, index)));
      scroll.appendChild(flow);
      root.append(summary, legend, scroll);
    }

    function pathNode(node, index) {
      const wrap = document.createElement('div');
      wrap.className = 'path-node-wrap' + (node.executed ? ' executed' : '') + (node.active ? ' active' : '');
      const open = document.createElement('button');
      open.type = 'button';
      open.className = 'path-node' + (node.executed ? ' executed' : '') + (node.active ? ' active' : '');
      const kicker = document.createElement('span');
      kicker.className = 'path-kicker';
      const stateLabel = node.active ? 'CURRENT' : node.executed ? 'EXECUTED' : 'CANDIDATE';
      kicker.innerHTML = '<span>' + stateLabel + '</span><span class="path-index">' + String(index + 1).padStart(2, '0') + '</span>';
      const title = document.createElement('span');
      title.className = 'path-title';
      title.textContent = node.title;
      const file = document.createElement('span');
      file.className = 'path-file';
      file.textContent = node.fileLabel + ':' + node.location.line;
      const reason = document.createElement('span');
      reason.className = 'path-reason';
      reason.textContent = node.reason;
      open.append(kicker, title, file, reason);
      open.addEventListener('click', () => vscode.postMessage({ type: 'selectRouteNode', nodeId: node.id }));
      const breakpoint = document.createElement('button');
      breakpoint.type = 'button';
      breakpoint.className = 'breakpoint-control' + (node.breakpoint ? ' on' : '');
      breakpoint.textContent = '●';
      breakpoint.title = node.breakpoint ? '移除联动断点' : '添加联动断点';
      breakpoint.setAttribute('aria-label', breakpoint.title);
      breakpoint.addEventListener('click', () => vscode.postMessage({ type: 'toggleBreakpoint', nodeId: node.id }));
      wrap.append(open, breakpoint);
      return wrap;
    }

    function renderStack(root, frames) {
      root.appendChild(sectionHeading('调用栈', frames.length ? frames.length + ' 层真实调用' : '等待调试器暂停'));
      if (!frames.length) {
        root.appendChild(emptyNotice('命中断点后，这里会按调试器顺序显示真实调用栈。'));
        return;
      }
      const list = document.createElement('div');
      list.className = 'stack-list';
      frames.forEach((frame) => {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'stack-frame' + (frame.selected ? ' selected' : '');
        const number = document.createElement('span');
        number.className = 'frame-number';
        number.textContent = '#' + frame.index;
        const copy = document.createElement('span');
        copy.className = 'frame-copy';
        const name = document.createElement('span');
        name.className = 'frame-name';
        name.textContent = frame.name;
        const file = document.createElement('span');
        file.className = 'frame-file';
        file.textContent = frame.fileLabel;
        copy.append(name, file);
        const arrow = document.createElement('span');
        arrow.className = 'frame-arrow';
        arrow.textContent = '→';
        button.append(number, copy, arrow);
        button.addEventListener('click', () => vscode.postMessage({ type: 'selectFrame', frameId: frame.id }));
        list.appendChild(button);
      });
      root.appendChild(list);
      const actions = document.createElement('div');
      appendDebugActions(actions);
      root.appendChild(actions);
    }

    function renderVariables(root, variables) {
      root.appendChild(sectionHeading('关键变量', variables.length ? variables.length + ' 个顶层变量' : '等待调试器暂停'));
      if (!variables.length) {
        root.appendChild(emptyNotice('命中断点后，这里会显示已脱敏、限制数量的顶层变量。'));
        return;
      }
      const list = document.createElement('div');
      list.className = 'variable-list';
      variables.forEach((variable) => {
        const row = document.createElement('div');
        row.className = 'variable-row';
        const key = document.createElement('div');
        key.className = 'variable-key';
        const name = document.createElement('span');
        name.className = 'variable-name';
        name.textContent = variable.name;
        const type = document.createElement('span');
        type.className = 'variable-type';
        type.textContent = variable.type || 'unknown';
        key.append(name, type);
        const value = document.createElement('div');
        value.className = 'variable-value';
        value.textContent = variable.value;
        row.append(key, value);
        list.appendChild(row);
      });
      root.appendChild(list);
      const actions = document.createElement('div');
      appendDebugActions(actions);
      root.appendChild(actions);
    }

    function renderComplete(root, state) {
      const route = state.route;
      const pauses = state.pauses || [];
      const executed = route ? route.nodes.filter((node) => node.executed).length : 0;
      const complete = document.createElement('section');
      complete.className = 'complete';
      complete.innerHTML = '<div class="complete-mark">✓</div><h2>本次阅读已完成</h2><p>候选路径已经被真实调试证据验证。</p>';
      const stats = document.createElement('div');
      stats.className = 'complete-stats';
      stats.append(
        stat('阅读关键节点', route ? route.nodes.length : 0),
        stat('实际暂停次数', pauses.length),
        stat('命中候选节点', executed),
        stat('当前调用栈深度', state.frames?.length || 0),
      );
      const actions = document.createElement('div');
      actions.className = 'action-row';
      actions.style.justifyContent = 'center';
      actions.appendChild(actionButton('查看执行路径', 'primary', () => switchTab('path')));
      complete.append(stats, actions);
      root.appendChild(complete);
    }

    function currentRouteNode(route, frame) {
      if (!route) return undefined;
      return route.nodes.find((node) => frame?.location && node.location.path === frame.location.path) || route.nodes.find((node) => node.active);
    }

    function sectionHeading(title, subtitle) {
      const heading = document.createElement('div');
      heading.className = 'section-heading';
      const copy = document.createElement('div');
      const titleElement = document.createElement('h2');
      const subtitleElement = document.createElement('p');
      titleElement.textContent = title;
      subtitleElement.textContent = subtitle;
      copy.append(titleElement, subtitleElement);
      heading.appendChild(copy);
      return heading;
    }

    function emptyNotice(text) {
      const notice = document.createElement('div');
      notice.className = 'notice';
      notice.textContent = text;
      return notice;
    }

    function actionButton(label, variant, onClick) {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'action' + (variant ? ' ' + variant : '');
      button.textContent = label;
      button.addEventListener('click', onClick);
      return button;
    }

    function tag(label, variant) {
      const value = document.createElement('span');
      value.className = 'tag' + (variant ? ' ' + variant : '');
      value.textContent = label;
      return value;
    }

    function stat(label, value) {
      const row = document.createElement('div');
      row.className = 'stat';
      const name = document.createElement('span');
      name.className = 'stat-label';
      name.textContent = label;
      const count = document.createElement('span');
      count.className = 'stat-value';
      count.textContent = String(value);
      row.append(name, count);
      return row;
    }

    function switchTab(tab) {
      activeTab = tab;
      render(currentState);
    }

    vscode.postMessage({ type: 'ready' });
  </script>
</body>
</html>`;
}

function getNonce(): string {
  const characters = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  let nonce = "";
  for (let index = 0; index < 32; index += 1) {
    nonce += characters.charAt(Math.floor(Math.random() * characters.length));
  }
  return nonce;
}
