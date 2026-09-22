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
      evidenceContext: document.getElementById('evidence-context'),
      cancelQuestion: document.getElementById('cancel-question'),
      debugControls: document.getElementById('debug-controls'),
      primaryDebugAction: document.getElementById('primary-debug-action'),
    };
    const openEvidence = new Set();
    let restoredRetry;
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
    elements.cancelQuestion.addEventListener('click', () => vscode.postMessage({ type: 'cancelQuestion' }));
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
    document.addEventListener('click', (event) => {
      const menu = document.getElementById('tools-menu');
      if (!menu.contains(event.target)) menu.open = false;
    });
    document.addEventListener('keydown', (event) => {
      const menu = document.getElementById('tools-menu');
      if (event.key === 'Escape' && menu.open) {
        menu.open = false;
        menu.querySelector('summary').focus();
      }
    });
    elements.tabs.addEventListener('click', (event) => {
      const tab = event.target.closest('[data-tab]');
      if (!tab) return;
      activeTab = tab.dataset.tab;
      document.getElementById('tools-menu').open = false;
      render(currentState);
      elements.content.focus({ preventScroll: true });
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
        const followingLatest = elements.content.scrollHeight - elements.content.scrollTop - elements.content.clientHeight < 80;
        const submittedQuestion = nextState.chatMessages?.at(-1)?.role === 'user';
        if (
          (renderedConversationId && nextState.conversationId !== renderedConversationId) ||
          (shouldRevealLatest && submittedQuestion)
        ) {
          activeTab = 'overview';
        }
        if (renderedConversationId && nextState.conversationId !== renderedConversationId) {
          elements.question.value = '';
          openEvidence.clear();
          restoredRetry = undefined;
        }
        renderedConversationId = nextState.conversationId;
        renderedChatMessageCount = nextChatMessageCount;
        currentState = nextState;
        render(currentState);
        if (shouldRevealLatest && (followingLatest || submittedQuestion)) {
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
            coreLocationCount: elements.content.querySelectorAll('.core-location').length,
            coreLocationText:
              elements.content.querySelector('.core-location')?.textContent || '',
            debugInvitationCount:
              elements.content.querySelectorAll('.debug-invitation').length,
            debugInvitationText:
              elements.content.querySelector('.debug-invitation')?.textContent || '',
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
      } else if (event.data?.type === 'smokeDebugInvite') {
        const startDebug = elements.content.querySelector(
          '[data-action="start-guided-debug"]',
        );
        startDebug?.click();
      } else if (event.data?.type === 'smokeCoreLocation') {
        elements.content.querySelector('.core-location-link')?.click();
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
      const scrollTop = elements.content.scrollTop;
      const focusedId = document.activeElement?.id;
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
      renderEvidenceContext(state);
      elements.debugControls.replaceChildren();
      if (pauses.length) appendDebugActions(elements.debugControls, state);
      elements.debugControls.querySelector('[data-debug="stepOver"]')?.remove();
      elements.debugControls.querySelector('[data-action="explain"]')?.remove();
      renderPrimaryDebugAction(state);
      if (state.retryQuestion && restoredRetry !== state.retryQuestion) {
        if (!elements.question.value.trim()) elements.question.value = state.retryQuestion;
        restoredRetry = state.retryQuestion;
        resizeQuestion();
      }
      if (!state.retryQuestion) restoredRetry = undefined;
      elements.content.replaceChildren();
      const view = document.createElement('div');
      view.className = 'view';
      elements.composerMode.textContent = !state.workspaceOpen
        ? '需要打开 代码项目'
        : pauses.length ? (selectedPauseIsLive(state) ? '基于当前暂停' : '历史 · ' +
          (pauses.find((pause) => pause.selected)?.label.split(' · ').at(-1) || '已记录现场'))
        : route || chatMessages.length ? '继续理解当前项目' : '项目代码理解';
      elements.question.placeholder = !state.workspaceOpen
        ? '打开项目后即可定位代码路径'
        : pauses.length
          ? '继续追问这个现场，例如：这个值为什么会这样？'
          : route
          ? '继续追问当前代码路径，或输入新的项目问题'
          : '询问当前项目的代码、调用链或调试问题';
      const sendLabel = '发送消息';
      elements.send.title = sendLabel;
      elements.send.setAttribute('aria-label', sendLabel);
      elements.question.disabled = !state.workspaceOpen;
      elements.cancelQuestion.hidden = state.requestKind !== 'question';
      updateSendAvailability();
      elements.composerInner.classList.toggle('busy', requestPending);
      if (activeTab === 'path') renderPath(view, route);
      else if (activeTab === 'stack') renderStack(view, state);
      else if (activeTab === 'variables') renderVariables(view, state);
      else renderOverview(view, state);
      if (state.requestPending || state.busyMessage) renderBusy(view, state.busyMessage, state);
      elements.content.appendChild(view);
      elements.content.scrollTop = scrollTop;
      if (focusedId === 'observation-select') document.getElementById(focusedId)?.focus({ preventScroll: true });
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
        '.thinking-indicator, .chat-turn, .observation',
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
        elements.statusLabel.textContent = '未打开 代码项目';
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
        if (state.streamingAnswer?.text) {
          const answer = document.createElement('article');
          answer.className = 'chat-turn assistant streaming-answer';
          answer.setAttribute('aria-label', '正在生成的回复');
          const body = document.createElement('div');
          body.className = 'chat-body rich-text';
          renderRichText(body, state.streamingAnswer.text);
          const status = document.createElement('p');
          status.className = 'stream-status';
          status.textContent = '正在生成 · 可停止';
          answer.append(body, status);
          root.appendChild(answer);
          return;
        }
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
        ? '正在选择并连接 项目调试配置…'
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
        renderConversation(root, state.chatMessages, state);
      } else {
        renderEmpty(root, state);
      }
      if (
        state.tutorMessage &&
        (state.tutorMessage.kind === 'error' || state.tutorMessage.kind === 'system')
      ) {
        renderTutorMessage(root, state);
      }
      if (state.captureError) root.appendChild(emptyNotice(state.captureError));
      if (state.route && !(state.pauses || []).length) {
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

    function renderConversation(root, messages, state) {
      const conversation = document.createElement('section');
      conversation.className = 'conversation';
      messages.forEach((message) => {
        if (message.observation) {
          renderObservation(conversation, message, state);
          return;
        }
        const turn = document.createElement('article');
        turn.className = 'chat-turn ' + message.role;
        turn.setAttribute(
          'aria-label',
          message.role === 'user' ? '你的消息' : 'Code Cat 的回复',
        );
        const body = document.createElement('div');
        body.className = 'chat-body rich-text';
        renderRichText(body, message.text);
        if (message.role === 'assistant' && message.pauseId) {
          body.querySelectorAll('p > strong:first-child, h3').forEach((label) => {
            const meaning = {
              '已观察': 'observed', '观察事实': 'observed',
              '源码推断': 'inference', '推断': 'inference',
              '还不能确定': 'unknown', '未知': 'unknown', '待验证': 'unknown',
            }[label.textContent.trim().replace(/[：:]$/u, '')];
            if (meaning) label.classList.add('evidence-label', meaning);
          });
        }
        turn.appendChild(body);
        if (message.pauseId && message.role === 'assistant' && message.pauseId !== state.livePauseId) {
          const evidence = document.createElement('p');
          evidence.className = 'evidence-reference';
          evidence.textContent = '依据历史观察 · ' + (message.evidenceLabel || '暂停现场');
          const available = (state.pauses || []).some((pause) => pause.id === message.pauseId);
          if (!available) evidence.textContent += ' · 快照已释放';
          turn.appendChild(evidence);
        }
        if (message.role === 'assistant' && message.debugTarget && (state.debugging || (state.pauses || []).length || message.text !== state.route?.summary)) {
          const target = message.debugTarget;
          const controls = document.createElement('div');
          controls.className = 'history-debug-actions';
          const source = actionButton(target.fileLabel + ':' + target.line, 'source-reference', () => {
            vscode.postMessage({ type: 'openMessageSource', messageId: message.id });
          });
          source.title = '打开这条回答的源码 · ' + target.title;
          const debug = actionButton(state.debugging ? '在这里打断点' : '用断点跟一遍', 'quiet', () => {
            if (!beginLocalRequest([debug])) return;
            vscode.postMessage({ type: 'debugFromMessage', messageId: message.id });
          });
          debug.disabled = Boolean(state.requestPending);
          controls.append(source, debug);
          turn.appendChild(controls);
        }
        conversation.appendChild(turn);
      });
      root.appendChild(conversation);
    }

    function renderObservation(root, message, state) {
      const pause = (state.pauses || []).find((item) => item.id === message.pauseId);
      const observation = document.createElement('article');
      observation.className = 'observation';
      const header = document.createElement('div');
      header.className = 'observation-header';
      const frame = pause?.frames[0];
      const title = document.createElement(frame?.location ? 'button' : 'strong');
      title.textContent = message.evidenceLabel || '暂停现场';
      if (frame?.location) {
        title.type = 'button';
        title.className = 'observation-location';
        title.title = '在编辑器中打开这处源码';
        title.addEventListener('click', () => {
          vscode.postMessage({ type: 'selectPause', pauseId: pause.id });
          vscode.postMessage({ type: 'selectFrame', frameId: frame.id });
        });
      }
      const status = document.createElement('span');
      status.className = 'observation-status';
      status.textContent = pause && pause.id === state.livePauseId ? '当前暂停' : pause ? '历史快照' : '快照已释放';
      if (pause && pause.id === state.livePauseId) status.classList.add('live');
      if (pause?.reason === 'exception') status.classList.add('exception');
      header.append(title, status);
      observation.appendChild(header);
      if (!pause) {
        observation.appendChild(emptyNotice('这次观察的记录已保留。原始运行快照未保存到磁盘，请重新调试以获得证据。'));
        root.appendChild(observation);
        return;
      }
      const hint = document.createElement('p');
      hint.className = 'observation-hint';
      hint.textContent = pause.reason === 'exception'
        ? '程序因异常暂停。这里记录的是异常发生时的现场。'
        : '暂停在这行，通常尚未执行。';
      observation.appendChild(hint);
      const currentStatement = pause.source?.split('\n').find((line) => line.startsWith('>'));
      if (currentStatement) {
        const statement = document.createElement('pre');
        statement.className = 'observation-source';
        appendSource(statement, currentStatement.replace(/^>\s*\d+:\s*/u, ''));
        statement.setAttribute('aria-label', '暂停处源码，尚不能据此认定执行完成');
        observation.appendChild(statement);
      }
      const details = document.createElement('details');
      details.className = 'observation-evidence';
      details.open = openEvidence.has(pause.id);
      const summary = document.createElement('summary');
      summary.textContent = '查看依据';
      details.appendChild(summary);
      if (pause.source) {
        const pre = document.createElement('pre');
        pre.className = 'observation-source';
        appendSource(pre, pause.source);
        details.appendChild(pre);
      } else details.appendChild(emptyNotice(pause.captureNote || '未采集到相关源码。'));
      const variables = document.createElement('dl');
      variables.className = 'observation-variables';
      pause.variables.forEach((variable) => {
        const name = document.createElement('dt');
        name.textContent = variable.name;
        const value = document.createElement('dd');
        value.textContent = variable.value;
        variables.append(name, value);
      });
      details.appendChild(variables);
      if (!pause.variables.length) details.appendChild(emptyNotice('未采集到变量，不能据此判断值为空。'));
      const stack = document.createElement('ol');
      stack.className = 'observation-stack';
      pause.frames.forEach((caller) => {
        const item = document.createElement('li');
        const label = caller.name + ' · ' + caller.fileLabel;
        if (caller.location) {
          const link = actionButton(label, 'quiet stack-source-link', () => {
            vscode.postMessage({ type: 'selectPause', pauseId: pause.id });
            vscode.postMessage({ type: 'selectFrame', frameId: caller.id });
          });
          item.appendChild(link);
        } else item.textContent = label;
        stack.appendChild(item);
      });
      details.appendChild(stack);
      details.addEventListener('toggle', () => {
        if (!details.isConnected) return;
        if (details.open) openEvidence.add(pause.id); else openEvidence.delete(pause.id);
      });
      observation.appendChild(details);
      const explain = actionButton('解释一下', 'quiet', () => {
        if (requestPending) return;
        vscode.postMessage({ type: 'selectPause', pauseId: pause.id });
        vscode.postMessage({ type: 'explain', question: '解释这次暂停：这行在判断或改变什么？有哪些证据，下一步如何验证？' });
      });
      explain.disabled = requestPending;
      const hasAnswer = (state.chatMessages || []).some((item) =>
        item.role === 'assistant' && !item.observation && item.pauseId === pause.id);
      if (!hasAnswer && pause.selected) observation.appendChild(explain);
      root.appendChild(observation);
    }

    function appendSource(root, source) {
      const tokens = /("(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|#[^\n]*|\b(?:if|else|elif|for|while|def|class|return|raise|try|except|finally|with|as|import|from|in|is|not|and|or|None|True|False|async|await|yield|const|let|var|function|export|default|interface|type|extends|implements|new|throw|catch|switch|case|break|true|false|null|undefined|public|private|static)\b|\b\d+(?:\.\d+)?\b)/gu;
      let cursor = 0;
      for (const match of source.matchAll(tokens)) {
        root.appendChild(document.createTextNode(source.slice(cursor, match.index)));
        const token = document.createElement('span');
        token.className = match[0].startsWith('#') ? 'syntax-comment'
          : /^["']/u.test(match[0]) ? 'syntax-string'
          : /^\d/u.test(match[0]) ? 'syntax-number' : 'syntax-keyword';
        token.textContent = match[0];
        root.appendChild(token);
        cursor = match.index + match[0].length;
      }
      root.appendChild(document.createTextNode(source.slice(cursor)));
    }

    function renderEvidenceContext(state) {
      const root = elements.evidenceContext;
      root.replaceChildren();
      const pauses = state.pauses || [];
      if (!pauses.length) return;
      const label = document.createElement('label');
      label.textContent = '提问依据';
      label.htmlFor = 'observation-select';
      const select = document.createElement('select');
      select.id = 'observation-select';
      pauses.forEach((pause, index) => {
        const option = document.createElement('option');
        option.value = pause.id;
        option.textContent = '观察 ' + (index + 1) + ' · ' + pause.label + (pause.id === state.livePauseId ? ' · 当前暂停' : ' · 历史');
        option.selected = pause.selected;
        select.appendChild(option);
      });
      select.addEventListener('change', () => vscode.postMessage({ type: 'selectPause', pauseId: select.value }));
      root.append(label, select);
    }

    function renderPrimaryDebugAction(state) {
      const root = elements.primaryDebugAction;
      root.replaceChildren();
      if (activeTab !== 'overview') {
        root.appendChild(actionButton('返回对话', 'quiet', () => switchTab('overview')));
        return;
      }
      if (selectedPauseIsLive(state)) {
        const next = actionButton('单步验证', 'primary', () => {
          if (!beginLocalRequest([next])) return;
          vscode.postMessage({ type: 'debugCommand', command: 'stepOver' });
        });
        next.title = '执行当前行并在下一处暂停（Step Over），验证你的判断';
        next.dataset.debug = 'stepOver';
        next.disabled = requestPending;
        root.appendChild(next);
      } else if (state.livePauseId) {
        root.appendChild(actionButton('回到当前暂停', 'quiet', () => {
          vscode.postMessage({ type: 'selectPause', pauseId: state.livePauseId });
        }));
      }
    }

    function renderExplorationContext(root, state) {
      const route = state.route;
      const coreNode = route.nodes[0];
      if (!coreNode) return;
      const section = document.createElement('section');
      section.className = 'exploration-context';
      const core = document.createElement('div');
      core.className = 'core-location';
      const coreHeader = document.createElement('div');
      coreHeader.className = 'core-location-header';
      const label = document.createElement('span');
      label.className = 'core-location-label';
      label.textContent = '核心代码位置';
      const location = document.createElement('button');
      location.type = 'button';
      location.className = 'source-link core-location-link';
      location.setAttribute(
        'aria-label',
        '打开 ' + coreNode.fileLabel + ' 第 ' + coreNode.location.line + ' 行',
      );
      const sourceName = document.createElement('span');
      sourceName.className = 'source-name';
      sourceName.textContent = coreNode.fileLabel + ':' + coreNode.location.line;
      const openLabel = document.createElement('span');
      openLabel.className = 'core-location-open';
      openLabel.textContent = '打开代码 ↗';
      location.append(sourceName, openLabel);
      location.addEventListener('click', () => {
        vscode.postMessage({ type: 'selectRouteNode', nodeId: coreNode.id });
      });
      coreHeader.append(label, location);
      const title = document.createElement('h2');
      title.textContent = coreNode.title;
      const contextLabel = document.createElement('span');
      contextLabel.className = 'core-location-context-label';
      contextLabel.textContent = '为什么先看这里';
      const context = document.createElement('p');
      context.className = 'core-location-context';
      context.textContent = coreNode.reason;
      core.append(coreHeader, title, contextLabel, context);

      const debugInvitation = document.createElement('div');
      debugInvitation.className = 'debug-invitation';
      const debugCopy = document.createElement('div');
      debugCopy.className = 'debug-invitation-copy';
      const debugTitle = document.createElement('h3');
      const debugDetail = document.createElement('p');
      const debugActions = document.createElement('div');
      debugActions.className = 'debug-invitation-actions';
      const startGuidedDebugAction = (label) => {
        const startDebug = actionButton(label, 'primary', () => {
          activeTab = 'overview';
          render(currentState);
          vscode.postMessage({ type: 'startDebug', question: route.question });
        });
        startDebug.dataset.action = 'start-guided-debug';
        return startDebug;
      };
      if (state.debugging) {
        debugInvitation.classList.add('active');
        debugTitle.textContent = '断点验证进行中';
        debugDetail.textContent =
          '路径图会标记真实执行位置；命中断点后，调用栈和变量会同步更新。';
        debugActions.appendChild(actionButton('查看运行时信息', 'quiet', () => {
          switchTab((state.frames || []).length ? 'stack' : 'path');
        }));
      } else if (state.debugStatus === 'ended') {
        debugInvitation.classList.add('active');
        if ((state.pauses || []).length) {
          debugTitle.textContent = '断点验证已结束';
          debugDetail.textContent = '已保留本次运行采集的路径、调用栈和变量信息。';
          debugActions.appendChild(actionButton('查看运行时信息', 'quiet', () => {
            switchTab((state.frames || []).length ? 'stack' : 'path');
          }));
        } else {
          debugTitle.textContent = '断点没有命中';
          debugDetail.textContent =
            '这次运行暂时没有调用栈和变量。检查触发条件后，可以直接重新运行。';
          debugActions.appendChild(startGuidedDebugAction('重新运行'));
        }
      } else {
        debugTitle.textContent = '想通过断点看看这个过程吗？';
        debugDetail.textContent =
          'Code Cat 会先在 ' +
          coreNode.fileLabel + ':' + coreNode.location.line +
          ' 放置临时断点。命中后，路径图、调用栈和变量会同步更新。';
        debugActions.appendChild(startGuidedDebugAction('用断点跟一遍'));
      }
      debugCopy.append(debugTitle, debugDetail);
      debugInvitation.append(debugCopy, debugActions);

      section.append(core, debugInvitation);
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
          const language = line.trim().slice(3).trim();
          const codeLines = [];
          index += 1;
          while (index < lines.length && !/^\x60{3}/u.test(lines[index].trim())) {
            codeLines.push(lines[index]);
            index += 1;
          }
          if (index < lines.length) index += 1;
          const pre = document.createElement('pre');
          const code = document.createElement('code');
          const sourceCode = codeLines.join('\n');
          appendSource(code, sourceCode);
          pre.appendChild(code);
          const block = document.createElement('section');
          block.className = 'code-block';
          const header = document.createElement('div');
          header.className = 'code-block-header';
          const label = document.createElement('span');
          label.textContent = language || '代码';
          const copy = actionButton('复制', 'quiet', () => {
            vscode.postMessage({ type: 'copyCode', code: sourceCode });
            copy.textContent = '已复制';
          });
          header.append(label, copy);
          block.append(header, pre);
          root.appendChild(block);
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
      const pattern = /(\[[^\]\n]+\]\([^\s)]+\)|\x60[^\x60\n]+\x60|\*\*[^*\n]+\*\*)/gu;
      let cursor = 0;
      for (const match of source.matchAll(pattern)) {
        const offset = match.index ?? 0;
        if (offset > cursor) {
          root.appendChild(document.createTextNode(source.slice(cursor, offset)));
        }
        const token = match[0];
        const link = /^\[([^\]]+)\]\(([^)]+)\)$/u.exec(token);
        if (link) {
          const reference = link[2];
          if (/^(?![a-z]+:|[/\\])[^\n]+\.(?:py|[cm]?[jt]s|[jt]sx):[1-9]\d*$/iu.test(reference)) {
            const button = actionButton(link[1], 'source-reference', () => vscode.postMessage({ type: 'openSourceReference', reference }));
            button.title = '打开源码 · ' + reference;
            root.appendChild(button);
          } else root.appendChild(document.createTextNode(link[1]));
          cursor = offset + token.length;
          continue;
        }
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
        : '<h2>先打开一个 代码项目</h2><p>Code Cat 需要读取项目中的文件和符号，才能建立真实的代码路径。</p>';
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
      requestButtons.forEach((button) => { button.disabled = requestPending; });
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
      document.getElementById('tools-menu').open = false;
      render(currentState);
    }

    vscode.postMessage({ type: 'ready' });
`;
