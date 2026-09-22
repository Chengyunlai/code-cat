const assert = require('node:assert/strict');
const vscode = require('vscode');
const { ModelProviderService } = require('../../dist/ai/modelProviderService');
const { ProjectIndex } = require('../../dist/project/projectIndex');
const { nodeFileConfiguration } = require('../../dist/debug/nodeLaunchTargets');

async function until(test, description) {
  const end = Date.now() + 30000;
  while (Date.now() < end) {
    const value = await test();
    if (value) return value;
    await new Promise(r => setTimeout(r, 100));
  }
  throw new Error(`Timed out: ${description}`);
}

exports.run = async () => {
  await vscode.extensions.getExtension('local.code-cat').activate();
  const folder = vscode.workspace.workspaceFolders[0];
  const index = new ProjectIndex();
  const snapshot = await index.snapshot();
  assert.equal(await index.readinessIssue(), undefined);
  for (const extension of ['js', 'ts']) {
    assert.ok(snapshot.files.includes(`main.${extension}`));
    assert.ok(snapshot.symbols.some(s => s.file === `main.${extension}` && s.name.includes('reserveInventory')));
    assert.ok(await index.resolveFile(`main.${extension}`));
  }
  assert.equal(await index.resolveFile('../main.ts'), undefined);
  assert.equal(await index.resolveFile('package.json'), undefined);
  assert.equal(nodeFileConfiguration(folder, `${folder.uri.fsPath}/view.tsx`), undefined);
  index.dispose();
  const originalRequest = ModelProviderService.prototype.request;
  try {
    ModelProviderService.prototype.request = async function(prompt) {
      assert.match(prompt, /main\.ts/);
      assert.match(prompt, /reserveInventory/);
      return JSON.stringify({kind: 'project_chat', message: '项目验证库存是否足够。'});
    };
    await vscode.commands.executeCommand('codeCat.clearSession');
    await vscode.commands.executeCommand('codeCat.askProject', '如何理解当前仓库做了什么');
    const answer = await vscode.commands.executeCommand('codeCat.__smokeState');
    assert.ok(answer.chatMessages.some(m => m.text === '项目验证库存是否足够。'));
  } finally { ModelProviderService.prototype.request = originalRequest; }

  const launch = vscode.workspace.getConfiguration('launch', folder.uri);
  const previous = launch.get('configurations');
  try {
    for (const extension of ['js', 'ts']) {
      await vscode.commands.executeCommand('codeCat.clearSession');
      const uri = vscode.Uri.joinPath(folder.uri, `main.${extension}`);
      const document = await vscode.workspace.openTextDocument(uri);
      await vscode.window.showTextDocument(document);
      await launch.update('configurations', extension === 'ts' ? [{
        name: 'Code Cat test compiled TS', type: 'node', request: 'launch',
        program: '${workspaceFolder}/dist/main.js', cwd: '${workspaceFolder}',
        outFiles: ['${workspaceFolder}/dist/**/*.js'], sourceMaps: true,
        console: 'internalConsole', skipFiles: ['<node_internals>/**'],
      }] : [], vscode.ConfigurationTarget.WorkspaceFolder);
      const location = { path: uri.fsPath, line: 3, column: 1 };
      await vscode.commands.executeCommand('codeCat.__seedRouteGuidance', location);
      await vscode.commands.executeCommand('codeCat.toggleBreakpoint', location);
      assert.ok(await vscode.commands.executeCommand('codeCat.startGuidedDebug') === undefined);
      let lastState;
      const state = await until(async () => {
        const state = await vscode.commands.executeCommand('codeCat.__smokeState');
        lastState = state;
        return state.debugStatus === 'paused' && state.lastPauseTopFramePath === uri.fsPath && state;
      }, `${extension} actual source breakpoint`).catch(error => { console.log(JSON.stringify(lastState)); throw error; });
      assert.equal(state.lastPauseTopFrameLine, 3);
      assert.ok(state.lastPauseVariableCount > 0);
      assert.match(state.lastPauseSource, /available/);
      assert.ok(state.chatMessages.some(m => m.observation));
      try {
        ModelProviderService.prototype.request = async function(prompt) {
          assert.match(prompt, /available/);
          assert.match(prompt, /stock/);
          return JSON.stringify({message: '已观察：库存为 8，需求为 10。'});
        };
        await vscode.commands.executeCommand('codeCat.askProject', '为什么没有扣款？');
        await vscode.commands.executeCommand('codeCat.askProject', '下一步怎么验证？');
        const answered = await vscode.commands.executeCommand('codeCat.__smokeState');
        assert.equal(answered.chatMessages.filter(m => m.role === 'assistant' && !m.observation && m.pauseId).length, 2);
      } finally { ModelProviderService.prototype.request = originalRequest; }
      const session = vscode.debug.activeDebugSession;
      await vscode.debug.stopDebugging(session);
      await until(async () => (await vscode.commands.executeCommand('codeCat.__smokeState')).debugStatus === 'ended', 'debug termination');
    }
  } finally {
    await vscode.debug.stopDebugging();
    await launch.update('configurations', previous, vscode.ConfigurationTarget.WorkspaceFolder);
  }
  console.log('Code Cat Node smoke passed: JS/TS indexing, source resolution, JS automatic launch, TS source-map breakpoint, captured evidence.');
};
