import * as vscode from "vscode";
import { normalizePath } from "../core/locations";
import { SessionStore } from "../core/sessionStore";
import {
  LinkedBreakpointState,
  ManagedBreakpointService,
} from "../debug/breakpoints";
import { PauseExplanation, RouteNode, SourceLocation } from "../domain/model";

export const PYTHON_SOURCE_SELECTOR: vscode.DocumentSelector = [
  { language: "python", scheme: "file" },
];

interface SourceGuidanceContext {
  readonly node: RouteNode;
  readonly routeIndex: number;
  readonly routeLength: number;
  readonly lineIndex: number;
  readonly line: vscode.TextLine;
  readonly breakpointState: LinkedBreakpointState;
  readonly live: boolean;
  readonly explanation?: PauseExplanation;
}

export class SourceGuidanceController
  implements vscode.CodeLensProvider, vscode.HoverProvider, vscode.Disposable
{
  private readonly codeLensEmitter = new vscode.EventEmitter<void>();
  private readonly decorationType = vscode.window.createTextEditorDecorationType({
    after: {
      margin: "0 0 0 1.5rem",
      color: new vscode.ThemeColor("editorCodeLens.foreground"),
    },
    rangeBehavior: vscode.DecorationRangeBehavior.ClosedClosed,
  });
  private readonly disposables: vscode.Disposable[];

  public readonly onDidChangeCodeLenses = this.codeLensEmitter.event;

  public constructor(
    private readonly store: SessionStore,
    private readonly breakpoints: ManagedBreakpointService,
  ) {
    this.disposables = [
      this.codeLensEmitter,
      this.decorationType,
      store.onDidChange(() => this.refresh()),
      vscode.debug.onDidChangeBreakpoints(() => this.refresh()),
      vscode.window.onDidChangeActiveTextEditor(() => this.updateDecorations()),
      vscode.window.onDidChangeVisibleTextEditors(() => this.updateDecorations()),
    ];
    this.updateDecorations();
  }

  public provideCodeLenses(document: vscode.TextDocument): vscode.CodeLens[] {
    return this.nodesForDocument(document).flatMap((node) =>
      this.codeLensesForContext(this.contextFor(document, node)),
    );
  }

  public provideHover(
    document: vscode.TextDocument,
    position: vscode.Position,
  ): vscode.Hover | undefined {
    const node = this.nodesForDocument(document).find(
      (candidate) => candidate.location.line === position.line + 1,
    );
    if (!node) {
      return undefined;
    }
    const context = this.contextFor(document, node);
    return new vscode.Hover(this.contextMarkdown(document, context), context.line.range);
  }

  public dispose(): void {
    for (const editor of vscode.window.visibleTextEditors) {
      editor.setDecorations(this.decorationType, []);
    }
    for (const disposable of this.disposables) {
      disposable.dispose();
    }
  }

  private refresh(): void {
    this.codeLensEmitter.fire();
    this.updateDecorations();
  }

  private updateDecorations(): void {
    for (const editor of vscode.window.visibleTextEditors) {
      const nodes = this.nodesForDocument(editor.document);
      const decorations = nodes.flatMap((node) => {
        const context = this.contextFor(editor.document, node);
        const prefix = context.live
          ? "Code Cat · 当前暂停"
          : context.breakpointState === "managed"
            ? "Code Cat · 教学断点"
            : context.breakpointState === "external"
              ? "Code Cat · 用户断点"
              : `Code Cat · ${context.routeIndex + 1}/${context.routeLength}`;
        return [
          {
            range: new vscode.Range(context.line.range.end, context.line.range.end),
            hoverMessage: this.contextMarkdown(editor.document, context),
            renderOptions: {
              after: {
                contentText: boundedInlineLabel(`${prefix} · ${context.node.title}`),
              },
            },
          },
        ];
      });
      editor.setDecorations(this.decorationType, decorations);
    }
  }

  private nodesForDocument(document: vscode.TextDocument): readonly RouteNode[] {
    if (document.languageId !== "python" || document.uri.scheme !== "file") {
      return [];
    }
    const documentPath = normalizePath(document.uri.fsPath);
    const state = this.store.snapshot();
    return (
      state
        .route?.nodes.slice(0, state.revealedRouteNodeCount)
        .filter(
          (node) => normalizePath(node.location.path) === documentPath,
        ) ?? []
    );
  }

  private contextFor(
    document: vscode.TextDocument,
    node: RouteNode,
  ): SourceGuidanceContext {
    const state = this.store.snapshot();
    const routeIndex = Math.max(
      0,
      state.route?.nodes.findIndex((candidate) => candidate.id === node.id) ?? 0,
    );
    const livePause = state.debugStatus === "paused" ? state.pauses.at(-1) : undefined;
    const live = sameLocation(livePause?.frames[0]?.location, node.location);
    const lineIndex = Math.min(
      document.lineCount - 1,
      Math.max(0, node.location.line - 1),
    );
    return {
      node,
      routeIndex,
      routeLength: state.route?.nodes.length ?? 1,
      lineIndex,
      line: document.lineAt(lineIndex),
      breakpointState: this.breakpoints.state(node.location),
      live,
      explanation:
        live &&
        state.tutorMessage?.kind === "pause" &&
        state.tutorMessage.pauseId === livePause?.id
          ? state.tutorMessage.explanation
          : undefined,
    };
  }

  private codeLensesForContext(context: SourceGuidanceContext): vscode.CodeLens[] {
    const { node, routeIndex, routeLength, line, breakpointState, live } = context;
    const range = line.range;
    const breakpointTitle =
      breakpointState === "managed"
        ? "移除教学断点"
        : breakpointState === "external"
          ? "已有用户断点（保留）"
          : "在此暂停";
    const lenses = [
      new vscode.CodeLens(range, {
        title: boundedInlineLabel(
          `Code Cat · 第 ${routeIndex + 1}/${routeLength} 步 · ${node.title}`,
        ),
        command: "codeCat.showRouteNodeContext",
        arguments: [node.id],
      }),
      new vscode.CodeLens(range, {
        title: breakpointTitle,
        command:
          breakpointState === "external"
            ? "codeCat.showRouteNodeContext"
            : "codeCat.toggleBreakpoint",
        arguments:
          breakpointState === "external" ? [node.id] : [node.location],
      }),
    ];
    if (live) {
      lenses.push(
        commandLens(range, "解释此处", "codeCat.explainPause"),
        commandLens(range, "继续运行", "codeCat.continue"),
        commandLens(range, "进入函数", "codeCat.stepInto"),
        commandLens(range, "单步跳过", "codeCat.stepOver"),
      );
    }
    return lenses;
  }

  private contextMarkdown(
    document: vscode.TextDocument,
    context: SourceGuidanceContext,
  ): vscode.MarkdownString {
    const { node, routeIndex, routeLength, lineIndex, explanation } = context;
    const markdown = new vscode.MarkdownString(undefined, true);
    markdown.appendMarkdown(
      `### Code Cat · 第 ${routeIndex + 1}/${routeLength} 步\n\n`,
    );
    markdown.appendMarkdown("**这里的上下文**\n\n");
    markdown.appendText(node.title);
    markdown.appendMarkdown("\n\n**为什么在这里停**\n\n");
    markdown.appendText(node.reason);

    if (explanation) {
      markdown.appendMarkdown("\n\n---\n\n**当前发生什么**\n\n");
      markdown.appendText(explanation.whatHappened);
      markdown.appendMarkdown("\n\n**为什么重要**\n\n");
      markdown.appendText(explanation.whyItMatters);
      markdown.appendMarkdown("\n\n**下一步看什么**\n\n");
      markdown.appendText(explanation.inspectNext);
    }

    const start = Math.max(0, lineIndex - 2);
    const end = Math.min(document.lineCount - 1, lineIndex + 2);
    const snippet = sourceSnippet(document, start, end, lineIndex);
    markdown.appendMarkdown("\n\n**附近代码**\n\n");
    markdown.appendCodeblock(snippet, "python");
    markdown.appendMarkdown("\n将鼠标移到提示上查看上下文；使用上方 CodeLens 精细控制断点和单步操作。");
    return markdown;
  }

}

function commandLens(
  range: vscode.Range,
  title: string,
  command: string,
): vscode.CodeLens {
  return new vscode.CodeLens(range, { title, command });
}

function sameLocation(
  left: SourceLocation | undefined,
  right: SourceLocation,
): boolean {
  return (
    left !== undefined &&
    normalizePath(left.path) === normalizePath(right.path) &&
    left.line === right.line
  );
}

function boundedInlineLabel(value: string): string {
  return value.length <= 72 ? value : `${value.slice(0, 71)}…`;
}

function boundedSourceSnippet(value: string): string {
  const lines = value.split("\n").map((line) =>
    line.length <= 320 ? line : `${line.slice(0, 319)}…`,
  );
  const joined = lines.join("\n");
  return joined.length <= 1_600 ? joined : `${joined.slice(0, 1_599)}…`;
}

function sourceSnippet(
  document: vscode.TextDocument,
  start: number,
  end: number,
  focusedLine: number,
): string {
  const lineNumberWidth = String(end + 1).length;
  const lines: string[] = [];
  for (let index = start; index <= end; index += 1) {
    const marker = index === focusedLine ? ">" : " ";
    const lineNumber = String(index + 1).padStart(lineNumberWidth, " ");
    lines.push(`${marker} ${lineNumber} │ ${document.lineAt(index).text}`);
  }
  return boundedSourceSnippet(lines.join("\n"));
}
