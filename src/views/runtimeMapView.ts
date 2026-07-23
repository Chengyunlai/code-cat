import * as path from "node:path";
import * as vscode from "vscode";
import { normalizePath } from "../core/locations";
import { SessionStore } from "../core/sessionStore";
import { hasSourceBreakpoint } from "../debug/breakpoints";
import { SourceLocation, StackFrameSnapshot } from "../domain/model";

export interface RuntimeMapActions {
  locateRoute(question: string): Promise<void>;
  startGuidedDebug(question?: string): Promise<void>;
  explainPause(): Promise<void>;
  revealLocation(location: SourceLocation, frameId?: number): Promise<void>;
  toggleBreakpoint(location: SourceLocation): void;
  runDebugCommand(command: "continue" | "stepInto" | "stepOver"): Promise<void>;
}

interface WebviewMessage {
  readonly type?: unknown;
  readonly question?: unknown;
  readonly nodeId?: unknown;
  readonly pauseId?: unknown;
  readonly frameId?: unknown;
  readonly command?: unknown;
}

export class RuntimeMapView implements vscode.WebviewViewProvider, vscode.Disposable {
  private view: vscode.WebviewView | undefined;
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
    );
    this.postState();
  }

  public dispose(): void {
    for (const disposable of this.disposables) {
      disposable.dispose();
    }
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

    void this.view.webview.postMessage({
      type: "state",
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
        this.postState();
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
        await this.actions.explainPause();
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
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource} 'unsafe-inline'; script-src 'nonce-${nonce}';">
  <title>Code Cat Runtime Map</title>
  <style>
    :root { color-scheme: light dark; }
    * { box-sizing: border-box; }
    body { margin: 0; padding: 12px; color: var(--vscode-foreground); font: 12px/1.45 var(--vscode-font-family); }
    button, textarea { font: inherit; }
    textarea { width: 100%; min-height: 64px; resize: vertical; padding: 8px; color: var(--vscode-input-foreground); background: var(--vscode-input-background); border: 1px solid var(--vscode-input-border, transparent); border-radius: 4px; }
    button { cursor: pointer; color: var(--vscode-button-foreground); background: var(--vscode-button-background); border: 0; border-radius: 4px; padding: 6px 9px; }
    button:hover { background: var(--vscode-button-hoverBackground); }
    button.secondary { color: var(--vscode-button-secondaryForeground); background: var(--vscode-button-secondaryBackground); }
    .toolbar { display: flex; gap: 6px; flex-wrap: wrap; margin-top: 8px; }
    .section { margin-top: 16px; }
    .section-title { display: flex; align-items: center; justify-content: space-between; margin-bottom: 8px; font-size: 11px; font-weight: 700; letter-spacing: .08em; text-transform: uppercase; color: var(--vscode-descriptionForeground); }
    .empty { padding: 14px; color: var(--vscode-descriptionForeground); border: 1px dashed var(--vscode-panel-border); border-radius: 6px; }
    .route { position: relative; padding-left: 8px; }
    .route::before { content: ''; position: absolute; left: 17px; top: 18px; bottom: 18px; width: 1px; background: var(--vscode-panel-border); }
    .route-node { position: relative; display: grid; grid-template-columns: 20px 1fr auto; gap: 8px; align-items: start; width: 100%; margin: 0 0 8px; padding: 9px 8px; text-align: left; color: var(--vscode-foreground); background: var(--vscode-sideBar-background); border: 1px dashed var(--vscode-panel-border); border-radius: 6px; }
    .route-node.executed { border-style: solid; }
    .route-node.active { border-color: var(--vscode-focusBorder); box-shadow: 0 0 0 1px var(--vscode-focusBorder); }
    .dot { z-index: 1; display: grid; place-items: center; width: 18px; height: 18px; color: var(--vscode-badge-foreground); background: var(--vscode-badge-background); border-radius: 50%; font-size: 10px; }
    .node-title { font-weight: 650; }
    .node-meta, .node-reason { color: var(--vscode-descriptionForeground); }
    .node-reason { margin-top: 3px; }
    .breakpoint { min-width: 26px; padding: 3px; color: var(--vscode-descriptionForeground); background: transparent; }
    .breakpoint.on { color: var(--vscode-debugIcon-breakpointForeground, #e51400); }
    .trace { display: flex; gap: 5px; overflow-x: auto; padding-bottom: 4px; }
    .trace button { white-space: nowrap; color: var(--vscode-foreground); background: var(--vscode-editor-background); border: 1px solid var(--vscode-panel-border); }
    .trace button.selected { border-color: var(--vscode-focusBorder); }
    .frame { width: 100%; display: grid; grid-template-columns: 24px 1fr; gap: 6px; margin-bottom: 4px; padding: 7px; text-align: left; color: var(--vscode-foreground); background: transparent; border: 1px solid transparent; }
    .frame:hover, .frame.selected { background: var(--vscode-list-hoverBackground); border-color: var(--vscode-panel-border); }
    .frame-index { color: var(--vscode-descriptionForeground); }
    .vars { width: 100%; border-collapse: collapse; }
    .vars td { padding: 4px 6px; vertical-align: top; border-bottom: 1px solid var(--vscode-panel-border); overflow-wrap: anywhere; }
    .vars td:first-child { width: 34%; color: var(--vscode-symbolIcon-variableForeground, var(--vscode-foreground)); }
    .answer { padding: 10px; white-space: pre-wrap; background: var(--vscode-textBlockQuote-background); border-left: 3px solid var(--vscode-textBlockQuote-border); }
    .busy { margin-top: 8px; color: var(--vscode-progressBar-background); }
  </style>
</head>
<body>
  <textarea id="question" placeholder="例如：订单从 API 进入后，如何完成库存检查和扣款？"></textarea>
  <div class="toolbar">
    <button id="locate">定位代码链路</button>
    <button id="start" class="secondary">开始教学调试</button>
  </div>
  <div id="busy" class="busy"></div>

  <section class="section">
    <div class="section-title"><span>Reading map</span><span id="summary"></span></div>
    <div id="route" class="empty">提出一个问题，生成第一条代码阅读路线。</div>
  </section>

  <section class="section">
    <div class="section-title"><span>Runtime trace</span><span id="debug-state"></span></div>
    <div id="trace" class="trace"></div>
    <div class="toolbar">
      <button data-debug="continue" class="secondary">继续</button>
      <button data-debug="stepInto" class="secondary">进入</button>
      <button data-debug="stepOver" class="secondary">越过</button>
      <button id="explain" class="secondary">解释当前暂停</button>
    </div>
  </section>

  <section class="section">
    <div class="section-title">Call stack</div>
    <div id="frames" class="empty">调试器暂停后，这里会显示真实调用栈。</div>
  </section>

  <section class="section">
    <div class="section-title">Top-frame variables</div>
    <div id="variables" class="empty">暂无运行时变量。</div>
  </section>

  <section class="section">
    <div class="section-title">Tutor</div>
    <div id="answer" class="empty">定位路线或暂停调试后，可以请求 AI 解释。</div>
  </section>

  <script nonce="${nonce}">
    const vscode = acquireVsCodeApi();
    const elements = {
      question: document.getElementById('question'),
      busy: document.getElementById('busy'),
      route: document.getElementById('route'),
      summary: document.getElementById('summary'),
      trace: document.getElementById('trace'),
      frames: document.getElementById('frames'),
      variables: document.getElementById('variables'),
      answer: document.getElementById('answer'),
      debugState: document.getElementById('debug-state'),
    };

    document.getElementById('locate').addEventListener('click', () => {
      vscode.postMessage({ type: 'locateRoute', question: elements.question.value });
    });
    document.getElementById('start').addEventListener('click', () => {
      vscode.postMessage({ type: 'startDebug', question: elements.question.value });
    });
    document.getElementById('explain').addEventListener('click', () => {
      vscode.postMessage({ type: 'explain' });
    });
    document.querySelectorAll('[data-debug]').forEach((button) => {
      button.addEventListener('click', () => vscode.postMessage({
        type: 'debugCommand',
        command: button.dataset.debug,
      }));
    });

    window.addEventListener('message', (event) => {
      if (event.data?.type === 'state') render(event.data.state);
    });

    function render(state) {
      elements.busy.textContent = state.busyMessage || '';
      elements.debugState.textContent = state.debugging ? 'connected' : 'idle';
      renderRoute(state.route);
      renderTrace(state.pauses || []);
      renderFrames(state.frames || []);
      renderVariables(state.variables || []);
      if (state.tutorMessage) {
        elements.answer.className = 'answer';
        elements.answer.textContent = state.tutorMessage.markdown;
      }
    }

    function renderRoute(route) {
      elements.route.replaceChildren();
      elements.summary.textContent = route ? route.nodes.length + ' stops' : '';
      if (!route) {
        elements.route.className = 'empty';
        elements.route.textContent = '提出一个问题，生成第一条代码阅读路线。';
        return;
      }
      if (!elements.question.value) elements.question.value = route.question;
      elements.route.className = 'route';
      route.nodes.forEach((node, index) => {
        const card = document.createElement('div');
        card.className = 'route-node' + (node.executed ? ' executed' : '') + (node.active ? ' active' : '');
        card.innerHTML = '<span class="dot"></span><span class="node-copy"></span><button class="breakpoint" title="切换联动断点">●</button>';
        card.querySelector('.dot').textContent = String(index + 1);
        const copy = card.querySelector('.node-copy');
        const title = document.createElement('div');
        title.className = 'node-title';
        title.textContent = node.title;
        const meta = document.createElement('div');
        meta.className = 'node-meta';
        meta.textContent = node.fileLabel + ':' + node.location.line + ' · ' + node.confidence + (node.executed ? ' · 已执行' : ' · 候选');
        const reason = document.createElement('div');
        reason.className = 'node-reason';
        reason.textContent = node.reason;
        copy.append(title, meta, reason);
        copy.addEventListener('click', () => vscode.postMessage({ type: 'selectRouteNode', nodeId: node.id }));
        const breakpoint = card.querySelector('.breakpoint');
        if (node.breakpoint) breakpoint.classList.add('on');
        breakpoint.addEventListener('click', () => vscode.postMessage({ type: 'toggleBreakpoint', nodeId: node.id }));
        elements.route.appendChild(card);
      });
    }

    function renderTrace(pauses) {
      elements.trace.replaceChildren();
      pauses.forEach((pause, index) => {
        const button = document.createElement('button');
        button.className = pause.selected ? 'selected' : '';
        button.textContent = (index + 1) + '. ' + pause.label;
        button.addEventListener('click', () => vscode.postMessage({ type: 'selectPause', pauseId: pause.id }));
        elements.trace.appendChild(button);
      });
    }

    function renderFrames(frames) {
      elements.frames.replaceChildren();
      if (!frames.length) {
        elements.frames.className = 'empty';
        elements.frames.textContent = '调试器暂停后，这里会显示真实调用栈。';
        return;
      }
      elements.frames.className = '';
      frames.forEach((frame) => {
        const button = document.createElement('button');
        button.className = 'frame' + (frame.selected ? ' selected' : '');
        const index = document.createElement('span');
        index.className = 'frame-index';
        index.textContent = '#' + frame.index;
        const copy = document.createElement('span');
        copy.textContent = frame.name + ' · ' + frame.fileLabel;
        button.append(index, copy);
        button.addEventListener('click', () => vscode.postMessage({ type: 'selectFrame', frameId: frame.id }));
        elements.frames.appendChild(button);
      });
    }

    function renderVariables(variables) {
      elements.variables.replaceChildren();
      if (!variables.length) {
        elements.variables.className = 'empty';
        elements.variables.textContent = '暂无运行时变量。';
        return;
      }
      elements.variables.className = '';
      const table = document.createElement('table');
      table.className = 'vars';
      variables.forEach((variable) => {
        const row = document.createElement('tr');
        const name = document.createElement('td');
        const value = document.createElement('td');
        name.textContent = variable.name;
        value.textContent = variable.value;
        row.append(name, value);
        table.appendChild(row);
      });
      elements.variables.appendChild(table);
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
