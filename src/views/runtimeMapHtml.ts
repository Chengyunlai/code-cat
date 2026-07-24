import * as vscode from "vscode";
import { runtimeMapScript } from "./runtimeMapScript";
import { runtimeMapStyles } from "./runtimeMapStyles";

export function createRuntimeMapHtml(webview: vscode.Webview): string {
  const nonce = getNonce();
  return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource} 'unsafe-inline'; script-src 'nonce-${nonce}';">
  <title>Code Cat Runtime Map</title>
  <style>
    ${runtimeMapStyles}
  </style>
</head>
<body>
  <div class="app">
    <header class="app-header">
      <div class="shell">
        <div class="title-row">
          <div class="title-copy">
            <div class="title-primary">
              <h1 class="product-name">Code Cat</h1>
              <span class="title-separator" aria-hidden="true">/</span>
              <p id="session-title" class="session-title">Python 项目</p>
            </div>
            <div class="session-status" aria-live="polite">
              <span id="status-dot" class="status-dot"></span>
              <span id="status-label" class="status-label">等待代码问题</span>
            </div>
          </div>
          <div class="header-actions">
            <button id="configure-model" type="button" class="model-provider" aria-label="配置大模型" title="配置大模型">
              <span id="model-provider-label" class="model-provider-label">VS Code 内置模型</span>
              <span class="model-provider-chevron" aria-hidden="true">⌄</span>
            </button>
          </div>
        </div>
        <nav id="tabs" class="tabs" role="tablist" aria-label="Code Cat 视图">
          <button id="tab-overview" type="button" class="tab" role="tab" data-tab="overview" aria-controls="content" aria-selected="true" tabindex="0">概览</button>
          <button id="tab-path" type="button" class="tab" role="tab" data-tab="path" aria-controls="content" aria-selected="false" tabindex="-1">路径<span id="path-count" class="tab-count"></span></button>
          <button id="tab-stack" type="button" class="tab" role="tab" data-tab="stack" aria-controls="content" aria-selected="false" tabindex="-1">调用栈<span id="stack-count" class="tab-count"></span></button>
          <button id="tab-variables" type="button" class="tab" role="tab" data-tab="variables" aria-controls="content" aria-selected="false" tabindex="-1">变量<span id="variable-count" class="tab-count"></span></button>
        </nav>
      </div>
    </header>
    <div id="pause-rail" class="pause-rail shell" aria-label="暂停历史"></div>
    <main id="content" role="tabpanel" aria-labelledby="tab-overview" tabindex="0"></main>
    <footer class="composer">
      <div class="composer-shell">
        <div id="composer-inner" class="composer-inner">
          <textarea id="question" rows="1" aria-label="代码问题" aria-describedby="composer-mode composer-shortcut" placeholder="你想理解哪段代码？"></textarea>
          <div class="composer-meta">
            <div id="composer-mode" class="composer-mode" aria-live="polite">定位代码路径</div>
            <div class="composer-controls">
              <div id="composer-shortcut" class="composer-shortcut" aria-label="Enter 发送，Shift 加 Enter 换行">
                <kbd>Enter</kbd><span>发送</span><span aria-hidden="true">·</span><kbd>Shift</kbd><span aria-hidden="true">+</span><kbd>Enter</kbd><span>换行</span>
              </div>
              <button id="locate" type="button" class="send" aria-label="定位代码路径" title="定位代码路径" disabled>
                <span class="send-label">发送</span>
                <span class="send-arrow" aria-hidden="true">↑</span>
              </button>
            </div>
          </div>
        </div>
      </div>
    </footer>
  </div>

  <template id="debug-actions">
    <div class="action-row">
      <button type="button" class="action primary" data-debug="continue">继续运行</button>
      <button type="button" class="action" data-debug="stepInto">进入函数</button>
      <button type="button" class="action" data-debug="stepOver">单步跳过</button>
      <button type="button" class="action quiet" data-action="explain">解释当前暂停</button>
    </div>
  </template>

  <script nonce="${nonce}">
    ${runtimeMapScript}
  </script>
</body>
</html>`;
}

function getNonce(): string {
  const characters = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  let nonce = "";
  for (let index = 0; index < 32; index += 1) {
    nonce += characters.charAt(Math.floor(Math.random() * characters.length));
  }
  return nonce;
}
