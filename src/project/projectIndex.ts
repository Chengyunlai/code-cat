import * as path from "node:path";
import * as vscode from "vscode";

export interface ProjectSymbol {
  readonly file: string;
  readonly absolutePath: string;
  readonly line: number;
  readonly kind: "class" | "function" | "async-function";
  readonly name: string;
  readonly signature: string;
}

export interface ProjectSnapshot {
  readonly files: readonly string[];
  readonly symbols: readonly ProjectSymbol[];
  readonly truncated: boolean;
}

export interface ProjectReadinessIssue {
  readonly kind: "no-workspace" | "no-source-files";
  readonly message: string;
}

type WorkspaceRelativeSourcePath = string & {
  readonly __workspaceRelativeSourcePath: unique symbol;
};

const SYMBOL_PATTERN = /^(\s*)(async\s+def|def|class)\s+([A-Za-z_]\w*)\s*([^:]*)\s*:/;
const EXCLUDE_GLOB = "**/{.git,.venv,venv,node_modules,__pycache__,dist,build,.tox,.mypy_cache,.pytest_cache}/**";
const MAX_PROMPT_SYMBOLS = 600;
const STABLE_PROMPT_SYMBOL_PREFIX = 560;

export class ProjectIndex implements vscode.Disposable {
  private cachedSnapshot: ProjectSnapshot | undefined;
  private readonly watcher: vscode.FileSystemWatcher;
  private readonly disposables: vscode.Disposable[] = [];

  public constructor() {
    this.watcher = vscode.workspace.createFileSystemWatcher("**/*.{py,ts,tsx,mts,cts,js,jsx,mjs,cjs}");
    this.disposables.push(
      this.watcher,
      this.watcher.onDidCreate(() => this.invalidate()),
      this.watcher.onDidChange(() => this.invalidate()),
      this.watcher.onDidDelete(() => this.invalidate()),
    );
  }

  public async snapshot(): Promise<ProjectSnapshot> {
    if (this.cachedSnapshot) {
      return this.cachedSnapshot;
    }

    const maxFiles = vscode.workspace
      .getConfiguration("codeCat")
      .get<number>("maxIndexedFiles", 400);
    const [primaryUris, allUris] = await Promise.all([
      vscode.workspace.findFiles("{src,packages,lib,apps}/**/*.{py,ts,tsx,mts,cts,js,jsx,mjs,cjs}", EXCLUDE_GLOB, maxFiles + 1),
      vscode.workspace.findFiles("**/*.{py,ts,tsx,mts,cts,js,jsx,mjs,cjs}", EXCLUDE_GLOB, maxFiles + 1),
    ]);
    const uris = [...new Map([...primaryUris,...allUris].map(uri=>[uri.toString(),uri])).values()];
    const selectedUris = uris.slice(0, maxFiles);
    const symbols: ProjectSymbol[] = [];
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
      if (!uri.fsPath.endsWith(".py")) {
        symbols.push(...await scriptSymbols(uri, relativePath, text));
        continue;
      }
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

    const localPackages: string[] = [];
    const manifests=await vscode.workspace.findFiles("**/package.json", EXCLUDE_GLOB,200);
    for(const uri of manifests){
      try{const manifest=JSON.parse(Buffer.from(await vscode.workspace.fs.readFile(uri)).toString("utf8"));
        if(typeof manifest.name==="string")localPackages.push(`${manifest.name} => ${vscode.workspace.asRelativePath(uri,false)}`);
      }catch{/* Unavailable manifests do not imply external dependencies. */}
    }
    const excerpts: string[] = [];
    for (const file of [...new Set([...chosen].sort((a,b)=>scoreSymbol(b,terms)-scoreSymbol(a,terms)).map(symbol => symbol.absolutePath))].slice(0, 4)) {
      const symbol = [...chosen].filter(item => item.absolutePath === file).sort((a,b)=>scoreSymbol(b,terms)-scoreSymbol(a,terms))[0]!;
      try {
        const document = await vscode.workspace.openTextDocument(file);
        const start = Math.max(0, symbol.line - 3);
        const end = Math.min(document.lineCount, start + 65);
        const lines: string[] = [];
        for (let line = start; line < end; line += 1) lines.push(`${line + 1}: ${document.lineAt(line).text}`);
        excerpts.push(`${symbol.file} (current source excerpt):\n${lines.join("\n").slice(0, 5000)}`);
      } catch { /* A deleted file remains unavailable evidence, never invented code. */ }
    }
    return [
      "Local package identities (may be self-references or workspace imports):",
      ...localPackages,
      "Only selected source excerpts are shown. Missing excerpts do not prove absence of implementation.",
      `Source files (${project.files.length}${project.truncated ? "+" : ""}):`,
      fileList,
      "",
      `Symbols (${project.symbols.length} indexed; ${chosen.length} shown):`,
      symbolList,
      "Source excerpts (only these lines may be quoted as repository code):",
      ...excerpts,
    ].join("\n");
  }

  public async readinessIssue(): Promise<ProjectReadinessIssue | undefined> {
    if (!(vscode.workspace.workspaceFolders?.length)) {
      return {
        kind: "no-workspace",
        message: "请先在 VS Code 中打开一个包含 Python、TypeScript 或 JavaScript 代码的项目文件夹。",
      };
    }
    const project = await this.snapshot();
    if (project.files.length === 0) {
      return {
        kind: "no-source-files",
        message: "当前工作区没有找到 Python、TypeScript 或 JavaScript 源码。请打开正确的项目，或确认源码未被排除。",
      };
    }
    return undefined;
  }

  public async resolveFile(candidate: string): Promise<string | undefined> {
    const normalizedCandidate = parseWorkspaceRelativeSourcePath(candidate);
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

function parseWorkspaceRelativeSourcePath(
  candidate: string,
): WorkspaceRelativeSourcePath | undefined {
  const slashPath = candidate.replaceAll("\\", "/").replace(/^\.\//u, "");
  if (
    !slashPath ||
    slashPath.includes("\0") ||
    path.posix.isAbsolute(slashPath) ||
    path.win32.isAbsolute(candidate) ||
    slashPath.split("/").includes("..") ||
    !/\.(?:py|[cm]?[jt]s|[jt]sx)$/iu.test(slashPath)
  ) {
    return undefined;
  }
  return path.posix.normalize(slashPath) as WorkspaceRelativeSourcePath;
}

function tokenizeQuestion(question: string): readonly string[] {
  return [...new Set(question.toLowerCase().match(/[a-z_][a-z0-9_]{2,}/gu) ?? [])];
}

function scoreSymbol(symbol: ProjectSymbol, terms: readonly string[]): number {
  const haystack = `${symbol.file} ${symbol.name} ${symbol.signature}`.toLowerCase();
  return terms.reduce((score, term) => score + (symbol.name.toLowerCase() === term ? 100 : haystack.includes(term) ? 1 : 0), 0);
}

function selectPromptSymbols(
  symbols: readonly ProjectSymbol[],
  terms: readonly string[],
): readonly ProjectSymbol[] {
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

function symbolKey(symbol: ProjectSymbol): string {
  return `${symbol.absolutePath}:${symbol.line}:${symbol.name}`;
}

async function scriptSymbols(uri: vscode.Uri, file: string, text: string): Promise<ProjectSymbol[]> {
  // The built-in TS language service understands TSX, methods and arrow functions.
  // Keep a bounded fallback for disabled or unavailable language services.
  let timer: ReturnType<typeof setTimeout> | undefined;
  let provided: (vscode.DocumentSymbol | vscode.SymbolInformation)[] | undefined;
  try {
    await vscode.workspace.openTextDocument(uri);
    provided = await Promise.race([
      vscode.commands.executeCommand<(vscode.DocumentSymbol | vscode.SymbolInformation)[]>(
        "vscode.executeDocumentSymbolProvider", uri,
      ),
      new Promise<undefined>((resolve) => { timer = setTimeout(() => resolve(undefined), 1500); }),
    ]);
  } catch { /* Declaration scanning remains available without a language service. */ }
  finally { if (timer) clearTimeout(timer); }
  const lines = text.split(/\r?\n/u);
  const result: ProjectSymbol[] = [];
  function visit(items: (vscode.DocumentSymbol | vscode.SymbolInformation)[]): void {
    for (const item of items) {
      const range = "selectionRange" in item ? item.selectionRange : item.location.range;
      result.push({ file, absolutePath: uri.fsPath, line: range.start.line + 1,
        kind: item.kind === vscode.SymbolKind.Class ? "class" : "function",
        name: item.name, signature: (lines[range.start.line] ?? item.name).trim().slice(0, 240) });
      if ("children" in item) visit(item.children);
    }
  }
  if (provided?.length) { visit(provided); return result; }
  const declaration = /^\s*(?:export\s+(?:default\s+)?)?(?:declare\s+)?(?:async\s+)?(?:function\s*\*?\s*|class\s+|interface\s+|type\s+|(?:const|let|var)\s+)([$\w]+)/u;
  lines.forEach((line, index) => {
    const match = declaration.exec(line);
    if (match?.[1]) result.push({ file, absolutePath: uri.fsPath, line: index + 1,
      kind: /\bclass\b/u.test(line) ? "class" : "function", name: match[1], signature: line.trim().slice(0, 240) });
  });
  return result;
}
