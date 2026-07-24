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
      conversationSwitcher: document.getElementById('conversation-switcher'),
      modelProviderLabel: document.getElementById('model-provider-label'),
      pathCount: document.getElementById('path-count'),
      pauseRail: document.getElementById('pause-rail'),
      question: document.getElementById('question'),
      send: document.getElementById('locate'),
      sessionStatus: document.querySelector('.session-status'),
      sessionTitle: document.getElementById('session-title'),
      stackCount: document.getElementById('stack-count'),
      statusDot: document.getElementById('status-dot'),
      statusLabel: document.getElementById('status-label'),
      tabs: document.getElementById('tabs'),
      variableCount: document.getElementById('variable-count'),
    };
    let activeTab = 'overview';
    let requestPending = false;
    let renderedChatMessageCount = 0;
    let renderedConversationId;
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
      workspaceOpen: true,
      chatMessages: [],
      contentMode: undefined,
      conversationId: undefined,
      conversationTitle: '新会话',
      revealedRouteNodeCount: 0,
    };

    document.getElementById('locate').addEventListener('click', submitQuestion);
    elements.configureModel.addEventListener('click', () => vscode.postMessage({ type: 'configureModel' }));
    elements.conversationSwitcher.addEventListener('click', () => {
      vscode.postMessage({ type: 'showConversationHistory' });
    });
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
      const tabs = Array.from(elements.tabs.querySelectorAll('[role="tab"]:not([hidden])'));
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
        const nextState = event.data.state;
        const nextChatMessageCount = (nextState.chatMessages || []).length;
        const shouldRevealLatest =
          nextChatMessageCount > renderedChatMessageCount;
        if (
          (renderedConversationId && nextState.conversationId !== renderedConversationId) ||
          shouldRevealLatest
        ) {
          activeTab = 'overview';
        }
        renderedConversationId = nextState.conversationId;
        renderedChatMessageCount = nextChatMessageCount;
        currentState = nextState;
        render(currentState);
        if (shouldRevealLatest) {
          revealLatestConversationItem();
        }
        vscode.postMessage({
          type: 'renderedState',
          version: event.data.version,
          diagnostics: {
            chatMessageCount: (currentState.chatMessages || []).length,
            userMessageCount: elements.content.querySelectorAll('.chat-turn.user').length,
            assistantMessageCount: elements.content.querySelectorAll('.chat-turn.assistant').length,
            thinkingIndicatorCount: elements.content.querySelectorAll('.thinking-indicator').length,
            thinkingLabelText:
              elements.content.querySelector('.thinking-label')?.textContent || '',
            thinkingDotCount: elements.content.querySelectorAll('.thinking-dot').length,
            thinkingBackgroundImage: computedStyleValue(
              '.thinking-label',
              'backgroundImage',
            ),
            thinkingAnimationName: computedStyleValue(
              '.thinking-label',
              'animationName',
            ),
            answerSkeletonCount: elements.content.querySelectorAll('.skeleton').length,
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
            visibleTabCount: elements.tabs.querySelectorAll('[role="tab"]:not([hidden])').length,
            pathTabVisible: !document.getElementById('tab-path').hidden,
            stackTabVisible: !document.getElementById('tab-stack').hidden,
            variablesTabVisible: !document.getElementById('tab-variables').hidden,
            renderedRouteNodeCount: elements.content.querySelectorAll('.path-node').length,
            renderedExplorationContextCount: elements.content.querySelectorAll('.exploration-context').length,
            composerShortcutText: elements.composerShortcut.textContent,
            composerPlaceholderText: elements.question.placeholder,
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
      } else if (event.data?.type === 'smokeTab') {
        activeTab = event.data.tab;
        render(currentState);
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
      elements.sessionTitle.textContent = state.conversationTitle || '新会话';
      elements.pathCount.textContent = route
        ? String(route.nodes.length) + '/' + String(route.totalNodeCount || route.nodes.length)
        : '';
      elements.stackCount.textContent = frames.length ? String(frames.length) : '';
      elements.variableCount.textContent = variables.length ? String(variables.length) : '';
      const modelProvider = state.modelProvider || { label: 'VS Code 内置模型' };
      elements.modelProviderLabel.textContent = modelProvider.detail
        ? modelProvider.label + ' · ' + modelProvider.detail
        : modelProvider.label;
      elements.configureModel.title = '当前模型：' + elements.modelProviderLabel.textContent + '；点击配置';
      elements.configureModel.disabled = requestPending;
      updateStatus(state);
      updateTabs(state);
      renderPauseRail(state);
      elements.content.replaceChildren();
      const view = document.createElement('div');
      view.className = 'view';
      elements.composerMode.textContent = !state.workspaceOpen
        ? '需要打开 Python 项目'
        : route || chatMessages.length ? '继续理解当前项目' : '项目代码理解';
      elements.question.placeholder = !state.workspaceOpen
        ? '打开项目后即可定位代码路径'
        : route
          ? '继续追问当前代码路径，或输入新的项目问题'
          : '询问当前项目的代码、调用链或调试问题';
      const sendLabel = '发送消息';
      elements.send.title = sendLabel;
      elements.send.setAttribute('aria-label', sendLabel);
      elements.question.disabled = requestPending || !state.workspaceOpen;
      updateSendAvailability();
      elements.composerInner.classList.toggle('busy', requestPending);
      if (state.requestPending || state.busyMessage) {
        if (activeTab === 'overview' && chatMessages.length) {
          renderOverview(view, state);
        }
        renderBusy(view, state.busyMessage, state);
      }
      else if (activeTab === 'path') renderPath(view, route);
      else if (activeTab === 'stack') renderStack(view, state);
      else if (activeTab === 'variables') renderVariables(view, state);
      else renderOverview(view, state);
      elements.content.appendChild(view);
    }

    function submitQuestion() {
      if (requestPending || !currentState.workspaceOpen) return;
      const question = elements.question.value.trim();
      if (!question) {
        elements.question.focus();
        return;
      }
      elements.question.value = '';
      resizeQuestion();
      beginLocalQuestion(question);
      vscode.postMessage({ type: 'askQuestion', question });
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

    function beginLocalQuestion(question) {
      const optimisticMessage = {
        id: 'pending-' + Date.now(),
        role: 'user',
        text: question,
      };
      activeTab = 'overview';
      currentState = {
        ...currentState,
        chatMessages: [...(currentState.chatMessages || []), optimisticMessage],
        contentMode: 'chat',
        requestPending: true,
        requestKind: 'question',
        busyMessage: '正在思考',
      };
      render(currentState);
      revealLatestConversationItem();
    }

    function revealLatestConversationItem() {
      const candidates = elements.content.querySelectorAll(
        '.thinking-indicator, .chat-turn',
      );
      const latest = candidates[candidates.length - 1];
      latest?.scrollIntoView({ block: 'nearest' });
    }

    function selectedPauseIsLive(state) {
      return state.debugStatus === 'paused' &&
        Boolean(state.livePauseId) &&
        (state.pauses || []).some((pause) => pause.selected && pause.id === state.livePauseId);
    }

    function updateTabs(state) {
      const routeVisible = Boolean(state.route);
      const debugEvidenceVisible = Boolean(state.debugEvidenceVisible);
      document.getElementById('tab-path').hidden = !routeVisible;
      document.getElementById('tab-stack').hidden = !debugEvidenceVisible;
      document.getElementById('tab-variables').hidden = !debugEvidenceVisible;
      if (
        (activeTab === 'path' && !routeVisible) ||
        ((activeTab === 'stack' || activeTab === 'variables') && !debugEvidenceVisible)
      ) {
        activeTab = routeVisible ? 'path' : 'overview';
      }
      elements.tabs.querySelectorAll('[data-tab]').forEach((tab) => {
        if (tab.hidden) {
          tab.setAttribute('aria-selected', 'false');
          tab.tabIndex = -1;
          return;
        }
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
      const sessionStatusVisible =
        state.requestKind !== 'question' &&
        (!state.workspaceOpen ||
          Boolean(state.requestPending || state.busyMessage) ||
          Boolean(state.debugging || state.route));
      elements.sessionStatus.classList.toggle(
        'status-hidden',
        !sessionStatusVisible,
      );
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
        elements.statusLabel.textContent = '代码探索 · 已展开 ' +
          state.route.nodes.length + '/' +
          (state.route.totalNodeCount || state.route.nodes.length);
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
      if (state.requestKind === 'question') {
        const indicator = document.createElement('div');
        indicator.className = 'thinking-indicator';
        indicator.setAttribute('role', 'status');
        indicator.setAttribute('aria-live', 'polite');
        const label = document.createElement('span');
        label.className = 'thinking-label';
        label.textContent = '正在思考';
        indicator.appendChild(label);
        root.appendChild(indicator);
        return;
      }
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
      const messages = state.chatMessages || [];
      if (messages.length) {
        renderConversation(root, state.chatMessages);
      } else {
        renderEmpty(root, state);
      }
      if (
        state.tutorMessage &&
        (state.tutorMessage.kind === 'error' || state.tutorMessage.kind === 'system')
      ) {
        renderTutorMessage(root, state);
      }
      if (state.route) {
        renderExplorationContext(root, state);
      }
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

    function renderConversation(root, messages) {
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
      root.appendChild(conversation);
    }

    function renderExplorationContext(root, state) {
      const route = state.route;
      const revealed = route.nodes.length;
      const total = route.totalNodeCount || revealed;
      const section = document.createElement('section');
      section.className = 'exploration-context';
      const copy = document.createElement('div');
      copy.className = 'exploration-copy';
      const eyebrow = document.createElement('span');
      eyebrow.className = 'exploration-eyebrow';
      eyebrow.textContent = '当前代码探索';
      const title = document.createElement('h2');
      title.textContent = route.question;
      const detail = document.createElement('p');
      detail.textContent = '已展开 ' + revealed + '/' + total + ' 个关键位置。先读当前证据，再决定是否继续深入。';
      copy.append(eyebrow, title, detail);
      const actions = document.createElement('div');
      actions.className = 'exploration-actions';
      actions.appendChild(actionButton('查看关键位置', 'primary', () => switchTab('path')));
      actions.appendChild(actionButton('追问这个方向', 'quiet', focusExplorationQuestion));
      if (route.canRevealMore) {
        actions.appendChild(actionButton('继续下一处', 'quiet', () => {
          vscode.postMessage({ type: 'revealNextRouteNode' });
        }));
      }
      section.append(copy, actions);
      root.appendChild(section);
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
      const total = route?.totalNodeCount || route?.nodes.length || 0;
      root.appendChild(sectionHeading(
        '代码阅读路径',
        route ? '已展开 ' + route.nodes.length + '/' + total + ' 个关键位置' : '尚未生成路径',
      ));
      if (!route) {
        root.appendChild(emptyNotice('先在底部提出一个具体的代码问题，路径会在确有代码探索目标后出现。'));
        return;
      }
      const summary = document.createElement('div');
      summary.className = 'route-summary';
      summary.textContent = '这不是完整调用链。先从当前关键位置验证你的问题，再按兴趣继续展开。';
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
      if (route.canRevealMore) {
        const actions = document.createElement('div');
        actions.className = 'action-row';
        actions.appendChild(actionButton('继续下一处', 'primary', () => {
          vscode.postMessage({ type: 'revealNextRouteNode' });
        }));
        actions.appendChild(actionButton('先追问感兴趣的内容', 'quiet', focusExplorationQuestion));
        root.appendChild(actions);
      } else {
        const complete = document.createElement('p');
        complete.className = 'path-complete';
        complete.textContent = '已展开当前探索规划。你可以在对话中追问其中任一位置，或选择位置设置教学断点。';
        root.appendChild(complete);
      }
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
        root.appendChild(emptyNotice('已选择教学断点。开始调试并命中后，这里才会显示真实调用栈。'));
        return;
      }
      renderPauseGuidance(root, state);
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

    function renderPauseGuidance(root, state) {
      const route = state.route;
      const frames = state.frames || [];
      const frame = frames[0];
      const livePause = selectedPauseIsLive(state);
      const node = currentRouteNode(route, frame);
      const nodeIndex = route && node
        ? route.nodes.findIndex((candidate) => candidate.id === node.id)
        : -1;
      const reading = document.createElement('article');
      reading.className = 'pause-guidance';
      const label = document.createElement('div');
      label.className = 'step-label';
      label.textContent = nodeIndex >= 0
        ? (livePause ? '当前暂停' : '历史快照') + ' · 第 ' + (nodeIndex + 1) + ' 处'
        : (livePause ? '当前暂停' : '历史快照');
      const source = document.createElement('button');
      source.type = 'button';
      source.className = 'source-link';
      source.textContent = frame.fileLabel + ' →';
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
      reading.append(label, source, sections);
      if (state.tutorMessage?.kind === 'pause-error') {
        const error = document.createElement('div');
        error.className = 'notice pause-explanation-error';
        error.textContent = '解释未按结构返回；真实调用栈仍然保留。' + state.tutorMessage.text;
        reading.appendChild(error);
      }
      root.appendChild(reading);
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

    function focusExplorationQuestion() {
      switchTab('overview');
      elements.question.placeholder = '你对这条路径的哪一部分感兴趣？';
      elements.question.focus();
    }

    function switchTab(tab) {
      activeTab = tab;
      render(currentState);
    }

    vscode.postMessage({ type: 'ready' });
`;
