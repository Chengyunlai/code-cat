import { createRequire } from "node:module";
import * as path from "node:path";
import * as vscode from "vscode";

export const NODE_SOURCE = /\.(?:[cm]?[jt]s|[jt]sx)$/iu;

/** Use the project's installed loader; never install or execute a guessed package script. */
export function nodeFileConfiguration(
  folder: vscode.WorkspaceFolder,
  file: string,
): vscode.DebugConfiguration | undefined {
  if (!NODE_SOURCE.test(file) || /\.[jt]sx$/iu.test(file)) return undefined;
  const runtimeArgs: string[] = [];
  if (/\.[cm]?ts$/iu.test(file)) {
    try {
      const projectRequire = createRequire(path.join(folder.uri.fsPath, "package.json"));
      runtimeArgs.push("--import", projectRequire.resolve("tsx"));
    } catch {
      return undefined;
    }
  }
  return {
    name: "Code Cat: Current Node File", type: "node", request: "launch",
    program: file, cwd: folder.uri.fsPath, runtimeArgs,
    sourceMaps: true, console: "integratedTerminal",
    skipFiles: ["<node_internals>/**", "**/node_modules/**"],
  };
}
