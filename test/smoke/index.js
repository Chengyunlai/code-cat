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

  const breakpoint = new vscode.SourceBreakpoint(
    new vscode.Location(checkoutUri, new vscode.Position(breakpointLine, 0)),
  );
  vscode.debug.addBreakpoints([breakpoint]);

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

    await vscode.commands.executeCommand("codeCat.stepOver");
    console.log("Code Cat smoke passed: activation, commands, debugpy start, breakpoint, and stack frame.");
  } finally {
    if (session) {
      await vscode.debug.stopDebugging(session);
    }
    vscode.debug.removeBreakpoints([breakpoint]);
  }
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
