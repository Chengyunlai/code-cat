import * as path from "node:path";
import * as vscode from "vscode";

export interface PythonSymbol {
  readonly file: string;
  readonly absolutePath: string;
  readonly line: number;
  readonly kind: "class" | "function" | "async-function";
  readonly name: string;
  readonly signature: string;
}

export interface PythonProjectSnapshot {
  readonly files: readonly string[];
  readonly symbols: readonly PythonSymbol[];
  readonly truncated: boolean;
}

export interface PythonProjectReadinessIssue {
  readonly kind: "no-workspace" | "no-python-files";
  readonly message: string;
}

type WorkspaceRelativePythonPath = string & {
  readonly __workspaceRelativePythonPath: unique symbol;
};

const SYMBOL_PATTERN = /^(\s*)(async\s+def|def|class)\s+([A-Za-z_]\w*)\s*([^:]*)\s*:/;
const EXCLUDE_GLOB = "**/{.git,.venv,venv,node_modules,__pycache__,dist,build,.tox,.mypy_cache,.pytest_cache}/**";
const MAX_PROMPT_SYMBOLS = 600;
const STABLE_PROMPT_SYMBOL_PREFIX = 560;

export class PythonProjectIndex implements vscode.Disposable {
  private cachedSnapshot: PythonProjectSnapshot | undefined;
  private readonly watcher: vscode.FileSystemWatcher;
  private readonly disposables: vscode.Disposable[] = [];

  public constructor() {
    this.watcher = vscode.workspace.createFileSystemWatcher("**/*.py");
    this.disposables.push(
      this.watcher,
      this.watcher.onDidCreate(() => this.invalidate()),
      this.watcher.onDidChange(() => this.invalidate()),
      this.watcher.onDidDelete(() => this.invalidate()),
    );
  }

  public async snapshot(): Promise<PythonProjectSnapshot> {
    if (this.cachedSnapshot) {
      return this.cachedSnapshot;
    }

    const maxFiles = vscode.workspace
      .getConfiguration("codeCat")
      .get<number>("maxIndexedFiles", 400);
    const uris = await vscode.workspace.findFiles("**/*.py", EXCLUDE_GLOB, maxFiles + 1);
    const selectedUris = uris.slice(0, maxFiles);
    const symbols: PythonSymbol[] = [];
    const files: string[] = [];

    for (const uri of selectedUris) {
      const workspaceFolder = vscode.workspace.getWorkspaceFolder(uri);
      if (!workspaceFolder) {
        continue;
      }

      const relativePath = path.relative(workspaceFolder.uri.fsPath, uri.fsPath);
      files.push(relativePath);

      const bytes = await vscode.workspace.fs.readFile(uri);
      const text = new TextDecoder("utf-8").decode(bytes);
      const lines = text.split(/\r?\n/u);
      for (let index = 0; index < lines.length; index += 1) {
        const line = lines[index] ?? "";
        const match = SYMBOL_PATTERN.exec(line);
        if (!match) {
          continue;
        }

        const declaration = match[2];
        const name = match[3];
        if (!declaration || !name) {
          continue;
        }

        symbols.push({
          file: relativePath,
          absolutePath: uri.fsPath,
          line: index + 1,
          kind:
            declaration === "class"
              ? "class"
              : declaration.startsWith("async")
                ? "async-function"
                : "function",
          name,
          signature: line.trim().slice(0, 240),
        });
      }
    }

    this.cachedSnapshot = {
      files: files.sort(),
      symbols,
      truncated: uris.length > maxFiles,
    };
    return this.cachedSnapshot;
  }

  public async promptContext(question: string): Promise<string> {
    const project = await this.snapshot();
    const terms = tokenizeQuestion(question);
    const chosen = selectPromptSymbols(project.symbols, terms);
    const fileList = project.files.slice(0, 400).join("\n");
    const symbolList = chosen
      .map((symbol) => `${symbol.file}:${symbol.line} ${symbol.signature}`)
      .join("\n");

    return [
      `Python files (${project.files.length}${project.truncated ? "+" : ""}):`,
      fileList,
      "",
      `Symbols (${project.symbols.length} indexed; ${chosen.length} shown):`,
      symbolList,
    ].join("\n");
  }

  public async readinessIssue(): Promise<PythonProjectReadinessIssue | undefined> {
    if (!(vscode.workspace.workspaceFolders?.length)) {
      return {
        kind: "no-workspace",
        message: "请先在 VS Code 中打开一个包含 Python 代码的项目文件夹。",
      };
    }
    const project = await this.snapshot();
    if (project.files.length === 0) {
      return {
        kind: "no-python-files",
        message: "当前工作区没有找到 Python 文件。请打开正确的项目，或确认源码未被排除。",
      };
    }
    return undefined;
  }

  public async resolveFile(candidate: string): Promise<string | undefined> {
    const normalizedCandidate = parseWorkspaceRelativePythonPath(candidate);
    if (!normalizedCandidate) {
      return undefined;
    }
    const project = await this.snapshot();
    const exact = project.symbols.find(
      (symbol) => symbol.file.replaceAll("\\", "/") === normalizedCandidate,
    );
    if (exact) {
      return exact.absolutePath;
    }

    const workspaceFolders = vscode.workspace.workspaceFolders ?? [];
    for (const folder of workspaceFolders) {
      const uri = vscode.Uri.joinPath(folder.uri, normalizedCandidate);
      try {
        const stat = await vscode.workspace.fs.stat(uri);
        if (stat.type === vscode.FileType.File) {
          return uri.fsPath;
        }
      } catch {
        // The model may return a partial path. Fall through to the suffix match.
      }
    }

    const suffixMatches = project.symbols.filter((symbol) =>
      symbol.file.replaceAll("\\", "/").endsWith(normalizedCandidate),
    );
    return suffixMatches.length === 1 ? suffixMatches[0]?.absolutePath : undefined;
  }

  public dispose(): void {
    for (const disposable of this.disposables) {
      disposable.dispose();
    }
  }

  private invalidate(): void {
    this.cachedSnapshot = undefined;
  }
}

function parseWorkspaceRelativePythonPath(
  candidate: string,
): WorkspaceRelativePythonPath | undefined {
  const slashPath = candidate.replaceAll("\\", "/").replace(/^\.\//u, "");
  if (
    !slashPath ||
    slashPath.includes("\0") ||
    path.posix.isAbsolute(slashPath) ||
    path.win32.isAbsolute(candidate) ||
    slashPath.split("/").includes("..") ||
    !slashPath.toLowerCase().endsWith(".py")
  ) {
    return undefined;
  }
  return path.posix.normalize(slashPath) as WorkspaceRelativePythonPath;
}

function tokenizeQuestion(question: string): readonly string[] {
  return [...new Set(question.toLowerCase().match(/[a-z_][a-z0-9_]{2,}/gu) ?? [])];
}

function scoreSymbol(symbol: PythonSymbol, terms: readonly string[]): number {
  const haystack = `${symbol.file} ${symbol.name} ${symbol.signature}`.toLowerCase();
  return terms.reduce((score, term) => score + (haystack.includes(term) ? 1 : 0), 0);
}

function selectPromptSymbols(
  symbols: readonly PythonSymbol[],
  terms: readonly string[],
): readonly PythonSymbol[] {
  const stableOrder = [...symbols].sort(
    (left, right) =>
      left.file.localeCompare(right.file) ||
      left.line - right.line ||
      left.name.localeCompare(right.name),
  );
  const stablePrefix = stableOrder.slice(0, STABLE_PROMPT_SYMBOL_PREFIX);
  const selectedKeys = new Set(stablePrefix.map(symbolKey));
  const relevantTail = symbols
    .map((symbol) => ({ symbol, score: scoreSymbol(symbol, terms) }))
    .filter(({ symbol, score }) => score > 0 && !selectedKeys.has(symbolKey(symbol)))
    .sort(
      (left, right) =>
        right.score - left.score ||
        left.symbol.file.localeCompare(right.symbol.file) ||
        left.symbol.line - right.symbol.line,
    )
    .slice(0, MAX_PROMPT_SYMBOLS - stablePrefix.length)
    .map(({ symbol }) => symbol);
  for (const symbol of relevantTail) {
    selectedKeys.add(symbolKey(symbol));
  }
  const stableFallback = stableOrder.filter(
    (symbol) => !selectedKeys.has(symbolKey(symbol)),
  );
  return [...stablePrefix, ...relevantTail, ...stableFallback].slice(0, MAX_PROMPT_SYMBOLS);
}

function symbolKey(symbol: PythonSymbol): string {
  return `${symbol.absolutePath}:${symbol.line}:${symbol.name}`;
}
