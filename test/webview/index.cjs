const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const { chromium } = require('playwright');
const { createRuntimeMapHtml } = require('../../dist/views/runtimeMapHtml');
const themeColors = require('../../package.json').contributes.colors;

async function run() {
  const output = path.resolve('.vscode-test/ui');
  await fs.mkdir(output, { recursive: true });
  const browser = await chromium.launch({
    executablePath: process.env.CODE_CAT_BROWSER_EXECUTABLE || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    headless: true,
  });
  try {
    const page = await browser.newPage({ viewport: { width: 360, height: 840 } });
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.addInitScript(() => {
      window.sentMessages = [];
      window.acquireVsCodeApi = () => ({ postMessage: (message) => window.sentMessages.push(message) });
    });
    const html = createRuntimeMapHtml({ cspSource: 'http://code-cat.test' });
    await page.route('http://code-cat.test/', (route) => route.fulfill({ contentType: 'text/html', body: html }));
    await page.goto('http://code-cat.test/');
    const pause = {
      id: 'pause-1', reason: 'breakpoint', label: 'reserve_inventory · inventory.py:24', selected: true,
      frames: [{ id: 1, name: 'reserve_inventory', fileLabel: 'inventory.py:24', location: { path: '/project/inventory.py', line: 24, column: 1 } }],
      variables: [{ name: 'quantity', value: '10' }, { name: 'item', value: "{'stock': 8, 'unit_price_cents': 8900}" }],
      source: '  23:     item = CATALOG.get(sku)\n> 24:     if item["stock"] < quantity:\n  25:         raise ValueError("Insufficient stock")',
    };
    let state = {
      workspaceOpen: true, conversationId: 'conversation-1', conversationTitle: '库存不足时，还会扣款吗？',
      debugStatus: 'paused', debugging: true, debugEvidenceVisible: true, livePauseId: pause.id,
      pauses: [pause], frames: pause.frames, variables: pause.variables,
      route: { summary: '库存检查决定订单是否可以继续。', nodes: [
        { id: 'route-1', title: '库存判断', role: '判定可用库存是否满足订单', reason: '在扣款前确认可用数量。', location: { path: '/project/inventory.py', line: 24 }, fileLabel: 'inventory.py' },
        { id: 'route-2', title: '协调结账', relation: '结账入口把订单交给库存边界', reason: '确认库存结果如何影响后续流程。', location: { path: '/project/checkout.py', line: 12 }, fileLabel: 'checkout.py' },
      ] },
      organizationFiles: [
        { id: 'route-1', fileLabel: 'src/inventory.py', title: '库存判断', role: '判定可用库存是否满足订单' },
        { id: 'route-2', fileLabel: 'src/checkout.py', title: '协调结账' },
        { id: 'route-3', fileLabel: 'api/orders.py', title: '接收订单' },
        { id: 'route-4', fileLabel: 'tests/order_test.py' },
        { id: 'route-5', fileLabel: 'config/runtime.py' },
        { id: 'route-6', fileLabel: 'docs/flow.py' },
      ],
      chatMessages: [
        { id: 'q1', role: 'user', text: '库存不足时，还会扣款吗？' },
        { id: 'r1', role: 'assistant', text: '库存检查决定订单是否可以继续。', route: { question: '库存不足时，还会扣款吗？', nodes: [{ id: 'route-1' }] } },
        { id: 'o1', role: 'assistant', text: '已记录观察', observation: true, pauseId: pause.id, evidenceLabel: 'inventory.py:24' },
        { id: 'a1', role: 'assistant', text: '**已观察**：库存为 `8`，购买数量为 `10`。\n\n**源码推断**：这个条件预计为真，会进入异常分支。\n\n**还不能确定**：异常最终由谁处理。单步执行一次可以验证是否进入异常分支。', pauseId: pause.id, evidenceLabel: 'inventory.py:24' },
      ],
    };
    let version = 0;
    async function send() {
      version += 1;
      await page.evaluate(({ state, version }) => window.postMessage({ type: 'state', state, version }, '*'), { state, version });
      await page.waitForFunction((version) => window.sentMessages.some((item) => item.type === 'renderedState' && item.version === version), version);
    }
    await send();
    const motion = await page.evaluate(() => window.sentMessages
      .filter((message) => message.type === 'renderedState')
      .at(-1)?.diagnostics?.interactionMotion);
    assert.equal(motion.tabTransitionDuration, '0s', 'high-frequency tab navigation stays immediate');
    assert.notEqual(motion.actionTransitionDuration, '0s', 'pointer feedback keeps a short non-zero transition');
    assert.equal(await page.locator('.observation').count(), 1);
    assert.equal(await page.locator('.architecture-map').count(), 1);
    assert.equal(await page.locator('.architecture-directory').count(), 4, 'default architecture map stays compact');
    assert.match(await page.locator('.architecture-map').textContent(), /目录归属.*不表示调用或执行/);
    assert.match(await page.locator('.architecture-file-role').first().textContent(), /判定可用库存是否满足订单/, 'the map explains why the file exists instead of repeating its short title');
    assert.match(await page.locator('.architecture-file-role').nth(1).textContent(), /协调结账/, 'a route without a role falls back to the node title');
    await page.locator('.architecture-map').screenshot({ path: path.join(output, 'architecture-map-360.png') });
    await page.evaluate(() => {
      document.body.dataset.host = 'jetbrains';
      for (const [key, value] of Object.entries({ '--vscode-editor-background': '#20242b', '--vscode-foreground': '#d5dbe5', '--vscode-descriptionForeground': '#a3adbc', '--vscode-input-background': '#2b2f36', '--vscode-widget-border': '#414854', '--vscode-codeCat-accent': '#91b7ff', '--vscode-codeCat-inference': '#c4afff' })) {
        document.documentElement.style.setProperty(key, value);
      }
    });
    await page.locator('.architecture-map').screenshot({ path: path.join(output, 'architecture-map-jetbrains-dark.png') });
    await page.evaluate(() => { delete document.body.dataset.host; document.documentElement.removeAttribute('style'); });
    await page.getByRole('button', { name: '展开全部相关文件' }).click();
    assert.equal(await page.locator('.architecture-directory').count(), 5);
    await page.getByRole('button', { name: /orders.py/ }).click();
    assert.deepEqual(await page.evaluate(() => window.sentMessages.at(-1)), { type: 'selectRouteNode', nodeId: 'route-3' });
    await page.evaluate(() => window.postMessage({ type: 'smokeTab', tab: 'path' }, '*'));
    await page.waitForFunction(() => document.querySelectorAll('.path-node').length === 2);
    assert.match(await page.locator('.path-role').first().textContent(), /职责：判定可用库存是否满足订单/, 'a reading stop states what the module is responsible for');
    assert.equal(await page.locator('.path-relation').count(), 1, 'only stops after the first carry a relation line');
    assert.match(await page.locator('.path-relation').first().textContent(), /↳ 结账入口把订单交给库存边界/, 'a stop explains how it connects to the previous one');
    await page.locator('.path-node').first().screenshot({ path: path.join(output, 'path-node-role-360.png') });
    await page.evaluate(() => window.postMessage({ type: 'smokeTab', tab: 'overview' }, '*'));
    await page.waitForFunction(() => document.querySelector('.observation') !== null);
    assert.equal(await page.locator('#tools-menu').getAttribute('open'), null);
    assert.equal(await page.locator('#primary-debug-action [data-debug="stepOver"]').isVisible(), true);
    assert.equal(await page.locator('[data-debug="continue"]').isVisible(), false, 'secondary debugger actions stay behind More');
    assert.equal(await page.locator('#observation-select').isVisible(), false, 'snapshot selection is progressive');
    assert.equal(await page.locator('.observation > button').count(), 0, 'answered observations have no duplicate explain or follow-up buttons');
    assert.equal(await page.locator('.evidence-label').count(), 3, 'evidence labels retain text and add semantic color');
    assert.equal(await page.locator('.observation-source .syntax-keyword').first().textContent(), 'if');
    assert.match(await page.locator('.observation-context').textContent(), /库存判断：在扣款前确认可用数量/);
    assert.match(await page.locator('.observation-hint').textContent(), /真实观察/);
    state = { ...state, pauses: [{ ...pause, variables: [] }], variables: [] };
    await send();
    assert.match(await page.locator('.observation-limit').textContent(), /没有采集到变量值/);
    state = { ...state, pauses: [pause], variables: pause.variables };
    await send();
    await page.getByRole('button', { name: '先看作用' }).click();
    assert.match(await page.locator('#question').inputValue(), /整条代码链路中负责什么/);
    assert.deepEqual(await page.evaluate(() => window.sentMessages.at(-1)), { type: 'selectPause', pauseId: 'pause-1' });
    await page.locator('#question').fill('');
    await page.locator('.observation-location').click();
    assert.deepEqual(await page.evaluate(() => window.sentMessages.slice(-2)), [
      { type: 'selectPause', pauseId: 'pause-1' }, { type: 'selectFrame', frameId: 1 },
    ], 'source title navigates to the real frame');
    await page.locator('.observation-evidence > summary').click();
    await page.waitForFunction(() => document.querySelector('.observation-evidence').open);
    await page.locator('#question').fill('那异常会被谁处理？');
    state = { ...state, requestKind: 'question', requestPending: true, busyMessage: '正在思考' };
    await send();
    assert.equal(await page.locator('#question').isEnabled(), true, 'draft stays editable while waiting');
    assert.equal(await page.locator('#locate').isDisabled(), true, 'parallel sends are blocked');
    assert.equal(await page.locator('.observation-evidence').evaluate((el) => el.open), true, 'evidence expansion survives state updates');
    assert.equal(await page.locator('.observation').isVisible(), true, 'waiting does not replace evidence');
    state = { ...state, streamingAnswer: { text: '## 先看库存判断\n\n打开 [库存判断](src/inventory.ts:24)，观察当前值。\n\n```ts\nconst available = stock >= quantity;\nreturn available;\n```' } };
    await send();
    assert.equal(await page.locator('.streaming-answer h3').textContent(), '先看库存判断');
    assert.ok(await page.locator('.streaming-answer .syntax-keyword').count() > 0);
    await page.locator('.streaming-answer .source-reference').click();
    assert.deepEqual(await page.evaluate(() => window.sentMessages.at(-1)), { type: 'openSourceReference', reference: 'src/inventory.ts:24' });
    await page.locator('.streaming-answer .code-block-header button').click();
    assert.equal(await page.evaluate(() => window.sentMessages.at(-1).type), 'copyCode');
    await page.screenshot({path: path.join(output, 'streaming-reading-360.png'), fullPage: true});
    // JetBrains dark theme regression: inline source links must not inherit action button height or light hover.
    await page.setViewportSize({ width: 500, height: 690 });
    await page.evaluate(() => {
      document.body.dataset.host = 'jetbrains';
      const colors = {'--vscode-editor-background':'#20242b','--vscode-foreground':'#d5dbe5','--vscode-descriptionForeground':'#a3adbc','--vscode-input-background':'#2b2f36','--vscode-widget-border':'#414854','--vscode-codeCat-accent':'#91b7ff','--vscode-codeCat-observed':'#7cd8b2','--vscode-codeCat-inference':'#c4afff','--vscode-codeCat-uncertainty':'#e7bd77'};
      for(const [key,value] of Object.entries(colors)) document.documentElement.style.setProperty(key,value);
    });
    const sourceLink = page.locator('.streaming-answer .source-reference');
    await sourceLink.hover();
    assert.equal(await sourceLink.evaluate(el => getComputedStyle(el).minHeight), '0px');
    assert.equal(await page.locator('.product-name').isVisible(), false);
    assert.equal(await page.locator('.composer-shortcut').isVisible(), false);
    const hoverColor = await sourceLink.evaluate(el => getComputedStyle(el).backgroundColor);
    assert.notEqual(hoverColor, 'rgb(236, 236, 238)', 'source link never inherits the light action hover');
    await page.screenshot({path:path.join(output,'jetbrains-reading-dark.png'),fullPage:true});
    await page.evaluate(() => { delete document.body.dataset.host; document.documentElement.removeAttribute('style'); });
    await page.setViewportSize({width:360,height:840});
    await page.locator('#cancel-question').click();
    assert.equal(await page.evaluate(() => window.sentMessages.at(-1).type), 'cancelQuestion');
    state = { ...state, streamingAnswer: undefined, requestKind: undefined, requestPending: false, busyMessage: undefined,
      retryQuestion: '失败的旧问题', tutorMessage: { kind: 'error', text: '模型暂时不可用，请重试。' } };
    await send();
    assert.equal(await page.locator('#question').inputValue(), '那异常会被谁处理？', 'failure never overwrites a newer draft');
    await page.locator('#question').fill('');
    state = { ...state, retryQuestion: undefined }; await send();
    state = { ...state, retryQuestion: '失败的旧问题' }; await send();
    assert.equal(await page.locator('#question').inputValue(), '失败的旧问题', 'failure restores submitted text to an empty composer');
    state = { ...state, retryQuestion: undefined, tutorMessage: undefined };
    await send();
    await page.locator('#question').fill('那异常会被谁处理？');
    await page.locator('.observation-evidence > summary').click();
    for (const [theme, width] of [['light', 360], ['dark', 360], ['highContrast', 360], ['highContrastLight', 360], ['light', 780]]) {
      await page.setViewportSize({ width, height: 900 });
      await page.evaluate(({ theme, themeColors }) => {
        const colors = theme === 'dark' || theme === 'highContrast'
          ? { '--vscode-editor-background': '#1e1e1e', '--vscode-foreground': '#ddd', '--vscode-descriptionForeground': '#b6b6b6', '--vscode-input-background': '#303030', '--vscode-widget-border': '#555' }
          : { '--vscode-editor-background': '#fff', '--vscode-foreground': '#202124', '--vscode-descriptionForeground': '#616168', '--vscode-input-background': '#f4f4f5', '--vscode-widget-border': '#dedee2' };
        for (const [key, value] of Object.entries(colors)) document.documentElement.style.setProperty(key, value);
        for (const color of themeColors) document.documentElement.style.setProperty('--vscode-' + color.id.replaceAll('.', '-'), color.defaults[theme]);
      }, { theme, themeColors });
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, `${theme} ${width}: no horizontal overflow`);
      await page.mouse.move(2, 2);
      await page.screenshot({ path: path.join(output, `${theme}-${width}.png`), fullPage: true, animations: 'disabled' });
      const contrast = await page.evaluate(() => {
        const canvas = document.createElement('canvas');
        canvas.width = canvas.height = 1;
        const ctx = canvas.getContext('2d', { willReadFrequently: true });
        const luminance = (color) => {
          ctx.clearRect(0, 0, 1, 1); ctx.fillStyle = color; ctx.fillRect(0, 0, 1, 1);
          const rgb = [...ctx.getImageData(0, 0, 1, 1).data].slice(0, 3).map((v) => {
            const c = v / 255; return c <= .04045 ? c / 12.92 : ((c + .055) / 1.055) ** 2.4;
          });
          return rgb[0] * .2126 + rgb[1] * .7152 + rgb[2] * .0722;
        };
        return ['.observation-location', '.observation-status.live', '.evidence-label.observed', '.evidence-label.inference', '.evidence-label.unknown', '#primary-debug-action button'].map((selector) => {
          const el = document.querySelector(selector);
          let background = el;
          while (getComputedStyle(background).backgroundColor === 'rgba(0, 0, 0, 0)') background = background.parentElement;
          const fg = luminance(getComputedStyle(el).color), bg = luminance(getComputedStyle(background).backgroundColor);
          return { selector, ratio: (Math.max(fg, bg) + .05) / (Math.min(fg, bg) + .05) };
        });
      });
      for (const item of contrast) assert.ok(item.ratio >= 4.5, `${theme}: ${item.selector} contrast ${item.ratio.toFixed(2)}`);
    }
    await page.evaluate(() => document.documentElement.style.setProperty('--vscode-codeCat-accent', '#9b2764'));
    assert.equal(await page.locator('.observation-location').evaluate((el) => getComputedStyle(el).color), 'rgb(155, 39, 100)', 'theme overrides apply to source links');
    await page.waitForFunction(() => getComputedStyle(document.querySelector('#primary-debug-action button')).backgroundColor === 'rgb(155, 39, 100)');
    assert.equal(await page.locator('#primary-debug-action button').evaluate((el) => getComputedStyle(el).backgroundColor), 'rgb(155, 39, 100)', 'the same theme role colors primary actions');
    state = { ...state, debugStatus: 'ended', debugging: false, chatMessages: [...state.chatMessages,
      {id: 'historic-route', role: 'assistant', text: '先看库存判断。', debugTarget: {title: '库存判断', fileLabel: 'main.ts', line: 3}}] };
    await send();
    assert.equal(await page.locator('.history-debug-actions button').count(), 2, 'history retains source and debugger entry after a pause');
    assert.equal(await page.locator('.debug-invitation [data-action="start-guided-debug"]').count(), 1, 'an ended session with snapshots still offers a fresh debug run');
    await page.screenshot({path: path.join(output, 'history-debug-780.png'), fullPage: true});
    await page.locator('.history-debug-actions .source-reference').click();
    assert.deepEqual(await page.evaluate(() => window.sentMessages.at(-1)), {type: 'openMessageSource', messageId: 'historic-route'});
    await page.locator('.history-debug-actions button').last().click();
    assert.deepEqual(await page.evaluate(() => window.sentMessages.at(-1)), {type: 'debugFromMessage', messageId: 'historic-route'});
    await send();
    state = { ...state, debugStatus: 'running', livePauseId: undefined };
    await send();
    assert.equal(await page.locator('[data-debug]').count(), 0, 'historical evidence cannot step the live debugger');
    assert.match(await page.locator('#observation-select').textContent(), /历史/);
    await page.locator('#tools-menu > summary').click();
    assert.equal(await page.locator('#observation-select').isVisible(), true);
    const menuBounds = await page.locator('.tools-panel').boundingBox();
    assert.ok(menuBounds.x >= 0 && menuBounds.y >= 0, 'More stays inside the viewport');
    assert.ok(menuBounds.x + menuBounds.width <= 780, 'More does not overflow horizontally');
    await page.keyboard.press('Escape');
    assert.equal(await page.locator('#observation-select').isVisible(), false);
    assert.equal(await page.evaluate(() => document.activeElement.tagName), 'SUMMARY');
    state = { ...state, pauses: [], frames: [], variables: [], debugStatus: 'ended' };
    await send();
    assert.match(await page.locator('.observation').textContent(), /快照已释放/);
    assert.deepEqual(errors, []);
    assert.equal(await page.evaluate(() => window.sentMessages.some((item) => item.type === 'scriptError')), false);
    console.log(`Webview behavior, theme overrides, contrast and 6 visual captures passed: ${output}`);
  } finally {
    await browser.close();
  }
}
run().catch((error) => { console.error(error); process.exitCode = 1; });
