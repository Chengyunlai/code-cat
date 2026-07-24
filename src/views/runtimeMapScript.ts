export const runtimeMapScript = String.raw`
    const vscode = acquireVsCodeApi();
    window.addEventListener('error', (event) => {
      vscode.postMessage({ type: 'scriptError', error: String(event.error || event.message) });
    });
    const elements = {
      content: document.getElementById('content'),
      composerInner: document.getElementById('composer-inner'),
      composerMode: document.getElementById('composer-mode'),
      composerShortcut: document.getElementById('composer-shortcut'),
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
      tokenUsage: undefined,
      debugging: false,
      workspaceOpen: true,
      chatMessages: [],
      contentMode: undefined,
    };

    document.getElementById('locate').addEventListener('click', submitQuestion);
    elements.configureModel.addEventListener('click', () => vscode.postMessage({ type: 'configureModel' }));
    elements.question.addEventListener('keydown', (event) => {
      if (
        event.key !== 'Enter' || event.shiftKey || event.isComposing || event.keyCode === 229
      ) return;
      event.preventDefault();
      submitQuestion();
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
        vscode.postMessage({
          type: 'renderedState',
          version: event.data.version,
          diagnostics: {
            chatMessageCount: (currentState.chatMessages || []).length,
            chatRoleLabelCount: elements.content.querySelectorAll('.chat-role').length,
            richTextElementCount: elements.content.querySelectorAll('.chat-body code, .chat-body strong').length,
            pauseExplanationSectionCount: elements.content.querySelectorAll('.explanation-section').length,
            pauseRichTextElementCount: elements.content.querySelectorAll('.explanation-section code, .explanation-section strong').length,
            runtimeEvidenceGroupCount: elements.content.querySelectorAll('.runtime-evidence-group').length,
            variablePreviewCount: elements.content.querySelectorAll('.variable-preview-row').length,
            variablePreviewMaxLength: Math.max(
              0,
              ...Array.from(elements.content.querySelectorAll('.variable-preview-value'))
                .map((element) => element.textContent.length),
            ),
            usageSectionCount: elements.content.querySelectorAll('.token-usage').length,
            usageScopeCount: elements.content.querySelectorAll('[data-usage-scope]').length,
            usageReportedCount: elements.content.querySelectorAll('.usage-source.reported').length,
            usageEstimatedCount: elements.content.querySelectorAll('.usage-source.estimated').length,
            usageCacheCount: elements.content.querySelectorAll('.usage-cache').length,
            usageLastCacheDetailCount: elements.content.querySelectorAll('.usage-last .usage-cache-detail').length,
            usageResetButtonCount: elements.content.querySelectorAll('.usage-reset').length,
            composerShortcutText: elements.composerShortcut.textContent,
            userMessageSurfaceDeclared: Boolean(
              getComputedStyle(document.documentElement)
                .getPropertyValue('--cc-user-message')
                .trim(),
            ),
            userMessageSurfaceDistinct: userMessageSurfaceDistinct(),
            interactionMotion: {
              actionTransitionProperty: computedStyleValue('.action', 'transitionProperty'),
              actionTransitionDuration: computedStyleValue('.action', 'transitionDuration'),
              sourceLinkTransitionProperty: computedStyleValue('.source-link', 'transitionProperty'),
              tabTransitionDuration: computedStyleValue('.tab', 'transitionDuration'),
            },
            contentMode: currentState.contentMode,
            tutorMessageRendered: Boolean(
              currentState.tutorMessage &&
              elements.content.textContent.includes(tutorMessageText(currentState.tutorMessage))
            ),
          },
        });
      } else if (event.data?.type === 'smokeComposer') {
        runComposerSmoke();
      }
    });

    function runComposerSmoke() {
      const originalValue = elements.question.value;
      elements.question.value = '';
      const enter = new KeyboardEvent('keydown', {
        key: 'Enter',
        bubbles: true,
        cancelable: true,
      });
      const shiftEnter = new KeyboardEvent('keydown', {
        key: 'Enter',
        shiftKey: true,
        bubbles: true,
        cancelable: true,
      });
      elements.question.dispatchEvent(enter);
      elements.question.dispatchEvent(shiftEnter);
      elements.question.value = originalValue;
      vscode.postMessage({
        type: 'composerSmokeResult',
        enterDefaultPrevented: enter.defaultPrevented,
        shiftEnterDefaultPrevented: shiftEnter.defaultPrevented,
      });
    }

    function userMessageSurfaceDistinct() {
      const message = elements.content.querySelector('.chat-turn.user .chat-body');
      if (!message) return false;
      return getComputedStyle(message).backgroundColor !== getComputedStyle(document.body).backgroundColor;
    }

    function computedStyleValue(selector, property) {
      const element = document.querySelector(selector);
      return element ? getComputedStyle(element)[property] : '';
    }

    function render(state) {
      requestPending = Boolean(state.requestPending || state.busyMessage);
      const route = state.route;
      const frames = state.frames || [];
      const variables = state.variables || [];
      const pauses = state.pauses || [];
      const chatMessages = state.chatMessages || [];
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
      elements.composerMode.textContent = !state.workspaceOpen
        ? '需要打开 Python 项目'
        : route || chatMessages.length ? '继续聊天或询问代码路径' : '聊天或询问代码路径';
      elements.question.placeholder = !state.workspaceOpen
        ? '打开项目后即可定位代码路径'
        : route
          ? '继续聊天，或输入新的代码问题'
          : '输入消息，或询问项目代码';
      const sendLabel = '发送消息';
      elements.send.title = sendLabel;
      elements.send.setAttribute('aria-label', sendLabel);
      elements.question.disabled = requestPending || !state.workspaceOpen;
      updateSendAvailability();
      elements.composerInner.classList.toggle('busy', requestPending);
      if (state.requestPending || state.busyMessage) renderBusy(view, state.busyMessage, state);
      else if (activeTab === 'path') renderPath(view, route);
      else if (activeTab === 'stack') renderStack(view, state);
      else if (activeTab === 'variables') renderVariables(view, state);
      else renderOverview(view, state);
      renderTokenUsage(view, state.tokenUsage);
      elements.content.appendChild(view);
    }

    function submitQuestion() {
      if (requestPending || !currentState.workspaceOpen) return;
      const question = elements.question.value.trim();
      if (!question) {
        elements.question.focus();
        return;
      }
      vscode.postMessage({ type: 'askQuestion', question });
      beginLocalRequest();
      elements.question.value = '';
      resizeQuestion();
    }

    function resizeQuestion() {
      elements.question.style.height = 'auto';
      elements.question.style.height = Math.min(elements.question.scrollHeight, 120) + 'px';
    }

    function updateSendAvailability() {
      elements.send.disabled = requestPending || !currentState.workspaceOpen || !elements.question.value.trim();
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
      } else if (!state.workspaceOpen) {
        elements.statusLabel.textContent = '未打开 Python 项目';
      } else if (state.contentMode === 'chat') {
        elements.statusDot.classList.add('primary');
        elements.statusLabel.textContent = '对话已更新';
      } else if (state.contentMode === 'message' && state.tutorMessage) {
        elements.statusDot.classList.add('primary');
        elements.statusLabel.textContent = state.tutorMessage.kind === 'error'
          ? '请求未完成'
          : '需要你的操作';
      } else if (state.tutorMessage?.kind === 'pause-error') {
        elements.statusDot.classList.add('primary');
        elements.statusLabel.textContent = '已保留运行时证据 · 模型解释可重试';
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
        elements.statusLabel.textContent = '暂停于 ' + frames[0].fileLabel + ' · ' + (selectedPauseIndex + 1) + '/' + pauses.length;
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
      if (state.contentMode === 'message' && state.tutorMessage) {
        renderTutorMessage(root, state);
      } else if (state.contentMode === 'chat' && (state.chatMessages || []).length) {
        renderConversation(root, state.chatMessages, state);
      } else if (state.debugStatus === 'ended') {
        renderSessionEnded(root, state);
      } else if (state.debugStatus === 'paused' && frames.length) {
        renderPausedOverview(root, state);
      } else if (state.debugStatus === 'running') {
        renderRunningOverview(root, state);
      } else if (route) {
        renderRouteReady(root, state);
      } else {
        renderEmpty(root, state);
      }
    }

    function renderTokenUsage(root, snapshot) {
      if (!snapshot || !hasTokenUsage(snapshot)) return;
      const section = document.createElement('section');
      section.className = 'token-usage';
      section.setAttribute('aria-label', '模型用量');

      const head = document.createElement('div');
      head.className = 'usage-head';
      const headingCopy = document.createElement('div');
      const title = document.createElement('h2');
      title.textContent = '模型用量';
      const subtitle = document.createElement('p');
      subtitle.textContent = '报告值与本地估算分开累计';
      headingCopy.append(title, subtitle);
      const reset = document.createElement('button');
      reset.type = 'button';
      reset.className = 'text-action usage-reset';
      reset.textContent = '重置项目累计';
      reset.addEventListener('click', () => vscode.postMessage({ type: 'resetUsage' }));
      head.append(headingCopy, reset);
      section.appendChild(head);

      if (snapshot.last) {
        const last = document.createElement('div');
        last.className = 'usage-last';
        last.dataset.usageScope = 'last';
        const lastMeta = document.createElement('div');
        lastMeta.className = 'usage-last-meta';
        const lastLabel = document.createElement('span');
        lastLabel.textContent = '最近一次 · ' + requestKindLabel(snapshot.last.requestKind);
        const source = document.createElement('span');
        source.className = 'usage-source ' + snapshot.last.usage.source;
        source.textContent = snapshot.last.usage.source === 'reported' ? '厂商报告' : '估算';
        lastMeta.append(lastLabel, source);
        const model = document.createElement('div');
        model.className = 'usage-model';
        model.textContent = snapshot.last.model
          ? snapshot.last.provider + ' · ' + snapshot.last.model
          : snapshot.last.provider;
        const metrics = document.createElement('div');
        metrics.className = 'usage-last-metrics';
        metrics.textContent = usageMetricsText(snapshot.last.usage);
        last.append(lastMeta, model, metrics);
        const cache = document.createElement('div');
        cache.className = 'usage-cache usage-cache-detail';
        cache.textContent = usageCacheText(snapshot.last.usage);
        last.appendChild(cache);
        section.appendChild(last);
      }

      const scopes = document.createElement('div');
      scopes.className = 'usage-scopes';
      appendUsageScope(scopes, '当前会话', 'session', snapshot.session);
      appendUsageScope(scopes, '当前项目', 'project', snapshot.project);
      section.appendChild(scopes);
      const note = document.createElement('p');
      note.className = 'usage-note';
      note.textContent = '估算值仅用于观察上下文规模，不等同于厂商账单。';
      section.appendChild(note);
      root.appendChild(section);
    }

    function appendUsageScope(root, label, scope, totals) {
      const row = document.createElement('div');
      row.className = 'usage-scope';
      row.dataset.usageScope = scope;
      const name = document.createElement('div');
      name.className = 'usage-scope-name';
      name.textContent = label;
      const values = document.createElement('div');
      values.className = 'usage-scope-values';
      appendUsageSource(values, 'reported', '厂商报告', totals?.reported);
      appendUsageSource(values, 'estimated', '估算', totals?.estimated);
      if (!values.childElementCount) {
        const empty = document.createElement('span');
        empty.className = 'usage-empty';
        empty.textContent = '暂无模型请求';
        values.appendChild(empty);
      }
      row.append(name, values);
      root.appendChild(row);
    }

    function appendUsageSource(root, source, label, counts) {
      if (!hasTokenCounts(counts)) return;
      const line = document.createElement('div');
      line.className = 'usage-source-line';
      const sourceLabel = document.createElement('span');
      sourceLabel.className = 'usage-source ' + source;
      sourceLabel.textContent = label;
      const metrics = document.createElement('span');
      metrics.textContent = usageMetricsText(counts);
      line.append(sourceLabel, metrics);
      if (counts.cacheReadTokens > 0 || counts.cacheWriteTokens > 0) {
        const cache = document.createElement('span');
        cache.className = 'usage-cache';
        cache.textContent = usageCacheText(counts);
        line.appendChild(cache);
      }
      root.appendChild(line);
    }

    function usageMetricsText(counts) {
      return '输入 ' + formatTokenCount(counts.inputTokens) +
        ' · 输出 ' + formatTokenCount(counts.outputTokens) +
        ' · 总计 ' + formatTokenCount(counts.totalTokens);
    }

    function usageCacheText(counts) {
      const parts = ['缓存读 ' + formatTokenCount(counts.cacheReadTokens)];
      if (counts.cacheReadTokens > 0) {
        const ratio = counts.inputTokens > 0
          ? Math.round((counts.cacheReadTokens / counts.inputTokens) * 100)
          : 0;
        if (ratio > 0) parts[0] += ' · ' + ratio + '%';
      }
      if (counts.cacheWriteTokens > 0) {
        parts.push('缓存写 ' + formatTokenCount(counts.cacheWriteTokens));
      }
      return parts.join(' · ');
    }

    function formatTokenCount(value) {
      return new Intl.NumberFormat('zh-CN').format(Number(value) || 0);
    }

    function hasTokenUsage(snapshot) {
      return Boolean(snapshot.last) ||
        hasTokenCounts(snapshot.session?.reported) ||
        hasTokenCounts(snapshot.session?.estimated) ||
        hasTokenCounts(snapshot.project?.reported) ||
        hasTokenCounts(snapshot.project?.estimated);
    }

    function hasTokenCounts(counts) {
      return Boolean(counts && (
        counts.inputTokens || counts.outputTokens || counts.totalTokens ||
        counts.cacheReadTokens || counts.cacheWriteTokens
      ));
    }

    function requestKindLabel(kind) {
      if (kind === 'route') return '路径定位';
      if (kind === 'pause') return '暂停解释';
      if (kind === 'connection-test') return '连接测试';
      return '问题回答';
    }

    function renderTutorMessage(root, state) {
      const message = state.tutorMessage;
      const isError = message.kind === 'error';
      const heading = sectionHeading(
        isError ? '这次请求没有完成' : '还需要一步',
        isError ? '你可以修正配置或换个问法后重试' : 'Code Cat 没有发起模型请求',
      );
      const copy = document.createElement('p');
      copy.className = 'lesson-copy notice' + (isError ? ' error' : '');
      copy.textContent = message.text;
      root.append(heading, copy);
      if (!state.workspaceOpen) {
        const actions = document.createElement('div');
        actions.className = 'action-row';
        actions.appendChild(actionButton('打开文件夹', 'primary', () => vscode.postMessage({ type: 'openFolder' })));
        root.appendChild(actions);
      }
    }

    function renderConversation(root, messages, state) {
      const conversation = document.createElement('section');
      conversation.className = 'conversation';
      messages.forEach((message) => {
        const turn = document.createElement('article');
        turn.className = 'chat-turn ' + message.role;
        turn.setAttribute(
          'aria-label',
          message.role === 'user' ? '你的消息' : 'Code Cat 的回复',
        );
        const body = document.createElement('div');
        body.className = 'chat-body rich-text';
        renderRichText(body, message.text);
        turn.appendChild(body);
        conversation.appendChild(turn);
      });
      if (state.debugStatus === 'paused' && (state.frames || []).length) {
        appendDebugActions(conversation, state);
      }
      root.appendChild(conversation);
    }

    function renderRichText(root, source) {
      const lines = String(source || '').replace(/\r/gu, '').split('\n');
      let index = 0;
      while (index < lines.length) {
        const line = lines[index];
        if (!line.trim()) {
          index += 1;
          continue;
        }
        if (/^\x60{3}/u.test(line.trim())) {
          const codeLines = [];
          index += 1;
          while (index < lines.length && !/^\x60{3}/u.test(lines[index].trim())) {
            codeLines.push(lines[index]);
            index += 1;
          }
          if (index < lines.length) index += 1;
          const pre = document.createElement('pre');
          const code = document.createElement('code');
          code.textContent = codeLines.join('\n');
          pre.appendChild(code);
          root.appendChild(pre);
          continue;
        }
        const headingMatch = /^(#{1,3})\s+(.+)$/u.exec(line.trim());
        if (headingMatch) {
          const heading = document.createElement('h3');
          appendInlineRichText(heading, headingMatch[2]);
          root.appendChild(heading);
          index += 1;
          continue;
        }
        const unordered = /^[-*]\s+(.+)$/u.exec(line.trim());
        const ordered = /^\d+[.)]\s+(.+)$/u.exec(line.trim());
        if (unordered || ordered) {
          const list = document.createElement(ordered ? 'ol' : 'ul');
          const pattern = ordered ? /^\d+[.)]\s+(.+)$/u : /^[-*]\s+(.+)$/u;
          while (index < lines.length) {
            const itemMatch = pattern.exec(lines[index].trim());
            if (!itemMatch) break;
            const item = document.createElement('li');
            appendInlineRichText(item, itemMatch[1]);
            list.appendChild(item);
            index += 1;
          }
          root.appendChild(list);
          continue;
        }
        const paragraphLines = [line.trim()];
        index += 1;
        while (index < lines.length && lines[index].trim() && !isRichBlockStart(lines[index])) {
          paragraphLines.push(lines[index].trim());
          index += 1;
        }
        const paragraph = document.createElement('p');
        appendInlineRichText(paragraph, paragraphLines.join(' '));
        root.appendChild(paragraph);
      }
    }

    function isRichBlockStart(line) {
      const trimmed = line.trim();
      return /^\x60{3}/u.test(trimmed) || /^(?:#{1,3}\s+|[-*]\s+|\d+[.)]\s+)/u.test(trimmed);
    }

    function appendInlineRichText(root, source) {
      const pattern = /(\x60[^\x60\n]+\x60|\*\*[^*\n]+\*\*)/gu;
      let cursor = 0;
      for (const match of source.matchAll(pattern)) {
        const offset = match.index ?? 0;
        if (offset > cursor) {
          root.appendChild(document.createTextNode(source.slice(cursor, offset)));
        }
        const token = match[0];
        const inlineCode = token.charCodeAt(0) === 96;
        const element = document.createElement(inlineCode ? 'code' : 'strong');
        element.textContent = inlineCode ? token.slice(1, -1) : token.slice(2, -2);
        root.appendChild(element);
        cursor = offset + token.length;
      }
      if (cursor < source.length) {
        root.appendChild(document.createTextNode(source.slice(cursor)));
      }
    }

    function renderEmpty(root, state) {
      const empty = document.createElement('section');
      empty.className = 'empty-state';
      const copy = document.createElement('div');
      copy.className = 'empty-copy';
      copy.innerHTML = state.workspaceOpen
        ? '<h2>追踪一个代码行为</h2><p>描述你想理解的功能、请求或异常。Code Cat 会定位入口和调用链，并把断点、栈帧与变量同步到同一条路径。</p>'
        : '<h2>先打开一个 Python 项目</h2><p>Code Cat 需要读取项目中的文件和符号，才能建立真实的代码路径。</p>';
      empty.appendChild(copy);
      if (!state.workspaceOpen) {
        const actions = document.createElement('div');
        actions.className = 'action-row';
        actions.appendChild(actionButton('打开文件夹', 'primary', () => vscode.postMessage({ type: 'openFolder' })));
        empty.appendChild(actions);
      }
      root.appendChild(empty);
    }

    function renderRouteReady(root, state) {
      const route = state.route;
      const heading = sectionHeading('阅读路线已准备', route.nodes.length + ' 个关键节点');
      const summary = document.createElement('p');
      summary.className = 'lesson-copy';
      summary.textContent = state.tutorMessage?.kind === 'route'
        ? state.tutorMessage.text
        : route.summary;
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
      const frame = frames[0];
      const livePause = selectedPauseIsLive(state);
      const node = currentRouteNode(route, frame);
      const nodeIndex = route && node ? route.nodes.findIndex((candidate) => candidate.id === node.id) : -1;
      const reading = document.createElement('article');
      reading.className = 'pause-reading';
      const heading = document.createElement('div');
      heading.className = 'step-label';
      const stepText = document.createElement('span');
      const stepTitle = nodeIndex >= 0 ? '第 ' + (nodeIndex + 1) + ' 步 · ' + node.title : '运行时断点';
      stepText.textContent = livePause ? stepTitle : '历史快照 · ' + stepTitle;
      heading.appendChild(stepText);
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
      const explanation = pauseExplanation(state, node, livePause);
      const sections = document.createElement('div');
      sections.className = 'explanation-sections';
      sections.append(
        explanationSection('当前发生什么', explanation.whatHappened),
        explanationSection('为什么重要', explanation.whyItMatters),
        explanationSection('下一步看什么', explanation.inspectNext),
      );
      reading.append(heading, source, sections);
      if (state.tutorMessage?.kind === 'pause-error') {
        const explanationError = document.createElement('div');
        explanationError.className = 'notice pause-explanation-error';
        explanationError.textContent = '模型解释未按约定结构返回。当前仍保留真实运行时证据；你可以稍后重新解释。详情：' + state.tutorMessage.text;
        reading.appendChild(explanationError);
      }
      reading.appendChild(runtimeEvidence(frames, variables));
      appendDebugActions(reading, state);
      const tags = document.createElement('div');
      tags.className = 'tags';
      tags.append(
        tag(livePause ? '当前暂停' : '历史快照', livePause ? 'current' : ''),
        tag(frames.length + ' 层调用', ''),
      );
      reading.appendChild(tags);
      root.appendChild(reading);
    }

    function pauseExplanation(state, node, livePause) {
      if (state.tutorMessage?.kind === 'pause') {
        return state.tutorMessage.explanation;
      }
      return {
        whatHappened: node?.reason || (livePause
          ? '调试器已在当前源码位置暂停。'
          : '这是之前一次暂停保存的只读快照。'),
        whyItMatters: '调用栈和变量来自真实运行时，可以用来验证规划的代码路径。',
        inspectNext: livePause
          ? '先对照上层调用者和关键变量，再决定继续、进入函数或单步跳过。'
          : '检查当时的调用栈和变量；单步操作仅作用于当前暂停。',
      };
    }

    function explanationSection(title, text) {
      const section = document.createElement('section');
      section.className = 'explanation-section';
      const heading = document.createElement('h3');
      heading.textContent = title;
      const body = document.createElement('div');
      body.className = 'explanation-copy rich-text';
      renderRichText(body, text);
      section.append(heading, body);
      return section;
    }

    function runtimeEvidence(frames, variables) {
      const evidence = document.createElement('section');
      evidence.className = 'runtime-evidence';
      const heading = sectionHeading('运行时证据', '来自本次暂停的顶层栈帧，用来验证代码路径');
      const grid = document.createElement('div');
      grid.className = 'runtime-evidence-grid';
      grid.append(runtimeStackEvidence(frames), runtimeVariableEvidence(variables));
      evidence.append(heading, grid);
      return evidence;
    }

    function runtimeStackEvidence(frames) {
      const group = evidenceGroup('调用路径', frames.length ? '查看完整调用栈' : '暂无调用栈', () => switchTab('stack'));
      const list = document.createElement('div');
      list.className = 'stack-preview';
      frames.slice(0, 3).forEach((frame, index) => {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'stack-preview-row';
        const order = document.createElement('span');
        order.className = 'stack-preview-order';
        order.textContent = '#' + index;
        const name = document.createElement('span');
        name.className = 'stack-preview-name';
        name.textContent = frame.displayName;
        const file = document.createElement('span');
        file.className = 'stack-preview-file';
        file.textContent = frame.fileLabel;
        button.append(order, name, file);
        button.addEventListener('click', () => vscode.postMessage({ type: 'selectFrame', frameId: frame.id }));
        list.appendChild(button);
      });
      if (!frames.length) list.appendChild(emptyNotice('当前没有可用的调用栈。'));
      group.appendChild(list);
      return group;
    }

    function runtimeVariableEvidence(variables) {
      const group = evidenceGroup('顶层栈帧变量', variables.length ? '查看全部变量' : '暂无变量', () => switchTab('variables'));
      const list = document.createElement('div');
      list.className = 'variable-preview-list';
      variables.slice(0, 4).forEach((variable) => {
        const row = document.createElement('div');
        row.className = 'variable-preview-row';
        const key = document.createElement('div');
        key.className = 'variable-preview-key';
        const name = document.createElement('code');
        name.textContent = variable.name;
        const type = document.createElement('span');
        type.textContent = variable.type || '未知类型';
        key.append(name, type);
        const value = document.createElement('code');
        value.className = 'variable-preview-value';
        value.textContent = compactVariableValue(variable.value);
        row.append(key, value);
        list.appendChild(row);
      });
      if (!variables.length) list.appendChild(emptyNotice('当前暂停没有可展示的顶层变量。'));
      group.appendChild(list);
      return group;
    }

    function evidenceGroup(title, actionLabel, onAction) {
      const group = document.createElement('section');
      group.className = 'runtime-evidence-group';
      const head = document.createElement('div');
      head.className = 'runtime-evidence-group-head';
      const heading = document.createElement('h3');
      heading.textContent = title;
      const action = document.createElement('button');
      action.type = 'button';
      action.className = 'text-action';
      action.textContent = actionLabel;
      action.addEventListener('click', onAction);
      head.append(heading, action);
      group.appendChild(head);
      return group;
    }

    function compactVariableValue(value) {
      const text = String(value || '');
      return text.length <= 120 ? text : text.slice(0, 119) + '…';
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
      root.appendChild(sectionHeading('代码阅读路径', route ? route.nodes.length + ' 个候选节点' : '尚未生成路径'));
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
      const stateLabel = node.focused ? '当前关注' : node.active ? '调用栈中' : node.executed ? '已执行' : '候选';
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
      breakpoint.className = 'breakpoint-control' + (node.breakpoint ? ' on' : '') + (node.breakpointState === 'external' ? ' external' : '');
      breakpoint.textContent = '●';
      breakpoint.title = node.breakpointState === 'external'
        ? '此处是用户断点；Code Cat 会保留它'
        : node.breakpointState === 'managed'
          ? '移除教学断点'
          : '添加教学断点';
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
        name.textContent = frame.displayName;
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
        type.textContent = variable.type || '未知类型';
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

    function tutorMessageText(message) {
      if (message.kind === 'pause') {
        return [
          message.explanation.whatHappened,
          message.explanation.whyItMatters,
          message.explanation.inspectNext,
        ].join(' ');
      }
      if (message.kind === 'pause-error') return message.text;
      return message.text || '';
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
