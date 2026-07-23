const assert = require("node:assert/strict");
const vscode = require("vscode");
const {
  parseProjectScripts,
  projectScriptDebugConfiguration,
} = require("../../dist/debug/pythonLaunchTargets");

const TIMEOUT_MS = 30_000;

async function run() {
  testProjectScriptDiscovery();

  const extension = vscode.extensions.getExtension("local.code-cat");
  assert.ok(extension, "Code Cat should be discoverable");
  await extension.activate();

  const folder = vscode.workspace.workspaceFolders?.[0];
  assert.ok(folder, "the console-entrypoint fixture should be open");
  const cliUri = vscode.Uri.joinPath(folder.uri, "cli.py");
  const targetUri = vscode.Uri.joinPath(folder.uri, "target.py");
  const targetDocument = await vscode.workspace.openTextDocument(targetUri);
  const breakpointLine = targetDocument
    .getText()
    .split(/\r?\n/u)
    .findIndex((line) => line.includes("value = 41"));
  assert.ok(breakpointLine >= 0, "the fixture should contain its target statement");
  const location = {
    path: targetUri.fsPath,
    line: breakpointLine + 1,
    column: 1,
  };

  await vscode.commands.executeCommand(
    "vscode.open",
    cliUri,
    { preview: false },
  );
  await vscode.commands.executeCommand("workbench.view.extension.codeCat");
  await vscode.commands.executeCommand("codeCat.__seedRouteGuidance", location);
  await vscode.commands.executeCommand("codeCat.toggleBreakpoint", location);

  let session;
  try {
    const pausedState = waitForValue(
      () => vscode.commands.executeCommand("codeCat.__smokeState"),
      (candidate) => {
        if (candidate?.debugStatus === "ended") {
          throw new Error("guided debug ended before reaching the console-script breakpoint");
        }
        return candidate?.debugStatus === "paused" && candidate.pauseCount > 0;
      },
      "Code Cat to capture the console-script breakpoint",
    );
    const [, state] = await Promise.all([
      vscode.commands.executeCommand("codeCat.startGuidedDebug"),
      pausedState,
    ]);
    session = vscode.debug.activeDebugSession;
    assert.ok(session, "the guided debug session should still be active at the breakpoint");
    assert.equal(state.debugSessionId, session.id);
    assert.ok(state.lastPauseFrameCount > 0);
    assert.equal(state.lastPauseTopFramePath, targetUri.fsPath);
    assert.equal(state.lastPauseTopFrameLine, breakpointLine + 1);
    console.log("Code Cat entrypoint smoke passed: pyproject console script reached its breakpoint.");
  } finally {
    if (session) {
      await vscode.debug.stopDebugging(session);
    }
  }
}

async function waitForValue(producer, predicate, description) {
  const deadline = Date.now() + TIMEOUT_MS;
  while (Date.now() < deadline) {
    const value = await producer();
    if (predicate(value)) {
      return value;
    }
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error(`Timed out waiting for ${description}`);
}

function testProjectScriptDiscovery() {
  assert.deepEqual(
    parseProjectScripts(`
[project]
name = "sample"

[project.scripts]
sample-cli = "sample.cli:main"
"quoted.command" = 'sample.tools:Runner.run'
`),
    [
      { name: "sample-cli", module: "sample.cli", callable: "main" },
      { name: "quoted.command", module: "sample.tools", callable: "Runner.run" },
    ],
  );
  assert.deepEqual(
    parseProjectScripts(`
[project.scripts]
missing-colon = "sample.cli"
unsafe-module = "sample.cli;print(1):main"
unsafe-callable = "sample.cli:main()"
empty = "sample.cli:"
`),
    [],
  );

  const folder = {
    uri: vscode.Uri.file("/workspace/sample"),
  };
  const extensionUri = vscode.Uri.file("/extensions/code-cat");
  const configuration = projectScriptDebugConfiguration(folder, extensionUri, {
    name: "sample-cli",
    module: "sample.cli",
    callable: "main",
  });
  assert.equal(
    configuration.program,
    "/extensions/code-cat/resources/python_project_script_launcher.py",
  );
  assert.deepEqual(configuration.args, [
    "/workspace/sample",
    "sample-cli",
    "sample.cli",
    "main",
  ]);
  assert.equal(configuration.code, undefined);
  assert.equal(configuration.justMyCode, false);
}

module.exports = { run };
