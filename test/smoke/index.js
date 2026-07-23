const assert = require("node:assert/strict");
const vscode = require("vscode");

const TIMEOUT_MS = 30_000;

async function run() {
  const extension = vscode.extensions.getExtension("local.code-cat");
  assert.ok(extension, "Code Cat should be discoverable in the Extension Host");
  await extension.activate();
  assert.equal(extension.isActive, true, "Code Cat should activate successfully");

  const commands = new Set(await vscode.commands.getCommands(true));
  for (const command of [
    "codeCat.startGuidedDebug",
    "codeCat.askProject",
    "codeCat.explainPause",
    "codeCat.continue",
    "codeCat.stepInto",
    "codeCat.stepOver",
  ]) {
    assert.ok(commands.has(command), `${command} should be registered`);
  }

  await vscode.commands.executeCommand("workbench.view.extension.codeCat");

  const folder = vscode.workspace.workspaceFolders?.[0];
  assert.ok(folder, "The Python example workspace should be open");
  const checkoutUri = vscode.Uri.joinPath(folder.uri, "order_service", "checkout.py");
  const document = await vscode.workspace.openTextDocument(checkoutUri);
  const breakpointLine = document
    .getText()
    .split(/\r?\n/u)
    .findIndex((line) => line.includes("reservation = reserve_inventory"));
  assert.ok(breakpointLine >= 0, "The checkout example should contain the smoke breakpoint");

  const codeCatLocation = {
    path: checkoutUri.fsPath,
    line: breakpointLine + 1,
    column: 1,
  };
  await vscode.commands.executeCommand("codeCat.toggleBreakpoint", codeCatLocation);
  assert.ok(
    hasBreakpoint(checkoutUri, breakpointLine),
    "Code Cat should create the linked source breakpoint",
  );

  let session;
  try {
    const started = waitForEvent(
      vscode.debug.onDidStartDebugSession,
      (candidate) => candidate.type === "debugpy",
      "debugpy session to start",
    );
    await vscode.commands.executeCommand(
      "codeCat.startGuidedDebug",
      "How does checkout reserve inventory and charge payment?",
    );
    session = await started;

    const stackItem = await waitForEvent(
      vscode.debug.onDidChangeActiveStackItem,
      (candidate) => candidate && "frameId" in candidate,
      "debugpy to pause at the linked breakpoint",
      () => vscode.debug.activeStackItem,
    );
    assert.equal(stackItem.session.id, session.id);
    assert.equal(typeof stackItem.frameId, "number");

    const firstCodeCatState = await waitForValue(
      () => vscode.commands.executeCommand("codeCat.__smokeState"),
      (state) =>
        state?.session?.pauses?.length >= 1 &&
        state.callStackFrameCount > 0 &&
        state.runtimeMap?.resolved &&
        state.runtimeMap.frameCount > 0,
      "Code Cat to publish its first debug snapshot",
    );
    const firstPause = firstCodeCatState.session.pauses.at(-1);
    assert.ok(firstPause.frames.length > 0, "Code Cat should capture DAP stack frames");
    assert.ok(firstPause.variables.length > 0, "Code Cat should capture top-frame variables");

    const stepped = waitForEvent(
      vscode.debug.onDidChangeActiveStackItem,
      (candidate) => candidate && "frameId" in candidate && candidate.session.id === session.id,
      "Step Over to reach the next paused frame",
    );
    await vscode.commands.executeCommand("codeCat.stepOver");
    await stepped;
    await waitForValue(
      () => vscode.commands.executeCommand("codeCat.__smokeState"),
      (state) => state?.session?.pauses?.length >= 2,
      "Code Cat to capture the Step Over pause",
    );
    console.log(
      "Code Cat smoke passed: activation, linked breakpoint, debug snapshots, both views, and Step Over.",
    );
  } finally {
    if (session) {
      await vscode.debug.stopDebugging(session);
    }
    if (hasBreakpoint(checkoutUri, breakpointLine)) {
      await vscode.commands.executeCommand("codeCat.toggleBreakpoint", codeCatLocation);
    }
  }
}

function hasBreakpoint(uri, zeroBasedLine) {
  return vscode.debug.breakpoints.some(
    (breakpoint) =>
      breakpoint instanceof vscode.SourceBreakpoint &&
      breakpoint.location.uri.fsPath === uri.fsPath &&
      breakpoint.location.range.start.line === zeroBasedLine,
  );
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

function waitForEvent(event, predicate, description, currentValue) {
  const current = currentValue?.();
  if (current && predicate(current)) {
    return Promise.resolve(current);
  }
  return new Promise((resolve, reject) => {
    let subscription;
    const timeout = setTimeout(() => {
      subscription?.dispose();
      reject(new Error(`Timed out waiting for ${description}`));
    }, TIMEOUT_MS);
    subscription = event((value) => {
      if (!predicate(value)) {
        return;
      }
      clearTimeout(timeout);
      subscription.dispose();
      resolve(value);
    });
  });
}

module.exports = { run };
