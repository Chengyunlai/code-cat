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
            <h1 class="product-name">Code Cat</h1>
            <p id="session-title" class="session-title">Python 代码阅读助手</p>
            <div class="session-status" aria-live="polite">
              <span id="status-dot" class="status-dot"></span>
              <span id="status-label" class="status-label">提出问题，建立第一条代码路径</span>
            </div>
          </div>
          <div class="header-mark" aria-hidden="true">⌁</div>
        </div>
        <nav id="tabs" class="tabs" role="tablist" aria-label="Code Cat 视图">
          <button id="tab-overview" type="button" class="tab" role="tab" data-tab="overview" aria-controls="content" aria-selected="true" tabindex="0">当前步骤</button>
          <button id="tab-path" type="button" class="tab" role="tab" data-tab="path" aria-controls="content" aria-selected="false" tabindex="-1">执行路径<span id="path-count" class="tab-count"></span></button>
          <button id="tab-stack" type="button" class="tab" role="tab" data-tab="stack" aria-controls="content" aria-selected="false" tabindex="-1">调用栈<span id="stack-count" class="tab-count"></span></button>
          <button id="tab-variables" type="button" class="tab" role="tab" data-tab="variables" aria-controls="content" aria-selected="false" tabindex="-1">变量<span id="variable-count" class="tab-count"></span></button>
        </nav>
      </div>
    </header>
    <div id="pause-rail" class="pause-rail shell" aria-label="暂停历史"></div>
    <main id="content" role="tabpanel" aria-labelledby="tab-overview" tabindex="0"></main>
    <footer class="composer">
      <div class="composer-shell">
        <div class="composer-meta">
          <div class="composer-mode">
            <span class="composer-mode-dot" aria-hidden="true"></span>
            <span id="composer-mode" aria-live="polite">定位代码路径</span>
          </div>
          <div class="composer-shortcut" aria-label="快捷键 Command 或 Control 加 Enter">
            <kbd>⌘/Ctrl</kbd><span aria-hidden="true">+</span><kbd>Enter</kbd>
          </div>
        </div>
        <div id="composer-inner" class="composer-inner">
          <textarea id="question" rows="1" aria-label="代码问题" aria-describedby="composer-mode" placeholder="你想理解哪段代码？"></textarea>
          <button id="locate" type="button" class="send" aria-label="定位代码路径" title="定位代码路径" disabled>
            <span class="send-label">发送</span>
            <span class="send-arrow" aria-hidden="true">↑</span>
          </button>
        </div>
      </div>
    </footer>
  </div>

  <template id="debug-actions">
    <div class="action-row">
      <button type="button" class="action primary" data-debug="continue">继续</button>
      <button type="button" class="action" data-debug="stepInto">进入函数</button>
      <button type="button" class="action" data-debug="stepOver">跳过此层</button>
      <button type="button" class="action quiet" data-action="explain">详细解释</button>
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
