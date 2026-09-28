// 公开会话入口：普通 Node 即可运行，不需要 IDE，也不需要真实模型。
//
// 三问一停，观察同一份会话状态：路径是累积的、目标是稳定的、换目标要用户点头。
const { AiTutor, SessionStore, cancellationToken } = require('../../../packages/core');

const SOURCES = {
  'checkout.py': [
    'def checkout(order):',
    '    reserved = reserve_inventory(order)',
    '    if not reserved:',
    '        return "out of stock"',
    '    return charge(order)',
  ],
  'inventory.py': [
    'def reserve_inventory(order):',
    '    available = CATALOG.stock(order["sku"])',
    '    return available >= order["quantity"]',
  ],
  'payment.py': [
    'def charge(order):',
    '    return GATEWAY.capture(order["total"])',
  ],
};

/** 一个最小的项目索引：文件都在内存里，路径形如 /project/<name>。 */
function createProject() {
  const absolute = (name) => `/project/${name}`;
  const nameOf = (file) => file.replace(/^\/project\//u, '');
  return {
    async readinessIssue() {
      return undefined;
    },
    async promptContext() {
      return Object.entries(SOURCES)
        .map(([name, lines]) =>
          `${name}:\n${lines.map((line, index) => `${index + 1}: ${line}`).join('\n')}`)
        .join('\n\n');
    },
    async resolveFile(candidate) {
      return Object.prototype.hasOwnProperty.call(SOURCES, nameOf(candidate))
        ? absolute(nameOf(candidate))
        : undefined;
    },
    async readSourceFile(file) {
      const lines = SOURCES[nameOf(file)];
      return {
        languageId: 'python',
        lineCount: lines.length,
        lineAt: (index) => ({ text: lines[index] ?? '' }),
      };
    },
  };
}

// 三次提问的固定回答。第二次刻意把「库存预留」再给一遍，用来观察去重。
const REPLIES = [
  {
    goal: '结账如何预留库存',
    goalChanged: false,
    summary: '结账先调用库存边界，再决定是否继续。',
    nodes: [
      { title: '结账入口', file: 'checkout.py', line: 2, reason: '把订单交给库存边界。', role: '结账流程的编排入口', confidence: 'high' },
      { title: '库存预留', file: 'inventory.py', line: 3, reason: '判断可用库存是否满足订单。', role: '库存边界的判定', relation: '结账入口调用它', confidence: 'high' },
    ],
  },
  {
    goalChanged: false,
    summary: '库存不足时结账直接返回，不再进入支付。',
    nodes: [
      { title: '库存预留', file: 'inventory.py', line: 3, reason: '这一站已经在路径上。', confidence: 'high' },
      { title: '库存不足的分支', file: 'checkout.py', line: 4, reason: '库存不足时在这里提前返回。', role: '结账流程的分支出口', relation: '承接库存预留的判定结果', confidence: 'high' },
    ],
  },
  {
    goal: '支付扣款如何发生',
    goalChanged: true,
    summary: '扣款由支付网关完成。',
    nodes: [
      { title: '扣款调用', file: 'payment.py', line: 2, reason: '把订单金额交给支付网关。', role: '支付边界', confidence: 'high' },
    ],
  },
];

function createModel(prompts) {
  let index = 0;
  return {
    async request(prompt) {
      prompts.push(prompt);
      if (prompt.includes('Extract code search terms')) {
        return '{"terms":[]}';
      }
      const reply = REPLIES[index];
      index += 1;
      return JSON.stringify({ kind: 'route', ...reply });
    },
  };
}

function describePath(route) {
  return route.nodes
    .map((node, index) => {
      const file = node.location.path.split('/').at(-1);
      const added = node.addedByQuestion ? ` [新增 · 来自「${node.addedByQuestion}」]` : '';
      return `  ${index + 1}. ${file}:${node.location.line} ${node.title}${added}`;
    })
    .join('\n');
}

function report(label, route) {
  console.log(`\n${label}`);
  console.log(`  探索目标：${route.goal ?? '(未命名)'}`);
  console.log(`  待确认的新目标：${route.pendingGoal ?? '(无)'}`);
  console.log(`  路径共 ${route.nodes.length} 站：`);
  console.log(describePath(route));
}

async function main() {
  const store = new SessionStore();
  const prompts = [];
  const tutor = new AiTutor(createProject(), createModel(prompts));
  const token = cancellationToken(new AbortController().signal);

  const ask = async (question) => {
    const previous = store.beginQuestion(question);
    const result = await tutor.answerQuestion(
      question,
      previous,
      token,
      undefined,
      store.snapshot().route,
    );
    if (result.kind !== 'route') {
      throw new Error('示例期望路线回答，请检查固定回答。');
    }
    store.completeQuestionWithRoute(result.route);
    console.log(`\n提问：${question}`);
  };

  try {
    await ask('结账时库存是怎么预留的？');
    report('第一次提问之后', store.snapshot().route);

    await ask('那库存不足时会走到哪一行？');
    report('第二次提问之后（同一目标，路径变长）', store.snapshot().route);

    const followUpPrompt = prompts.at(-1);
    console.log(`\n  第二次提问的提示词带上了当前目标：${followUpPrompt.includes('Current exploration goal: 结账如何预留库存')}`);
    console.log(`  第二次提问的提示词列出了已有站点：${followUpPrompt.includes('Stops already on the reading path')}`);
    console.log(`  第二次提问的提示词要求只返回新增：${followUpPrompt.includes('Return only the stops this question adds')}`);

    await ask('那支付扣款是在哪里发生的？');
    report('第三次提问之后（换了目标，但还没确认）', store.snapshot().route);

    const accepted = store.startNewGoal();
    console.log(`\n用户选择「开始新的探索目标」：${accepted}`);
    report('确认新目标之后', store.snapshot().route);
  } finally {
    store.dispose();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
