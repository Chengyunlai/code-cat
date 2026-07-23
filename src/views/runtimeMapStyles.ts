export const runtimeMapStyles = String.raw`
    :root {
      color-scheme: light dark;
      --cc-bg: #ffffff;
      --cc-panel: #f5f5f7;
      --cc-panel-strong: #eeeef1;
      --cc-border: #e0e0e3;
      --cc-ink: #18181b;
      --cc-muted: #66666f;
      --cc-faint: #71717a;
      --cc-primary: #2563eb;
      --cc-primary-soft: #e8efff;
      --cc-success: #16a34a;
      --cc-success-soft: #e8f7ee;
      --cc-danger: #dc2626;
      --cc-strong: #18181b;
      --cc-on-strong: #ffffff;
      --cc-focus: #2563eb;
      --cc-composer-bg: #f5f5f7;
      --cc-composer-focus: #ffffff;
      --cc-composer-border: #d8d8dd;
      --cc-composer-placeholder: #66666f;
      --cc-radius: 10px;
      --cc-ease: cubic-bezier(.16, 1, .3, 1);
    }
    body.vscode-dark {
      --cc-bg: var(--vscode-sideBar-background, #18181b);
      --cc-panel: var(--vscode-editorWidget-background, #242427);
      --cc-panel-strong: var(--vscode-input-background, #2d2d31);
      --cc-border: var(--vscode-panel-border, #3f3f46);
      --cc-ink: var(--vscode-foreground, #f4f4f5);
      --cc-muted: var(--vscode-descriptionForeground, #b4b4bc);
      --cc-faint: #a1a1aa;
      --cc-primary: #4f8cff;
      --cc-primary-soft: #1d2b49;
      --cc-success: #3fcf72;
      --cc-success-soft: #173623;
      --cc-strong: #f4f4f5;
      --cc-on-strong: #18181b;
      --cc-composer-bg: var(--vscode-input-background, #242427);
      --cc-composer-focus: var(--vscode-editorWidget-background, #2a2a2e);
      --cc-composer-border: var(--vscode-input-border, #48484f);
      --cc-composer-placeholder: var(--vscode-input-placeholderForeground, #b4b4bc);
    }
    * { box-sizing: border-box; }
    html, body { min-height: 100%; }
    body {
      margin: 0;
      color: var(--cc-ink);
      background: var(--cc-bg);
      font: 13px/1.5 var(--vscode-font-family, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif);
      -webkit-font-smoothing: antialiased;
    }
    button, textarea { font: inherit; }
    button { cursor: pointer; }
    button:disabled { cursor: default; opacity: .55; }
    button:focus-visible, textarea:focus-visible {
      outline: 2px solid var(--cc-focus);
      outline-offset: 2px;
    }
    .app { min-height: 100vh; display: flex; flex-direction: column; }
    .shell { width: 100%; max-width: 840px; margin: 0 auto; }
    .app-header {
      position: sticky;
      top: 0;
      z-index: 20;
      padding: 14px 16px 0;
      background: var(--cc-bg);
      border-bottom: 1px solid var(--cc-border);
    }
    .title-row { display: flex; align-items: flex-start; justify-content: space-between; gap: 12px; }
    .title-copy { min-width: 0; }
    .product-name { margin: 0; font-size: 14px; font-weight: 720; text-wrap: balance; }
    .session-title { margin: 2px 0 0; color: var(--cc-muted); font-size: 12px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .session-status { display: flex; align-items: center; gap: 7px; min-width: 0; margin-top: 8px; color: var(--cc-muted); font-size: 12px; }
    .status-dot { flex: 0 0 auto; width: 8px; height: 8px; border-radius: 50%; background: var(--cc-faint); }
    .status-dot.primary { background: var(--cc-primary); }
    .status-dot.success { background: var(--cc-success); }
    .status-label { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .header-mark {
      display: grid;
      place-items: center;
      flex: 0 0 auto;
      width: 36px;
      height: 36px;
      color: var(--cc-primary);
      background: var(--cc-primary-soft);
      border-radius: 9px;
      font-size: 17px;
      font-weight: 800;
    }
    .tabs { display: flex; gap: 4px; margin-top: 14px; overflow-x: auto; scrollbar-width: none; }
    .tabs::-webkit-scrollbar { display: none; }
    .tab {
      position: relative;
      flex: 0 0 auto;
      min-height: 44px;
      padding: 8px 10px 10px;
      color: var(--cc-muted);
      background: transparent;
      border: 0;
      border-bottom: 2px solid transparent;
      font-weight: 620;
    }
    .tab:hover { color: var(--cc-ink); }
    .tab[aria-selected="true"] { color: var(--cc-primary); border-bottom-color: var(--cc-primary); }
    .tab-count { margin-left: 4px; color: var(--cc-faint); font-size: 11px; font-variant-numeric: tabular-nums; }
    .pause-rail { display: none; gap: 6px; padding: 10px 16px; overflow-x: auto; background: var(--cc-bg); border-bottom: 1px solid var(--cc-border); }
    .pause-rail.visible { display: flex; }
    .pause-chip {
      flex: 0 0 auto;
      min-height: 44px;
      max-width: 210px;
      padding: 5px 9px;
      overflow: hidden;
      color: var(--cc-muted);
      background: var(--cc-panel);
      border: 1px solid transparent;
      border-radius: 999px;
      text-overflow: ellipsis;
      white-space: nowrap;
      font-size: 11px;
    }
    .pause-chip:hover { color: var(--cc-ink); }
    .pause-chip.selected { color: var(--cc-primary); background: var(--cc-primary-soft); border-color: var(--cc-primary); }
    main { flex: 1; width: 100%; max-width: 840px; margin: 0 auto; padding: 18px 16px 32px; }
    .view { animation: reveal 180ms var(--cc-ease); }
    .section-heading { display: flex; align-items: center; justify-content: space-between; gap: 12px; margin-bottom: 10px; }
    .section-heading h2 { margin: 0; font-size: 14px; font-weight: 720; text-wrap: balance; }
    .section-heading p { margin: 2px 0 0; color: var(--cc-muted); font-size: 12px; }
    .step-label { display: flex; align-items: center; gap: 8px; color: var(--cc-muted); font-size: 12px; font-weight: 650; }
    .step-icon { display: grid; place-items: center; width: 26px; height: 26px; color: var(--cc-primary); background: var(--cc-primary-soft); border-radius: 7px; }
    .source-link {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 10px;
      width: 100%;
      min-height: 44px;
      margin-top: 12px;
      padding: 10px 12px;
      color: var(--cc-primary);
      background: var(--cc-panel);
      border: 0;
      border-radius: 8px;
      text-align: left;
    }
    .source-link:hover { background: var(--cc-panel-strong); }
    .source-name { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-family: var(--vscode-editor-font-family, ui-monospace, monospace); font-weight: 650; }
    .lesson-copy { margin: 16px 0; max-width: 70ch; color: var(--cc-ink); font-size: 14px; white-space: pre-wrap; text-wrap: pretty; }
    .notice { padding: 12px; color: var(--cc-muted); background: var(--cc-panel); border-radius: var(--cc-radius); }
    .notice.error { color: var(--vscode-errorForeground, var(--cc-danger)); }
    .evidence-copy { margin: 0; color: var(--cc-muted); text-wrap: pretty; }
    .evidence {
      margin-top: 14px;
      padding: 12px;
      background: var(--cc-panel);
      border: 1px solid var(--cc-border);
      border-radius: var(--cc-radius);
    }
    .evidence-head { display: flex; align-items: center; justify-content: space-between; gap: 12px; margin-bottom: 8px; }
    .evidence-title { display: flex; align-items: center; gap: 7px; color: var(--cc-muted); font-size: 12px; font-weight: 650; }
    .evidence-dot { width: 7px; height: 7px; border-radius: 50%; background: var(--cc-primary); }
    .text-action { min-height: 44px; padding: 3px; color: var(--cc-primary); background: transparent; border: 0; }
    .text-action:hover { text-decoration: underline; }
    .variable-preview { display: grid; grid-template-columns: minmax(90px, .7fr) minmax(0, 1fr); gap: 6px 12px; margin: 0; }
    .variable-preview dt { color: var(--cc-muted); overflow-wrap: anywhere; }
    .variable-preview dd { margin: 0; overflow-wrap: anywhere; font-family: var(--vscode-editor-font-family, ui-monospace, monospace); }
    .action-row { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 16px; }
    .action {
      min-height: 44px;
      padding: 8px 14px;
      color: var(--cc-on-strong);
      background: var(--cc-strong);
      border: 0;
      border-radius: 6px;
      font-weight: 650;
    }
    .action:hover { filter: brightness(.92); }
    .action.primary { color: #fff; background: var(--cc-primary); }
    .action.quiet { color: var(--cc-muted); background: transparent; }
    .action.quiet:hover { color: var(--cc-ink); background: var(--cc-panel); filter: none; }
    .tags { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 16px; }
    .tag { padding: 4px 8px; color: var(--cc-muted); background: var(--cc-panel); border-radius: 4px; font-size: 11px; }
    .tag.current { color: var(--cc-primary); background: var(--cc-primary-soft); }
    .empty-state { display: grid; place-items: center; min-height: 330px; text-align: center; }
    .empty-copy { max-width: 360px; }
    .empty-symbol { display: grid; place-items: center; width: 54px; height: 54px; margin: 0 auto 18px; color: var(--cc-primary); background: var(--cc-primary-soft); border-radius: 14px; font-size: 24px; }
    .empty-state h2 { margin: 0 0 8px; font-size: 17px; }
    .empty-state p { margin: 0; color: var(--cc-muted); text-wrap: pretty; }
    .route-summary { margin-bottom: 16px; padding: 12px; color: var(--cc-muted); background: var(--cc-panel); border-radius: var(--cc-radius); }
    .legend { display: flex; flex-wrap: wrap; gap: 10px 14px; margin-bottom: 14px; color: var(--cc-muted); font-size: 11px; }
    .legend-item { display: flex; align-items: center; gap: 5px; }
    .legend-swatch { width: 9px; height: 9px; border-radius: 3px; background: var(--cc-panel-strong); border: 1px solid var(--cc-border); }
    .legend-swatch.current { background: var(--cc-primary); border-color: var(--cc-primary); }
    .legend-swatch.executed { background: var(--cc-muted); border-color: var(--cc-muted); }
    .legend-swatch.breakpoint { border-radius: 50%; background: var(--cc-danger); border-color: var(--cc-danger); }
    .path-scroll { overflow-x: auto; padding: 8px 2px 18px; }
    .path-flow { display: flex; align-items: stretch; width: max-content; min-width: 100%; }
    .path-node-wrap { position: relative; display: flex; align-items: center; padding-right: 30px; }
    .path-node-wrap:not(:last-child)::after { content: ''; position: absolute; top: 50%; right: 0; width: 30px; height: 2px; background: var(--cc-border); }
    .path-node-wrap.executed:not(:last-child)::after,
    .path-node-wrap.active:not(:last-child)::after { background: var(--cc-primary); }
    .path-node {
      width: 210px;
      min-height: 122px;
      padding: 12px;
      color: var(--cc-ink);
      background: var(--cc-bg);
      border: 1px dashed var(--cc-border);
      border-radius: var(--cc-radius);
      text-align: left;
    }
    .path-node:hover { border-color: var(--cc-primary); }
    .path-node.executed { border-style: solid; }
    .path-node.active { background: var(--cc-primary-soft); border-color: var(--cc-primary); border-style: solid; }
    .path-node.focused { border-width: 2px; }
    .path-kicker { display: flex; align-items: center; justify-content: space-between; gap: 8px; padding-right: 44px; color: var(--cc-muted); font-size: 10px; }
    .path-index { color: var(--cc-primary); font-variant-numeric: tabular-nums; }
    .path-title { display: block; margin-top: 8px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 14px; font-weight: 700; }
    .path-file { display: block; margin-top: 5px; overflow: hidden; color: var(--cc-muted); text-overflow: ellipsis; white-space: nowrap; font-family: var(--vscode-editor-font-family, ui-monospace, monospace); font-size: 11px; }
    .path-reason { display: -webkit-box; margin-top: 8px; overflow: hidden; color: var(--cc-muted); font-size: 11px; -webkit-box-orient: vertical; -webkit-line-clamp: 2; }
    .breakpoint-control {
      position: absolute;
      top: 2px;
      right: 30px;
      z-index: 2;
      width: 44px;
      height: 44px;
      padding: 0;
      color: var(--cc-faint);
      background: transparent;
      border: 1px solid transparent;
      border-radius: 50%;
    }
    .breakpoint-control:hover { background: var(--cc-panel); border-color: var(--cc-border); }
    .breakpoint-control.on { color: var(--cc-danger); }
    .stack-list, .variable-list { background: var(--cc-panel); border-radius: var(--cc-radius); overflow: hidden; }
    .stack-frame { display: grid; grid-template-columns: 32px minmax(0, 1fr) auto; align-items: center; gap: 8px; width: 100%; min-height: 52px; padding: 9px 12px; color: var(--cc-ink); background: transparent; border: 0; border-bottom: 1px solid var(--cc-border); text-align: left; }
    .stack-frame:last-child { border-bottom: 0; }
    .stack-frame:hover { background: var(--cc-panel-strong); }
    .stack-frame.selected { color: var(--cc-primary); background: var(--cc-primary-soft); }
    .frame-number { color: var(--cc-faint); font-family: var(--vscode-editor-font-family, ui-monospace, monospace); font-size: 11px; }
    .frame-copy { min-width: 0; }
    .frame-name { display: block; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-weight: 650; }
    .frame-file { display: block; overflow: hidden; color: var(--cc-muted); text-overflow: ellipsis; white-space: nowrap; font-family: var(--vscode-editor-font-family, ui-monospace, monospace); font-size: 11px; }
    .frame-arrow { color: var(--cc-faint); }
    .variable-row { display: grid; grid-template-columns: minmax(90px, .65fr) minmax(0, 1.35fr); gap: 12px; padding: 11px 12px; border-bottom: 1px solid var(--cc-border); }
    .variable-row:last-child { border-bottom: 0; }
    .variable-key { min-width: 0; }
    .variable-name { display: block; overflow-wrap: anywhere; color: var(--cc-primary); font-family: var(--vscode-editor-font-family, ui-monospace, monospace); font-weight: 650; }
    .variable-type { display: block; margin-top: 2px; color: var(--cc-faint); font-size: 10px; }
    .variable-value { overflow-wrap: anywhere; font-family: var(--vscode-editor-font-family, ui-monospace, monospace); }
    .complete { max-width: 540px; margin: 80px auto 0; text-align: center; }
    .complete-mark { display: grid; place-items: center; width: 56px; height: 56px; margin: 0 auto 20px; color: var(--cc-success); background: var(--cc-success-soft); border-radius: 50%; font-size: 28px; }
    .complete h2 { margin: 0; font-size: 20px; }
    .complete p { margin: 8px 0 0; color: var(--cc-muted); }
    .complete-stats { margin: 24px 0 16px; padding: 14px 16px; background: var(--cc-panel); border-radius: var(--cc-radius); text-align: left; }
    .stat { display: flex; align-items: center; justify-content: space-between; gap: 16px; padding: 5px 0; }
    .stat-label { color: var(--cc-muted); }
    .stat-value { font-weight: 700; font-variant-numeric: tabular-nums; }
    .skeleton { overflow: hidden; }
    .skeleton-line { height: 14px; margin: 10px 0; background: var(--cc-panel); border-radius: 4px; }
    .skeleton-line.short { width: 42%; }
    .skeleton-line.medium { width: 68%; }
    .skeleton-block { height: 118px; margin-top: 20px; background: var(--cc-panel); border-radius: var(--cc-radius); }
    .busy-label { color: var(--cc-primary); font-weight: 650; }
    .composer {
      position: sticky;
      bottom: 0;
      z-index: 20;
      margin-top: auto;
      padding: 11px 16px 13px;
      background: var(--cc-bg);
      border-top: 1px solid var(--cc-border);
    }
    .composer-shell { width: 100%; max-width: 808px; margin: 0 auto; }
    .composer-meta {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
      min-height: 24px;
      margin: 0 3px 7px;
      color: var(--cc-muted);
      font-size: 11px;
    }
    .composer-mode { display: flex; align-items: center; gap: 7px; min-width: 0; color: var(--cc-ink); font-weight: 650; }
    .composer-mode-dot { flex: 0 0 auto; width: 7px; height: 7px; background: var(--cc-primary); border-radius: 50%; }
    .composer-mode span:last-child { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .composer-shortcut { display: flex; align-items: center; gap: 4px; flex: 0 0 auto; color: var(--cc-faint); }
    .composer-shortcut kbd {
      min-width: 26px;
      padding: 1px 5px;
      color: var(--cc-muted);
      background: var(--cc-panel);
      border: 1px solid var(--cc-border);
      border-radius: 4px;
      font: 10px/1.5 var(--vscode-font-family, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif);
      text-align: center;
    }
    .composer-inner {
      display: flex;
      align-items: flex-end;
      gap: 8px;
      width: 100%;
      padding: 7px 7px 7px 12px;
      background: var(--cc-composer-bg);
      border: 1px solid var(--cc-composer-border);
      border-radius: 12px;
      transition: background-color 160ms var(--cc-ease), border-color 160ms var(--cc-ease), box-shadow 160ms var(--cc-ease);
    }
    .composer-inner:focus-within {
      background: var(--cc-composer-focus);
      border-color: var(--cc-primary);
      box-shadow: 0 0 0 3px var(--cc-primary-soft);
    }
    .composer-inner.busy { background: var(--cc-panel); }
    .composer textarea {
      flex: 1;
      min-width: 0;
      min-height: 44px;
      max-height: 120px;
      padding: 11px 2px;
      resize: none;
      overflow-y: auto;
      color: var(--cc-ink);
      caret-color: var(--cc-primary);
      background: transparent;
      border: 0;
      line-height: 1.4;
    }
    .composer textarea::placeholder { color: var(--cc-composer-placeholder); opacity: 1; }
    .composer textarea:focus-visible { outline: 0; }
    .send {
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 7px;
      flex: 0 0 auto;
      min-width: 76px;
      height: 44px;
      padding: 0 13px;
      color: #fff;
      background: var(--cc-primary);
      border: 0;
      border-radius: 8px;
      font-weight: 700;
      transition: filter 140ms var(--cc-ease), transform 140ms var(--cc-ease);
    }
    .send:hover { filter: brightness(.94); }
    .send:active { transform: translateY(1px); }
    .send:disabled { color: var(--cc-faint); background: var(--cc-panel-strong); opacity: 1; }
    .send-arrow { font-size: 17px; font-weight: 500; line-height: 1; }
    @keyframes reveal { from { opacity: .65; transform: translateY(3px); } to { opacity: 1; transform: none; } }
    @media (min-width: 620px) {
      .app-header { padding-inline: 22px; }
      main { padding: 24px 22px 40px; }
      .pause-rail { padding-inline: 22px; }
      .composer { padding-inline: 22px; }
      .overview-grid { display: grid; grid-template-columns: minmax(0, 1.3fr) minmax(220px, .7fr); gap: 16px; align-items: start; }
      .overview-grid .evidence { margin-top: 0; }
    }
    @media (max-width: 420px) {
      .composer-shortcut { display: none; }
      .send { min-width: 44px; width: 44px; padding: 0; }
      .send-label { display: none; }
    }
    @media (prefers-reduced-motion: reduce) {
      *, *::before, *::after { scroll-behavior: auto !important; animation-duration: .01ms !important; transition-duration: .01ms !important; }
    }
`;
