# Code Cat

Code Cat helps a learner understand a Python, TypeScript or JavaScript project by combining model-guided reading routes with runtime debugger evidence.

## Navigation and verification

Read README.md → AGENTS.md → this file → examples/README.md → the relevant docs/implementation record. `examples/` is the canonical example root; stage examples start with `user_code/`, then `core/`. Keep these entries synchronized when public usage or implementation paths change.

Run `npm run check` and `npm run smoke:vscode`. For rendered UI verification, compile then run `node test/webview/index.cjs` with Playwright available and Chrome installed (or CODE_CAT_BROWSER_EXECUTABLE set).

## Pause conversation flow

`DebugSessionObserver` captures stack, bounded variables and nearby workspace source at pause time. `SessionStore.recordPause` adds an observation to the conversation. Questions capture the selected pause before invoking `AiTutor.answerPauseQuestion`; late answers keep their original pause ID. Ordinary project questions still use route/chat classification when no snapshot exists.

The conversation is the default UI. Observation details expose raw evidence progressively; only the next-step action stays beside the composer; advanced controls, evidence selection and model settings live under More. Users can edit drafts while a request is pending and cancel the active answer. Only the current successfully captured pause can control execution. Source snippets are recorded evidence, not executed-line traces.

Raw snapshots remain in memory. Conversation text and observation references persist; restored conversations label unavailable snapshots explicitly. The current stage is documented in docs/implementation/stage-01.md.

Visual roles are registered under `contributes.colors` as `codeCat.accent`, `accentHover`, `onAccent`, `observed`, `inference`, and `uncertainty`. CSS consumes the corresponding VS Code theme variables; defaults cover light, dark and both high-contrast modes. Users can override them with `workbench.colorCustomizations`. Semantic answer labels retain their text and only color explicit labels, without inferring certainty from arbitrary prose. Source and stack locations navigate through the existing validated frame path. Python highlighting is a safe, lightweight display tokenizer, not a parser.

## Language

**Conversation**:
A user-facing discussion started by one initial question and continued through related follow-ups. It can be archived and reopened independently from a debugger run.
_Avoid_: Session, chat log, debug session

**Code exploration**:
One concrete code-understanding objective inside a conversation. It starts with a concise direction and reveals its reading path only as the learner chooses to continue.
_Avoid_: Full analysis, route dump, debug session

**Reading path**:
An ordered hypothesis of useful source locations for one code exploration, revealed progressively. It guides reading but is not runtime evidence.
_Avoid_: Call stack, complete answer, execution trace

**Debug evidence**:
The call stack and bounded variables captured from a real debugger pause after the learner chooses a breakpoint. It is runtime evidence, not part of the planned reading path.
_Avoid_: Reading path, model guess, static route

**Reported token usage**:
Input, output, cache, and total token counts explicitly returned by the active model provider. It is provider-aligned usage data, not a guarantee of final billing cost.
_Avoid_: Exact cost, guaranteed billable tokens

**Estimated token usage**:
A locally calculated token count used only when the provider does not report usage. It must always be visibly distinguished from reported token usage.
_Avoid_: Actual usage, billable tokens

**Project usage ledger**:
The locally persisted accumulation of reported and estimated token usage for one VS Code workspace project. Starting a new conversation does not reset it, and it is never written into the project repository.
_Avoid_: Billing ledger, repository usage file, global usage total

## TS / JS support (0.1.7)

ProjectIndex scans Python and JS/TS source families. Script symbols use the VS Code document symbol service with a bounded declaration fallback. Node launch prefers existing configurations, otherwise JS files or TS with locally installed tsx. Browser debugging is not supported. Node child sessions are observed when their launcher belongs to the guided session. See docs/implementation/stage-02.md and examples/stage-02-node-conversation/.

## Streaming and readable answers (0.1.8)

Model clients emit cumulative response text. AiTutor extracts only the incomplete JSON message/summary for display; final JSON validation remains. SessionStore keeps streamingAnswer ephemeral, separate from persisted chat history. Extension callbacks are throttled and cancellation-guarded. Source excerpts are bounded; relative Markdown source links are validated by the extension before navigation. Fenced code uses safe text-based highlighting and copy controls. See docs/implementation/stage-03.md.

Route answers persist their RoutePlan on the assistant message. Historical debug actions resolve the stored message ID, validate its file and line, and reuse the route without invoking the model or duplicating the conversation. Active debugging only adds a breakpoint; idle debugging restores the route. Legacy messages fall back to the last matching conversation route.

## Stage 04 · 共享核心 / JetBrains

Marketplace 免费预览版的发布资料位于 plugins/jetbrains/MARKETPLACE.md，隐私说明位于 plugins/jetbrains/PRIVACY.md。0.2.3-preview 已提交审核，插件页为 https://plugins.jetbrains.com/plugin/34438-code-cat；当前尚未公开，不能表述为已上架。构建包包含 MIT LICENSE 与 40px SVG 图标，插件仅声明 251.* 且依赖 NodeJS。详见 docs/implementation/stage-04.md。

当前基线仍为 main/6babced，先前 0.1.7–0.1.9 改动保留在未提交工作树。本轮版本 0.2.0，未提交或推送。

核心迁入 packages/core，无 vscode 导入；src 原路径保留兼容转发。共享 UI 在 packages/ui；JetBrains 经 packages/engine 的私有 stdio 通信。plugins/jetbrains 使用平台调试、源码导航、PasswordSafe 和 JCEF。WebStorm SDK 251 已构建并真实命中 TS source-map 断点，共享引擎已保存观察消息。预览版尚无变量、完整调用栈和跨 IDE 历史同步，不宣称整个 JetBrains 产品线已验证。

后续阅读 docs/implementation/stage-04.md、examples/stage-04-shared-core/README.md、plugins/jetbrains/README.md。继续修改核心需运行独立引擎测试及原 VS Code 回归；修改宿主需运行隔离 WebStorm 测试。

0.2.1 修正 JetBrains 深色阅读样式：行内源码链接独立于普通按钮的尺寸/悬停，跟随编辑器底色，去除重复品牌标题、精简输入区。测试与截图见 stage-04 末尾。

0.2.2 修复用户在 agent-boot 中询问 defineCapability 却只获调用示例的问题：确认该仓库本身名为 @agent-boot/core，定义在 src/capability/definition.ts。JetBrains 主源码目录优先扫描、最多2000文件并标记截断，声明精确命中优先且围绕定义截取；两端补本地包身份，VS Code 也按提问选择摘录。新增 test/engine/retrieval.cjs 和 stage04 的 inspect-project.cjs，实际仓库只读验证已确认定义进入上下文。模型输出仍非确定性；历史错误回答不会被修改。

0.2.3：实际 agent-boot RunManager 指向 issue-3/main.ts，而用户断点在 issue-6/main.ts。增加 DebugLaunch，精确匹配入口优先；不匹配显示完整路径与选择，明确选择后才复制现有 Node 配置（保留解释器/加载器/参数）。原配置不变。启动即记录运行状态，无暂停结束时给出检查提示。原生 smoke 现在验证错误旧入口复制到正确入口后真实停回 TS，防止只测手工预配置的理想路径。

## 0.2.3 远程同步记录

用户已授权提交并同步到 origin/main。实现提交：`7507e80b6d02eb62d385ad238ced41c1167973ad`，标题：`feat(ide): 共享代码阅读核心并接入 JetBrains 调试预览版`。本次记录覆盖 Stage 02–04 与 0.2.1–0.2.3 修复；前文“未提交/未推送”描述的是当时验证状态。提交前再次执行 npm run check 与 git diff --check，通过。安装包、依赖和测试沙箱为构建产物，不纳入 Git；构建与复现入口已随源码同步。
