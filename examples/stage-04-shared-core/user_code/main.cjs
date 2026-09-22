// Public core API: run with plain Node, without either IDE installed.
const assert = require('node:assert/strict');
const { SessionStore } = require('../../../packages/core');
const store = new SessionStore();
store.beginQuestion('库存判断为什么失败？');
store.completeQuestionWithAnswer('先观察真实暂停，再对照库存和需求量。');
assert.equal(store.snapshot().chatMessages.length, 2);
assert.equal(store.snapshot().requestKind, undefined);
console.log('共享会话核心可脱离 IDE 运行；问答完成后可以继续提问。');
store.dispose();
