import { access, mkdir, readdir, symlink } from "node:fs/promises";
import { homedir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { runTests } from "@vscode/test-electron";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const defaultExecutable =
  process.platform === "darwin"
    ? "/Applications/Visual Studio Code.app/Contents/MacOS/Electron"
    : undefined;
const vscodeExecutablePath = process.env.CODE_CAT_VSCODE_EXECUTABLE ?? defaultExecutable;

if (!vscodeExecutablePath) {
  throw new Error(
    "Set CODE_CAT_VSCODE_EXECUTABLE to the VS Code executable before running the smoke test.",
  );
}
await access(vscodeExecutablePath);

const machineExtensions =
  process.env.CODE_CAT_VSCODE_EXTENSIONS_SOURCE_DIR ??
  path.join(homedir(), ".vscode", "extensions");
const isolatedExtensions =
  process.env.CODE_CAT_VSCODE_EXTENSIONS_DIR ??
  path.join(root, ".vscode-test", "code-cat-extensions");
const extensionsDir = await preparePythonExtensions(machineExtensions, isolatedExtensions);
const suites = [
  {
    workspace: path.join(root, "examples/python-order-service"),
    tests: path.join(root, "test/smoke/index.js"),
  },
  {
    workspace: path.join(root, "examples/python-console-entrypoint"),
    tests: path.join(root, "test/entrypoint/index.js"),
  },
];

for (const suite of suites) {
  await runTests({
    vscodeExecutablePath,
    extensionDevelopmentPath: root,
    extensionTestsPath: suite.tests,
    launchArgs: [suite.workspace, `--extensions-dir=${extensionsDir}`],
  });
}

async function preparePythonExtensions(sourceDir, targetDir) {
  await mkdir(targetDir, { recursive: true });
  const entries = await readdir(sourceDir, { withFileTypes: true });
  const requiredPrefixes = [
    "ms-python.python-",
    "ms-python.debugpy-",
    "ms-python.vscode-python-envs-",
    "ms-python.vscode-pylance-",
  ];
  const pythonExtensions = entries.filter(
    (entry) =>
      entry.isDirectory() && requiredPrefixes.some((prefix) => entry.name.startsWith(prefix)),
  );
  if (!pythonExtensions.some((entry) => entry.name.startsWith("ms-python.debugpy-"))) {
    throw new Error("Install ms-python.debugpy before running the VS Code smoke test.");
  }

  for (const extension of pythonExtensions) {
    const source = path.join(sourceDir, extension.name);
    const target = path.join(targetDir, extension.name);
    try {
      await symlink(source, target, process.platform === "win32" ? "junction" : "dir");
    } catch (error) {
      if (error?.code !== "EEXIST") {
        throw error;
      }
    }
  }
  return targetDir;
}
