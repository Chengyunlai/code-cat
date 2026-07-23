export const runtimeMapScript = String.raw`
    const vscode = acquireVsCodeApi();
    window.addEventListener('error', (event) => {
      vscode.postMessage({ type: 'scriptError', error: String(event.error || event.message) });
    });
    const elements = {
      content: document.getElementById('content'),
      composerInner: document.getElementById('composer-inner'),
      composerMode: document.getElementById('composer-mode'),
      configureModel: document.getElementById('configure-model'),
      modelProviderLabel: document.getElementById('model-provider-label'),
      pathCount: document.getElementById('path-count'),
      pauseRail: document.getElementById('pause-rail'),
      question: document.getElementById('question'),
      send: document.getElementById('locate'),
      sessionTitle: document.getElementById('session-title'),
      stackCount: document.getElementById('stack-count'),
      statusDot: document.getElementById('status-dot'),
      statusLabel: document.getElementById('status-label'),
      tabs: document.getElementById('tabs'),
      variableCount: document.getElementById('variable-count'),
    };
    let activeTab = 'overview';
    let requestPending = false;
    let currentState = {
      route: undefined,
      pauses: [],
      frames: [],
      variables: [],
      tutorMessage: undefined,
      busyMessage: undefined,
      debugStatus: 'idle',
      livePauseId: undefined,
      requestPending: false,
      requestKind: undefined,
      modelProvider: { label: 'VS Code 内置模型' },
      debugging: false,
    };

    document.getElementById('locate').addEventListener('click', submitQuestion);
    elements.configureModel.addEventListener('click', () => vscode.postMessage({ type: 'configureModel' }));
    elements.question.addEventListener('keydown', (event) => {
      if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
        event.preventDefault();
        submitQuestion();
      }
    });
    elements.question.addEventListener('input', () => {
      resizeQuestion();
      updateSendAvailability();
    });
    elements.tabs.addEventListener('click', (event) => {
      const tab = event.target.closest('[data-tab]');
      if (!tab) return;
      activeTab = tab.dataset.tab;
      render(currentState);
    });
    elements.tabs.addEventListener('keydown', (event) => {
      if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
      const tabs = Array.from(elements.tabs.querySelectorAll('[role="tab"]'));
      const currentIndex = tabs.indexOf(event.target);
      if (currentIndex < 0) return;
      event.preventDefault();
      const direction = event.key === 'ArrowRight' ? 1 : -1;
      const nextTab = tabs[(currentIndex + direction + tabs.length) % tabs.length];
      activeTab = nextTab.dataset.tab;
      render(currentState);
      nextTab.focus();
    });

    window.addEventListener('message', (event) => {
      if (event.data?.type === 'state') {
        currentState = event.data.state;
        render(currentState);
        vscode.postMessage({ type: 'renderedState', version: event.data.version });
      }
    });

    function render(state) {
      requestPending = Boolean(state.requestPending || state.busyMessage);
      const route = state.route;
      const frames = state.frames || [];
      const variables = state.variables || [];
      const pauses = state.pauses || [];
      elements.sessionTitle.textContent = route?.question || 'Python 项目';
      elements.pathCount.textContent = route ? String(route.nodes.length) : '';
      elements.stackCount.textContent = frames.length ? String(frames.length) : '';
      elements.variableCount.textContent = variables.length ? String(variables.length) : '';
      const modelProvider = state.modelProvider || { label: 'VS Code 内置模型' };
      elements.modelProviderLabel.textContent = modelProvider.detail
        ? modelProvider.label + ' · ' + modelProvider.detail
        : modelProvider.label;
      elements.configureModel.title = '当前模型：' + elements.modelProviderLabel.textContent + '；点击配置';
      elements.configureModel.disabled = requestPending;
      updateStatus(state);
      updateTabs();
      renderPauseRail(state);
      elements.content.replaceChildren();
      const view = document.createElement('div');
      view.className = 'view';
      const paused = state.debugStatus === 'paused' && frames.length > 0;
      const livePause = selectedPauseIsLive(state);
      elements.composerMode.textContent = paused
        ? livePause ? '基于当前暂停追问' : '分析历史暂停快照'
        : route ? '提出新的代码路径问题' : '定位代码路径';
      elements.question.placeholder = paused
        ? livePause ? '为什么停在这里？' : '这个历史暂停说明了什么？'
        : route
          ? '输入新的代码问题'
          : '你想理解哪段代码？';
      const sendLabel = paused ? (livePause ? '解释当前暂停' : '解释历史快照') : '定位代码路径';
      elements.send.title = sendLabel;
      elements.send.setAttribute('aria-label', sendLabel);
      elements.question.disabled = requestPending;
      updateSendAvailability();
      elements.composerInner.classList.toggle('busy', requestPending);
      if (state.requestPending || state.busyMessage) renderBusy(view, state.busyMessage, state);
      else if (activeTab === 'path') renderPath(view, route);
      else if (activeTab === 'stack') renderStack(view, state);
      else if (activeTab === 'variables') renderVariables(view, state);
      else renderOverview(view, state);
      elements.content.appendChild(view);
    }

    function submitQuestion() {
      if (requestPending) return;
      const question = elements.question.value.trim();
      if (!question) {
        elements.question.focus();
        return;
      }
      if (currentState.debugStatus === 'paused' && (currentState.frames || []).length) {
        vscode.postMessage({ type: 'explain', question });
      } else {
        vscode.postMessage({ type: 'locateRoute', question });
      }
      beginLocalRequest();
      elements.question.value = '';
      resizeQuestion();
    }

    function resizeQuestion() {
      elements.question.style.height = 'auto';
      elements.question.style.height = Math.min(elements.question.scrollHeight, 120) + 'px';
    }

    function updateSendAvailability() {
      elements.send.disabled = requestPending || !elements.question.value.trim();
    }

    function beginLocalRequest(buttons) {
      if (requestPending) return false;
      requestPending = true;
      elements.question.disabled = true;
      elements.send.disabled = true;
      elements.pauseRail.querySelectorAll('button').forEach((button) => { button.disabled = true; });
      (buttons || []).forEach((button) => { button.disabled = true; });
      return true;
    }

    function selectedPauseIsLive(state) {
      return state.debugStatus === 'paused' &&
        Boolean(state.livePauseId) &&
        (state.pauses || []).some((pause) => pause.selected && pause.id === state.livePauseId);
    }

    function updateTabs() {
      elements.tabs.querySelectorAll('[data-tab]').forEach((tab) => {
        const selected = tab.dataset.tab === activeTab;
        tab.setAttribute('aria-selected', String(selected));
        tab.tabIndex = selected ? 0 : -1;
      });
      elements.content.setAttribute('aria-labelledby', 'tab-' + activeTab);
    }

    function updateStatus(state) {
      const pauses = state.pauses || [];
      const frames = state.frames || [];
      const selectedPauseIndex = Math.max(0, pauses.findIndex((pause) => pause.selected));
      elements.statusDot.className = 'status-dot';
      if (state.requestPending || state.busyMessage) {
        elements.statusDot.classList.add('primary');
        elements.statusLabel.textContent = state.busyMessage || (state.requestKind === 'debug'
          ? '正在启动教学调试…'
          : state.requestKind === 'control'
            ? '正在执行调试操作…'
            : state.requestKind === 'model'
              ? '正在测试模型连接…'
            : '请求处理中…');
      } else if (state.debugStatus === 'ended') {
        elements.statusDot.classList.add('success');
        elements.statusLabel.textContent = pauses.length
          ? '调试已结束 · 已收集 ' + pauses.length + ' 次暂停'
          : '调试已结束 · 未收集到暂停证据';
      } else if (state.debugStatus === 'paused' && frames.length && !selectedPauseIsLive(state)) {
        elements.statusDot.classList.add('primary');
        elements.statusLabel.textContent = '查看历史暂停 · ' + (selectedPauseIndex + 1) + '/' + pauses.length + ' · 调试器仍处于当前暂停';
      } else if (state.debugStatus === 'paused' && frames.length) {
        elements.statusDot.classList.add('primary');
        elements.statusLabel.textContent = 'Paused at ' + frames[0].fileLabel + ' · ' + (selectedPauseIndex + 1) + '/' + pauses.length;
      } else if (state.debugStatus === 'running') {
        elements.statusDot.classList.add('primary');
        elements.statusLabel.textContent = pauses.length ? '调试运行中 · 等待下一次暂停' : '调试已连接，等待命中断点';
      } else if (state.route) {
        elements.statusDot.classList.add('primary');
        elements.statusLabel.textContent = '已规划 ' + state.route.nodes.length + ' 个关键节点';
      } else {
        elements.statusLabel.textContent = '等待代码问题';
      }
    }

    function renderPauseRail(state) {
      const pauses = state.pauses || [];
      elements.pauseRail.replaceChildren();
      elements.pauseRail.classList.toggle('visible', pauses.length > 0);
      pauses.forEach((pause, index) => {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'pause-chip' + (pause.selected ? ' selected' : '');
        button.disabled = Boolean(state.requestPending);
        if (pause.selected) button.setAttribute('aria-current', 'true');
        button.textContent = String(index + 1).padStart(2, '0') + ' · ' + pause.label;
        button.title = pause.label;
        button.addEventListener('click', () => vscode.postMessage({ type: 'selectPause', pauseId: pause.id }));
        elements.pauseRail.appendChild(button);
      });
    }

    function renderBusy(root, message, state) {
      const title = state.requestKind === 'pause'
        ? selectedPauseIsLive(state) ? '正在解释当前暂停' : '正在解释历史快照'
        : state.requestKind === 'debug'
          ? '正在启动教学调试'
          : state.requestKind === 'control'
            ? '正在执行调试操作'
            : state.requestKind === 'model'
              ? '正在测试模型连接'
          : '正在理解项目';
      const detail = message || (state.requestKind === 'debug'
        ? '正在选择并连接 Python 调试配置…'
        : state.requestKind === 'control'
          ? '正在推进调试器并等待新的运行时状态…'
          : state.requestKind === 'model'
            ? '正在验证 API Key、Base URL 和模型名…'
        : '请求处理中…');
      const heading = sectionHeading(title, detail);
      const skeleton = document.createElement('div');
      skeleton.className = 'skeleton';
      skeleton.innerHTML = '<div class="skeleton-line short"></div><div class="skeleton-line medium"></div><div class="skeleton-line"></div><div class="skeleton-block"></div>';
      root.append(heading, skeleton);
    }

    function renderOverview(root, state) {
      const route = state.route;
      const pauses = state.pauses || [];
      const frames = state.frames || [];
      if (state.debugStatus === 'ended') {
        renderSessionEnded(root, state);
      } else if (state.debugStatus === 'paused' && frames.length) {
        renderPausedOverview(root, state);
      } else if (state.debugStatus === 'running') {
        renderRunningOverview(root, state);
      } else if (route) {
        renderRouteReady(root, state);
      } else {
        renderEmpty(root);
      }
    }

    function renderEmpty(root) {
      const empty = document.createElement('section');
      empty.className = 'empty-state';
      empty.innerHTML = '<div class="empty-copy"><h2>追踪一个代码行为</h2><p>描述你想理解的功能、请求或异常。Code Cat 会定位入口和调用链，并把断点、栈帧与变量同步到同一条路径。</p></div>';
      root.appendChild(empty);
    }

    function renderRouteReady(root, state) {
      const route = state.route;
      const heading = sectionHeading('阅读路线已准备', route.nodes.length + ' 个关键节点');
      const summary = document.createElement('p');
      summary.className = 'lesson-copy';
      summary.textContent = state.tutorMessage?.markdown || route.summary;
      const evidence = document.createElement('div');
      evidence.className = 'evidence';
      const linked = route.nodes.filter((node) => node.breakpoint).length;
      evidence.innerHTML = '<div class="evidence-head"><div class="evidence-title"><span class="evidence-dot"></span>调试准备</div></div>';
      const prep = document.createElement('p');
      prep.className = 'evidence-copy';
      prep.textContent = linked
        ? '已有 ' + linked + ' 个节点联动断点，可以开始教学调试。'
        : '先到“执行路径”选择关键节点并联动断点，再开始调试。';
      evidence.appendChild(prep);
      const actions = document.createElement('div');
      actions.className = 'action-row';
      actions.append(
        actionButton('查看执行路径', 'primary', () => switchTab('path')),
        actionButton('开始教学调试', '', () => vscode.postMessage({ type: 'startDebug', question: route.question })),
      );
      root.append(heading, summary, evidence, actions);
    }

    function renderRunningOverview(root, state) {
      const heading = sectionHeading('调试运行中', (state.pauses || []).length ? '等待下一次断点或单步暂停' : '等待第一个断点');
      const copy = document.createElement('p');
      copy.className = 'lesson-copy';
      copy.textContent = (state.pauses || []).length
        ? '上一份运行时快照仍保留在调用栈和变量视图中；新的暂停到来后，当前步骤会自动更新。'
        : 'Code Cat 已经连接 debugpy。命中联动断点后，这里会显示当前步骤、真实源码、变量和可用的单步操作。';
      const actions = document.createElement('div');
      actions.className = 'action-row';
      if ((state.frames || []).length) {
        actions.appendChild(actionButton('查看上一份调用栈', '', () => switchTab('stack')));
      }
      if (state.route) {
        actions.appendChild(actionButton('查看执行路径', 'primary', () => switchTab('path')));
      }
      root.append(heading, copy, actions);
    }

    function renderPausedOverview(root, state) {
      const route = state.route;
      const frames = state.frames || [];
      const variables = state.variables || [];
      const frame = frames.find((candidate) => candidate.selected) || frames[0];
      const livePause = selectedPauseIsLive(state);
      const node = currentRouteNode(route, frame);
      const nodeIndex = route && node ? route.nodes.findIndex((candidate) => candidate.id === node.id) : -1;
      const heading = document.createElement('div');
      heading.className = 'step-label';
      const stepIcon = document.createElement('span');
      stepIcon.className = 'step-icon';
      stepIcon.textContent = '⌁';
      const stepText = document.createElement('span');
      const stepTitle = nodeIndex >= 0 ? '第 ' + (nodeIndex + 1) + ' 步 · ' + node.title : '运行时断点';
      stepText.textContent = livePause ? stepTitle : '历史快照 · ' + stepTitle;
      heading.append(stepIcon, stepText);
      const source = document.createElement('button');
      source.type = 'button';
      source.className = 'source-link';
      const sourceName = document.createElement('span');
      sourceName.className = 'source-name';
      sourceName.textContent = frame.fileLabel;
      const sourceArrow = document.createElement('span');
      sourceArrow.textContent = '→';
      source.append(sourceName, sourceArrow);
      source.addEventListener('click', () => {
        vscode.postMessage({ type: 'selectFrame', frameId: frame.id });
      });
      const grid = document.createElement('div');
      grid.className = 'overview-grid';
      const lesson = document.createElement('div');
      const copy = document.createElement('p');
      copy.className = 'lesson-copy';
      if (state.tutorMessage?.kind === 'error') copy.classList.add('notice', 'error');
      copy.textContent = state.tutorMessage?.markdown || node?.reason || (livePause
        ? '调试器已经在真实代码路径中暂停。先观察当前变量和调用栈，再决定继续、进入函数或跳过此层。'
        : '这是之前一次暂停保存的只读快照。你可以检查当时的源码、调用栈和变量，但单步操作只作用于当前暂停。');
      lesson.append(heading, source, copy);
      appendDebugActions(lesson, state);
      const evidence = variableEvidence(variables);
      grid.append(lesson, evidence);
      const tags = document.createElement('div');
      tags.className = 'tags';
      tags.append(
        tag(livePause ? 'Current pause' : 'Historical snapshot', livePause ? 'current' : ''),
        tag(frames.length + ' frames', ''),
      );
      root.append(grid, tags);
    }

    function variableEvidence(variables) {
      const evidence = document.createElement('section');
      evidence.className = 'evidence';
      const head = document.createElement('div');
      head.className = 'evidence-head';
      head.innerHTML = '<div class="evidence-title"><span class="evidence-dot"></span>当前观察</div>';
      const more = document.createElement('button');
      more.type = 'button';
      more.className = 'text-action';
      more.textContent = variables.length ? '查看全部' : '等待变量';
      more.disabled = variables.length === 0;
      more.addEventListener('click', () => switchTab('variables'));
      head.appendChild(more);
      evidence.appendChild(head);
      if (!variables.length) {
        const empty = document.createElement('div');
        empty.className = 'evidence-copy';
        empty.textContent = '当前暂停没有可展示的顶层变量。';
        evidence.appendChild(empty);
        return evidence;
      }
      const list = document.createElement('dl');
      list.className = 'variable-preview';
      variables.slice(0, 4).forEach((variable) => {
        const name = document.createElement('dt');
        const value = document.createElement('dd');
        name.textContent = variable.name;
        value.textContent = variable.value;
        list.append(name, value);
      });
      evidence.appendChild(list);
      return evidence;
    }

    function appendDebugActions(root, state) {
      if (!selectedPauseIsLive(state)) {
        const actions = document.createElement('div');
        actions.className = 'action-row';
        if (state.debugStatus === 'paused' && state.livePauseId) {
          actions.appendChild(actionButton('回到当前暂停', 'primary', () => {
            vscode.postMessage({ type: 'selectPause', pauseId: state.livePauseId });
          }));
        }
        actions.appendChild(actionButton('解释此快照', 'quiet', () => vscode.postMessage({ type: 'explain' })));
        root.appendChild(actions);
        return;
      }
      const fragment = document.getElementById('debug-actions').content.cloneNode(true);
      const requestButtons = Array.from(fragment.querySelectorAll('button'));
      fragment.querySelectorAll('[data-debug]').forEach((button) => {
        button.addEventListener('click', () => {
          if (!beginLocalRequest(requestButtons)) return;
          vscode.postMessage({ type: 'debugCommand', command: button.dataset.debug });
        });
      });
      fragment.querySelector('[data-action="explain"]').addEventListener('click', () => {
        if (!beginLocalRequest(requestButtons)) return;
        vscode.postMessage({ type: 'explain' });
      });
      root.appendChild(fragment);
    }

    function renderPath(root, route) {
      root.appendChild(sectionHeading('Code Reading Map', route ? route.nodes.length + ' 个候选节点' : '尚未生成路径'));
      if (!route) {
        root.appendChild(emptyNotice('先在底部输入一个项目问题，Code Cat 会生成 3–8 个候选阅读节点。'));
        return;
      }
      const summary = document.createElement('div');
      summary.className = 'route-summary';
      summary.textContent = route.summary;
      const legend = document.createElement('div');
      legend.className = 'legend';
      legend.innerHTML = '<span class="legend-item"><span class="legend-swatch current"></span>当前</span><span class="legend-item"><span class="legend-swatch executed"></span>已执行</span><span class="legend-item"><span class="legend-swatch breakpoint"></span>断点</span><span class="legend-item"><span class="legend-swatch"></span>候选</span>';
      const scroll = document.createElement('div');
      scroll.className = 'path-scroll';
      const flow = document.createElement('div');
      flow.className = 'path-flow';
      route.nodes.forEach((node, index) => flow.appendChild(pathNode(node, index)));
      scroll.appendChild(flow);
      root.append(summary, legend, scroll);
    }

    function pathNode(node, index) {
      const wrap = document.createElement('div');
      wrap.className = 'path-node-wrap' + (node.executed ? ' executed' : '') + (node.active ? ' active' : '') + (node.focused ? ' focused' : '');
      const open = document.createElement('button');
      open.type = 'button';
      open.className = 'path-node' + (node.executed ? ' executed' : '') + (node.active ? ' active' : '') + (node.focused ? ' focused' : '');
      const kicker = document.createElement('span');
      kicker.className = 'path-kicker';
      const stateLabel = node.focused ? 'FOCUS' : node.active ? 'IN STACK' : node.executed ? 'EXECUTED' : 'CANDIDATE';
      kicker.innerHTML = '<span>' + stateLabel + '</span><span class="path-index">' + String(index + 1).padStart(2, '0') + '</span>';
      const title = document.createElement('span');
      title.className = 'path-title';
      title.textContent = node.title;
      const file = document.createElement('span');
      file.className = 'path-file';
      file.textContent = node.fileLabel + ':' + node.location.line;
      const reason = document.createElement('span');
      reason.className = 'path-reason';
      reason.textContent = node.reason;
      open.append(kicker, title, file, reason);
      open.addEventListener('click', () => vscode.postMessage({ type: 'selectRouteNode', nodeId: node.id }));
      const breakpoint = document.createElement('button');
      breakpoint.type = 'button';
      breakpoint.className = 'breakpoint-control' + (node.breakpoint ? ' on' : '');
      breakpoint.textContent = '●';
      breakpoint.title = node.breakpoint ? '移除联动断点' : '添加联动断点';
      breakpoint.setAttribute('aria-label', breakpoint.title);
      breakpoint.addEventListener('click', () => vscode.postMessage({ type: 'toggleBreakpoint', nodeId: node.id }));
      wrap.append(open, breakpoint);
      return wrap;
    }

    function renderStack(root, state) {
      const frames = state.frames || [];
      root.appendChild(sectionHeading('调用栈', frames.length ? frames.length + ' 层真实调用' : '等待调试器暂停'));
      if (!frames.length) {
        root.appendChild(emptyNotice('命中断点后，这里会按调试器顺序显示真实调用栈。'));
        return;
      }
      const list = document.createElement('div');
      list.className = 'stack-list';
      frames.forEach((frame) => {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'stack-frame' + (frame.selected ? ' selected' : '');
        if (frame.selected) button.setAttribute('aria-current', 'true');
        const number = document.createElement('span');
        number.className = 'frame-number';
        number.textContent = '#' + frame.index;
        const copy = document.createElement('span');
        copy.className = 'frame-copy';
        const name = document.createElement('span');
        name.className = 'frame-name';
        name.textContent = frame.name;
        const file = document.createElement('span');
        file.className = 'frame-file';
        file.textContent = frame.fileLabel;
        copy.append(name, file);
        const arrow = document.createElement('span');
        arrow.className = 'frame-arrow';
        arrow.textContent = '→';
        button.append(number, copy, arrow);
        button.addEventListener('click', () => vscode.postMessage({ type: 'selectFrame', frameId: frame.id }));
        list.appendChild(button);
      });
      root.appendChild(list);
      const actions = document.createElement('div');
      appendDebugActions(actions, state);
      root.appendChild(actions);
    }

    function renderVariables(root, state) {
      const variables = state.variables || [];
      root.appendChild(sectionHeading('关键变量', variables.length ? variables.length + ' 个顶层变量' : '等待调试器暂停'));
      if (!variables.length) {
        root.appendChild(emptyNotice('命中断点后，这里会显示已脱敏、限制数量的顶层变量。'));
        return;
      }
      const list = document.createElement('div');
      list.className = 'variable-list';
      variables.forEach((variable) => {
        const row = document.createElement('div');
        row.className = 'variable-row';
        const key = document.createElement('div');
        key.className = 'variable-key';
        const name = document.createElement('span');
        name.className = 'variable-name';
        name.textContent = variable.name;
        const type = document.createElement('span');
        type.className = 'variable-type';
        type.textContent = variable.type || 'unknown';
        key.append(name, type);
        const value = document.createElement('div');
        value.className = 'variable-value';
        value.textContent = variable.value;
        row.append(key, value);
        list.appendChild(row);
      });
      root.appendChild(list);
      const actions = document.createElement('div');
      appendDebugActions(actions, state);
      root.appendChild(actions);
    }

    function renderSessionEnded(root, state) {
      const route = state.route;
      const pauses = state.pauses || [];
      const executed = route ? route.nodes.filter((node) => node.executed).length : 0;
      const complete = document.createElement('section');
      complete.className = 'complete';
      complete.innerHTML = '<div class="complete-mark">✓</div><h2>调试已结束</h2><p>下面只汇总本次输入实际收集到的运行时证据。</p>';
      const stats = document.createElement('div');
      stats.className = 'complete-stats';
      stats.append(
        stat('规划候选节点', route ? route.nodes.length : 0),
        stat('实际暂停次数', pauses.length),
        stat('运行时命中候选节点', executed),
        stat('所选快照调用栈深度', state.frames?.length || 0),
      );
      const actions = document.createElement('div');
      actions.className = 'action-row';
      actions.style.justifyContent = 'center';
      actions.appendChild(actionButton('查看执行路径', 'primary', () => switchTab('path')));
      complete.append(stats, actions);
      root.appendChild(complete);
    }

    function currentRouteNode(route, frame) {
      if (!route) return undefined;
      const sameFile = route.nodes.filter((node) => frame?.location && node.location.path === frame.location.path);
      if (sameFile.length && frame?.location) {
        return sameFile.reduce((closest, node) =>
          Math.abs(node.location.line - frame.location.line) < Math.abs(closest.location.line - frame.location.line)
            ? node
            : closest,
        );
      }
      return route.nodes.find((node) => node.active);
    }

    function sectionHeading(title, subtitle) {
      const heading = document.createElement('div');
      heading.className = 'section-heading';
      const copy = document.createElement('div');
      const titleElement = document.createElement('h2');
      const subtitleElement = document.createElement('p');
      titleElement.textContent = title;
      subtitleElement.textContent = subtitle;
      copy.append(titleElement, subtitleElement);
      heading.appendChild(copy);
      return heading;
    }

    function emptyNotice(text) {
      const notice = document.createElement('div');
      notice.className = 'notice';
      notice.textContent = text;
      return notice;
    }

    function actionButton(label, variant, onClick) {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'action' + (variant ? ' ' + variant : '');
      button.textContent = label;
      button.addEventListener('click', onClick);
      return button;
    }

    function tag(label, variant) {
      const value = document.createElement('span');
      value.className = 'tag' + (variant ? ' ' + variant : '');
      value.textContent = label;
      return value;
    }

    function stat(label, value) {
      const row = document.createElement('div');
      row.className = 'stat';
      const name = document.createElement('span');
      name.className = 'stat-label';
      name.textContent = label;
      const count = document.createElement('span');
      count.className = 'stat-value';
      count.textContent = String(value);
      row.append(name, count);
      return row;
    }

    function switchTab(tab) {
      activeTab = tab;
      render(currentState);
    }

    vscode.postMessage({ type: 'ready' });
`;
