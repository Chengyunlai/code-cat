export const runtimeMapStyles = String.raw`
    :root {
      color-scheme: light dark;
      --cc-bg: var(--vscode-editor-background, #ffffff);
      --cc-surface: var(--vscode-input-background, #f4f4f5);
      --cc-surface-hover: var(--vscode-list-hoverBackground, #ececee);
      --cc-user-message: var(--cc-surface);
      --cc-user-message: color-mix(in srgb, var(--cc-ink) 7%, var(--cc-bg));
      --cc-border: var(--vscode-widget-border, var(--vscode-panel-border, #dedee2));
      --cc-ink: var(--vscode-foreground, #202124);
      --cc-muted: var(--vscode-descriptionForeground, #616168);
      --cc-focus: var(--vscode-focusBorder, #2774d8);
      --cc-success: var(--vscode-testing-iconPassed, #168443);
      --cc-danger: var(--vscode-errorForeground, #c83232);
      --cc-strong: var(--vscode-foreground, #202124);
      --cc-on-strong: var(--vscode-editor-background, #ffffff);
      --cc-radius: 8px;
      --cc-ease-out: cubic-bezier(.23, 1, .32, 1);
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
    button:disabled { cursor: default; opacity: .5; }
    button:focus-visible, textarea:focus-visible {
      outline: 1px solid var(--cc-focus);
      outline-offset: 2px;
    }
    .app { min-height: 100vh; display: flex; flex-direction: column; }
    .shell { width: 100%; max-width: 780px; margin: 0 auto; }
    .app-header {
      position: sticky;
      top: 0;
      z-index: 20;
      padding: 9px 14px 0;
      background: var(--cc-bg);
      border-bottom: 1px solid var(--cc-border);
    }
    .title-row { display: flex; align-items: flex-start; justify-content: space-between; gap: 12px; }
    .title-copy { min-width: 0; padding-top: 1px; }
    .title-primary { display: flex; align-items: baseline; min-width: 0; gap: 7px; }
    .product-name { flex: 0 0 auto; margin: 0; font-size: 13px; font-weight: 600; }
    .title-separator { color: var(--cc-muted); }
    .session-title {
      display: flex;
      align-items: center;
      gap: 4px;
      min-width: 0;
      max-width: min(46vw, 360px);
      min-height: 24px;
      margin: 0;
      padding: 1px 3px;
      overflow: hidden;
      color: var(--cc-muted);
      background: transparent;
      border: 0;
      border-radius: 4px;
      text-overflow: ellipsis;
      white-space: nowrap;
      font-size: 12px;
      text-align: left;
    }
    .session-title > span:first-child { min-width: 0; overflow: hidden; text-overflow: ellipsis; }
    .session-chevron { flex: 0 0 auto; font-size: 10px; }
    .session-status {
      display: flex;
      align-items: center;
      gap: 6px;
      min-width: 0;
      margin-top: 3px;
      color: var(--cc-muted);
      font-size: 11px;
    }
    .status-dot { flex: 0 0 auto; width: 6px; height: 6px; border-radius: 50%; background: currentColor; opacity: .55; }
    .status-dot.primary { color: var(--cc-ink); opacity: 1; }
    .status-dot.success { color: var(--cc-success); opacity: 1; }
    .status-label { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .header-actions { display: flex; align-items: center; flex: 0 0 auto; }
    .model-provider {
      display: flex;
      align-items: center;
      gap: 5px;
      min-width: 32px;
      max-width: 220px;
      min-height: 32px;
      padding: 4px 6px;
      color: var(--cc-muted);
      background: transparent;
      border: 0;
      border-radius: 6px;
      text-align: left;
    }
    .model-provider-label { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 11px; }
    .model-provider-chevron { flex: 0 0 auto; color: currentColor; font-size: 11px; }
    .tabs { display: flex; gap: 2px; margin-top: 7px; overflow-x: auto; scrollbar-width: none; }
    .tabs::-webkit-scrollbar { display: none; }
    .tab {
      position: relative;
      flex: 0 0 auto;
      min-height: 36px;
      padding: 7px 9px 8px;
      color: var(--cc-muted);
      background: transparent;
      border: 0;
      border-bottom: 1px solid transparent;
      font-size: 12px;
      font-weight: 500;
    }
    .tab[aria-selected="true"] { color: var(--cc-ink); border-bottom-color: var(--cc-ink); }
    .tab-count { margin-left: 4px; color: var(--cc-muted); font-size: 10px; font-variant-numeric: tabular-nums; }
    .pause-rail {
      display: none;
      gap: 5px;
      padding: 8px 14px;
      overflow-x: auto;
      background: var(--cc-bg);
      border-bottom: 1px solid var(--cc-border);
    }
    .pause-rail.visible { display: flex; }
    .pause-chip {
      flex: 0 0 auto;
      min-height: 32px;
      max-width: 210px;
      padding: 4px 8px;
      overflow: hidden;
      color: var(--cc-muted);
      background: transparent;
      border: 0;
      border-radius: 6px;
      text-overflow: ellipsis;
      white-space: nowrap;
      font-size: 11px;
    }
    .pause-chip.selected { color: var(--cc-ink); background: var(--cc-surface); }
    main { flex: 1; width: 100%; max-width: 780px; margin: 0 auto; padding: 22px 14px 32px; }
    .section-heading { display: flex; align-items: flex-start; justify-content: space-between; gap: 12px; margin-bottom: 12px; }
    .section-heading h2 { margin: 0; font-size: 14px; font-weight: 600; text-wrap: balance; }
    .section-heading p { margin: 2px 0 0; color: var(--cc-muted); font-size: 11px; }
    .step-label { color: var(--cc-muted); font-size: 11px; font-weight: 500; }
    .source-link {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 10px;
      width: 100%;
      min-height: 40px;
      margin-top: 10px;
      padding: 8px 10px;
      color: var(--cc-ink);
      background: transparent;
      border: 1px solid var(--cc-border);
      border-radius: var(--cc-radius);
      text-align: left;
    }
    .source-name { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-family: var(--vscode-editor-font-family, ui-monospace, monospace); font-weight: 500; }
    .explanation-sections { margin-top: 20px; border-top: 1px solid var(--cc-border); }
    .explanation-section { padding: 16px 0; border-bottom: 1px solid var(--cc-border); }
    .explanation-section h3 { margin: 0 0 6px; font-size: 12px; font-weight: 600; }
    .explanation-copy { min-width: 0; max-width: 70ch; }
    .lesson-copy { margin: 14px 0; max-width: 70ch; color: var(--cc-ink); font-size: 13px; white-space: pre-wrap; text-wrap: pretty; }
    .notice { padding: 10px; color: var(--cc-muted); background: var(--cc-surface); border-radius: var(--cc-radius); }
    .notice.error { color: var(--cc-danger); }
    .pause-explanation-error { margin-top: 14px; }
    .action-row { display: flex; flex-wrap: wrap; gap: 7px; margin-top: 14px; }
    .action {
      min-height: 36px;
      padding: 7px 11px;
      color: var(--cc-ink);
      background: var(--cc-surface);
      border: 0;
      border-radius: 6px;
      font-weight: 500;
    }
    .action.primary { color: var(--cc-on-strong); background: var(--cc-strong); }
    .action.quiet { color: var(--cc-muted); background: transparent; }
    .empty-state { padding: 38px 0 0; }
    .empty-copy { max-width: 560px; }
    .empty-state h2 { margin: 0 0 6px; font-size: 15px; font-weight: 600; }
    .empty-state p { max-width: 62ch; margin: 0; color: var(--cc-muted); text-wrap: pretty; }
    .conversation { width: 100%; padding: 4px 0 24px; }
    .chat-turn { margin: 0; }
    .chat-turn.user { display: flex; justify-content: flex-end; margin-bottom: 12px; }
    .chat-turn.assistant { margin-bottom: 28px; }
    .chat-turn:last-child { margin-bottom: 0; }
    .chat-body { max-width: 70ch; overflow-wrap: anywhere; white-space: pre-wrap; text-wrap: pretty; }
    .rich-text { line-height: 1.6; white-space: normal; }
    .rich-text > :first-child { margin-top: 0; }
    .rich-text > :last-child { margin-bottom: 0; }
    .rich-text p { margin: 0 0 10px; white-space: pre-wrap; }
    .rich-text h3 { margin: 16px 0 6px; font-size: 13px; font-weight: 600; text-wrap: balance; }
    .rich-text ul, .rich-text ol { margin: 8px 0 10px; padding-left: 22px; }
    .rich-text li + li { margin-top: 4px; }
    .rich-text code {
      padding: 1px 4px;
      color: var(--vscode-textPreformat-foreground, var(--cc-ink));
      background: var(--vscode-textCodeBlock-background, var(--cc-surface));
      border-radius: 4px;
      font-family: var(--vscode-editor-font-family, ui-monospace, monospace);
      font-size: .95em;
    }
    .rich-text strong { font-weight: 600; }
    .rich-text pre {
      margin: 10px 0;
      padding: 10px 12px;
      overflow-x: auto;
      background: var(--vscode-textCodeBlock-background, var(--cc-surface));
      border-radius: 6px;
      white-space: pre;
    }
    .rich-text pre code { padding: 0; background: transparent; }
    .chat-turn.user .chat-body {
      width: fit-content;
      max-width: min(85%, 70ch);
      padding: 8px 12px;
      background: var(--cc-user-message);
      border-radius: var(--cc-radius);
    }
    .exploration-context {
      display: flex;
      align-items: flex-end;
      justify-content: space-between;
      gap: 18px;
      margin-top: 12px;
      padding-top: 16px;
      border-top: 1px solid var(--cc-border);
    }
    .exploration-copy { min-width: 0; }
    .exploration-eyebrow { color: var(--cc-muted); font-size: 10px; font-weight: 500; }
    .exploration-copy h2 {
      max-width: 62ch;
      margin: 4px 0 0;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      font-size: 13px;
      font-weight: 600;
    }
    .exploration-copy p { margin: 3px 0 0; color: var(--cc-muted); font-size: 11px; }
    .exploration-actions { display: flex; flex: 0 0 auto; flex-wrap: wrap; gap: 6px; }
    .path-complete { margin: 2px 0 0; color: var(--cc-muted); font-size: 11px; }
    .route-summary { margin-bottom: 14px; padding: 0 0 12px; color: var(--cc-muted); border-bottom: 1px solid var(--cc-border); }
    .legend { display: flex; flex-wrap: wrap; gap: 8px 13px; margin-bottom: 12px; color: var(--cc-muted); font-size: 10px; }
    .legend-item { display: flex; align-items: center; gap: 5px; }
    .legend-swatch { width: 8px; height: 8px; border-radius: 2px; background: transparent; border: 1px solid var(--cc-border); }
    .legend-swatch.current { background: var(--cc-ink); border-color: var(--cc-ink); }
    .legend-swatch.executed { background: var(--cc-muted); border-color: var(--cc-muted); }
    .legend-swatch.breakpoint { border-radius: 50%; background: var(--cc-danger); border-color: var(--cc-danger); }
    .path-scroll { overflow-x: auto; padding: 6px 1px 16px; }
    .path-flow { display: flex; align-items: stretch; width: max-content; min-width: 100%; }
    .path-node-wrap { position: relative; display: flex; align-items: center; padding-right: 24px; }
    .path-node-wrap:not(:last-child)::after { content: ''; position: absolute; top: 50%; right: 0; width: 24px; height: 1px; background: var(--cc-border); }
    .path-node-wrap.executed:not(:last-child)::after,
    .path-node-wrap.active:not(:last-child)::after { background: var(--cc-ink); }
    .path-node {
      width: 196px;
      min-height: 112px;
      padding: 11px;
      color: var(--cc-ink);
      background: transparent;
      border: 1px solid var(--cc-border);
      border-radius: var(--cc-radius);
      text-align: left;
    }
    .path-node.active, .path-node.focused { background: var(--cc-surface); border-color: var(--cc-ink); }
    .path-kicker { display: flex; align-items: center; justify-content: space-between; gap: 8px; padding-right: 38px; color: var(--cc-muted); font-size: 10px; }
    .path-index { font-variant-numeric: tabular-nums; }
    .path-title { display: block; margin-top: 7px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 13px; font-weight: 600; }
    .path-file { display: block; margin-top: 4px; overflow: hidden; color: var(--cc-muted); text-overflow: ellipsis; white-space: nowrap; font-family: var(--vscode-editor-font-family, ui-monospace, monospace); font-size: 10px; }
    .path-reason { display: -webkit-box; margin-top: 7px; overflow: hidden; color: var(--cc-muted); font-size: 11px; -webkit-box-orient: vertical; -webkit-line-clamp: 2; }
    .breakpoint-control {
      position: absolute;
      top: 0;
      right: 24px;
      z-index: 2;
      width: 36px;
      height: 36px;
      padding: 0;
      color: var(--cc-muted);
      background: transparent;
      border: 0;
      border-radius: 6px;
    }
    .breakpoint-control.on { color: var(--cc-danger); }
    .breakpoint-control.external { color: var(--cc-muted); }
    .stack-list, .variable-list { overflow: hidden; border: 1px solid var(--cc-border); border-radius: var(--cc-radius); }
    .pause-guidance { margin: 0 0 20px; }
    .stack-frame {
      display: grid;
      grid-template-columns: 30px minmax(0, 1fr) auto;
      align-items: center;
      gap: 8px;
      width: 100%;
      min-height: 48px;
      padding: 8px 10px;
      color: var(--cc-ink);
      background: transparent;
      border: 0;
      border-bottom: 1px solid var(--cc-border);
      text-align: left;
    }
    .stack-frame:last-child { border-bottom: 0; }
    .stack-frame.selected { background: var(--cc-surface); }
    .frame-number { color: var(--cc-muted); font-family: var(--vscode-editor-font-family, ui-monospace, monospace); font-size: 10px; }
    .frame-copy { min-width: 0; }
    .frame-name { display: block; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-weight: 500; }
    .frame-file { display: block; overflow: hidden; color: var(--cc-muted); text-overflow: ellipsis; white-space: nowrap; font-family: var(--vscode-editor-font-family, ui-monospace, monospace); font-size: 10px; }
    .frame-arrow { color: var(--cc-muted); }
    .variable-row { display: grid; grid-template-columns: minmax(90px, .65fr) minmax(0, 1.35fr); gap: 12px; padding: 9px 10px; border-bottom: 1px solid var(--cc-border); }
    .variable-row:last-child { border-bottom: 0; }
    .variable-key { min-width: 0; }
    .variable-name { display: block; overflow-wrap: anywhere; color: var(--cc-ink); font-family: var(--vscode-editor-font-family, ui-monospace, monospace); font-weight: 500; }
    .variable-type { display: block; margin-top: 1px; color: var(--cc-muted); font-size: 10px; }
    .variable-value { overflow-wrap: anywhere; font-family: var(--vscode-editor-font-family, ui-monospace, monospace); }
    .skeleton { overflow: hidden; }
    .skeleton-line { height: 10px; margin: 9px 0; background: var(--cc-surface); border-radius: 3px; }
    .skeleton-line.short { width: 38%; }
    .skeleton-line.medium { width: 62%; }
    .skeleton-block { height: 96px; margin-top: 16px; background: var(--cc-surface); border-radius: var(--cc-radius); }
    .busy-label { color: var(--cc-ink); font-weight: 500; }
    .composer {
      position: sticky;
      bottom: 0;
      z-index: 20;
      margin-top: auto;
      padding: 10px 14px 14px;
      background: var(--cc-bg);
    }
    .composer-shell { width: 100%; max-width: 752px; margin: 0 auto; }
    .composer-inner {
      width: 100%;
      padding: 7px 9px 7px 11px;
      background: var(--cc-bg);
      border: 1px solid var(--cc-border);
      border-radius: 10px;
      transition: border-color 150ms ease, background-color 150ms ease;
    }
    .composer-inner:focus-within { border-color: var(--cc-focus); }
    .composer-inner.busy { background: var(--cc-surface); }
    .composer textarea {
      display: block;
      width: 100%;
      min-height: 46px;
      max-height: 140px;
      padding: 7px 2px 5px;
      resize: none;
      overflow-y: auto;
      color: var(--cc-ink);
      caret-color: var(--cc-focus);
      background: transparent;
      border: 0;
      line-height: 1.45;
    }
    .composer textarea::placeholder { color: var(--cc-muted); opacity: 1; }
    .composer textarea:focus-visible { outline: 0; }
    .composer-meta { display: flex; align-items: center; justify-content: space-between; gap: 12px; min-height: 32px; }
    .composer-mode { min-width: 0; overflow: hidden; color: var(--cc-muted); text-overflow: ellipsis; white-space: nowrap; font-size: 11px; }
    .composer-controls { display: flex; align-items: center; gap: 7px; flex: 0 0 auto; }
    .composer-shortcut { display: flex; align-items: center; gap: 3px; color: var(--cc-muted); font-size: 10px; }
    .composer-shortcut kbd {
      min-width: 22px;
      padding: 0 4px;
      color: var(--cc-muted);
      background: transparent;
      border: 1px solid var(--cc-border);
      border-radius: 4px;
      font: 9px/1.6 var(--vscode-font-family, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif);
      text-align: center;
    }
    .send {
      display: grid;
      place-items: center;
      flex: 0 0 auto;
      width: 30px;
      height: 30px;
      padding: 0;
      color: var(--cc-on-strong);
      background: var(--cc-strong);
      border: 0;
      border-radius: 7px;
      transition: opacity 120ms ease, transform 140ms var(--cc-ease-out);
    }
    .send:disabled { color: var(--cc-muted); background: var(--cc-surface); opacity: 1; }
    .send-label { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; }
    .send-arrow { font-size: 15px; line-height: 1; }
    .session-title,
    .model-provider,
    .pause-chip,
    .source-link,
    .action,
    .path-node,
    .breakpoint-control {
      transition:
        transform 140ms var(--cc-ease-out),
        background-color 120ms ease,
        border-color 120ms ease,
        color 120ms ease,
        opacity 120ms ease;
    }
    @media (hover: hover) and (pointer: fine) {
      .session-title:hover { color: var(--cc-ink); background: var(--cc-surface-hover); }
      .model-provider:hover { color: var(--cc-ink); background: var(--cc-surface-hover); }
      .tab:hover { color: var(--cc-ink); }
      .pause-chip:hover { color: var(--cc-ink); background: var(--cc-surface-hover); }
      .source-link:hover { background: var(--cc-surface-hover); }
      .action:hover { background: var(--cc-surface-hover); }
      .action.primary:hover { opacity: .88; }
      .action.quiet:hover { color: var(--cc-ink); background: var(--cc-surface-hover); opacity: 1; }
      .path-node:hover { background: var(--cc-surface-hover); }
      .breakpoint-control:hover { color: var(--cc-ink); background: var(--cc-surface-hover); }
      .stack-frame:hover { background: var(--cc-surface-hover); }
      .composer-inner:hover { border-color: var(--cc-muted); }
      .send:hover { opacity: .84; }
    }
    .model-provider:active:not(:disabled),
    .session-title:active:not(:disabled),
    .pause-chip:active:not(:disabled),
    .action:active:not(:disabled) { transform: scale(.97); }
    .source-link:active:not(:disabled),
    .path-node:active:not(:disabled) { transform: scale(.99); }
    .breakpoint-control:active:not(:disabled),
    .send:active:not(:disabled) { transform: scale(.96); }
    .session-title:focus-visible,
    .model-provider:focus-visible,
    .pause-chip:focus-visible,
    .source-link:focus-visible,
    .action:focus-visible,
    .path-node:focus-visible,
    .breakpoint-control:focus-visible,
    .send:focus-visible { transition-duration: 0ms; }
    .session-title:focus-visible:active,
    .model-provider:focus-visible:active,
    .pause-chip:focus-visible:active,
    .source-link:focus-visible:active,
    .action:focus-visible:active,
    .path-node:focus-visible:active,
    .breakpoint-control:focus-visible:active,
    .send:focus-visible:active { transform: none; }
    @media (min-width: 620px) {
      .app-header { padding-inline: 18px; }
      main { padding: 26px 18px 38px; }
      .pause-rail { padding-inline: 18px; }
      .composer { padding-inline: 18px; }
      .explanation-section { display: grid; grid-template-columns: 132px minmax(0, 1fr); gap: 24px; }
      .explanation-section h3 { margin: 2px 0 0; }
    }
    @media (max-width: 480px) {
      .title-separator, .product-name { display: none; }
      .session-title { max-width: 48vw; }
      .model-provider { width: 32px; padding: 0; justify-content: center; }
      .model-provider-label { display: none; }
      .chat-turn.user .chat-body { max-width: min(92%, 70ch); }
      .composer-shortcut { display: none; }
      .variable-row { grid-template-columns: 1fr; gap: 4px; }
      .exploration-context { align-items: flex-start; flex-direction: column; }
    }
    @media (prefers-reduced-motion: reduce) {
      *, *::before, *::after { scroll-behavior: auto !important; transition-duration: .01ms !important; }
    }
`;
