import * as vscode from "vscode";

export interface PythonProjectScript {
  readonly name: string;
  readonly module: string;
  readonly callable: string;
}

const PYTHON_REFERENCE = /^[A-Za-z_]\w*(?:\.[A-Za-z_]\w*)*$/u;
const MAX_PYPROJECT_BYTES = 512 * 1_024;

export async function discoverPythonProjectScripts(
  folder: vscode.WorkspaceFolder,
): Promise<readonly PythonProjectScript[]> {
  const uri = vscode.Uri.joinPath(folder.uri, "pyproject.toml");
  let bytes: Uint8Array;
  try {
    bytes = await vscode.workspace.fs.readFile(uri);
  } catch {
    return [];
  }
  if (bytes.byteLength > MAX_PYPROJECT_BYTES) {
    return [];
  }
  return parseProjectScripts(new TextDecoder("utf-8").decode(bytes));
}

export function projectScriptDebugConfiguration(
  folder: vscode.WorkspaceFolder,
  extensionUri: vscode.Uri,
  script: PythonProjectScript,
): vscode.DebugConfiguration {
  return {
    name: `Code Cat: ${script.name}`,
    type: "debugpy",
    request: "launch",
    program: vscode.Uri.joinPath(
      extensionUri,
      "resources",
      "python_project_script_launcher.py",
    ).fsPath,
    args: [folder.uri.fsPath, script.name, script.module, script.callable],
    cwd: folder.uri.fsPath,
    console: "integratedTerminal",
    justMyCode: false,
  };
}

export function parseProjectScripts(source: string): readonly PythonProjectScript[] {
  const scripts: PythonProjectScript[] = [];
  let inProjectScripts = false;
  for (const rawLine of source.replaceAll("\0", "").split(/\r?\n/u)) {
    const line = rawLine.trim();
    const section = /^\[([^\]]+)\]$/u.exec(line);
    if (section) {
      inProjectScripts = section[1]?.trim() === "project.scripts";
      continue;
    }
    if (!inProjectScripts || !line || line.startsWith("#")) {
      continue;
    }
    const assignment = /^([^=]+?)\s*=\s*("(?:[^"\\]|\\.)*"|'[^']*')\s*(?:#.*)?$/u.exec(
      line,
    );
    if (!assignment?.[1] || !assignment[2]) {
      continue;
    }
    const name = tomlStringOrBareKey(assignment[1].trim());
    const reference = tomlString(assignment[2]);
    if (!name || !reference) {
      continue;
    }
    const separator = reference.indexOf(":");
    if (separator <= 0 || separator === reference.length - 1) {
      continue;
    }
    const module = reference.slice(0, separator).trim();
    const callable = reference.slice(separator + 1).trim();
    if (!PYTHON_REFERENCE.test(module) || !PYTHON_REFERENCE.test(callable)) {
      continue;
    }
    scripts.push({ name, module, callable });
  }
  return scripts;
}

function tomlStringOrBareKey(value: string): string | undefined {
  if (value.startsWith('"') || value.startsWith("'")) {
    return tomlString(value);
  }
  return /^[A-Za-z0-9][A-Za-z0-9._-]*$/u.test(value) ? value : undefined;
}

function tomlString(value: string): string | undefined {
  if (value.startsWith('"') && value.endsWith('"')) {
    try {
      const parsed = JSON.parse(value) as unknown;
      return typeof parsed === "string" && parsed.trim() ? parsed.trim() : undefined;
    } catch {
      return undefined;
    }
  }
  if (value.startsWith("'") && value.endsWith("'")) {
    const parsed = value.slice(1, -1).trim();
    return parsed || undefined;
  }
  return undefined;
}
