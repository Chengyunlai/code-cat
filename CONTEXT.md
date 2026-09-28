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

Stage 05 的高层到现场探索见 `docs/implementation/stage-05-guided-depth.md` 和 `examples/stage-05-guided-depth/`。本地测试包为 `0.2.8-preview`；Marketplace 公开的 `0.2.3-preview` 不含此改动。共享提示词先解释作用、职责与边界，再进入最小代码路径；暂停 UI 将路径线索与真实观察分开，提供可编辑的作用/机制/验证追问。真实暂停与未采集数据的证据边界不变。此阶段的测试、基线和工作树状态以阶段记录中的实测结果为准。

PyCharm 261 引擎启动顺序和错误诊断修复使用本地 `0.2.5-preview` 包；`0.2.4-preview` 的通用“操作未完成”提示缺少真实错误原因。随后因配置弹窗暴露机器专属 Node 路径，将运行时自动发现并升至 `0.2.6-preview`；Marketplace 审核版本未变。共享的阅读路径职责/关系改动把本地测试包升至 `0.2.7-preview`；VS Code 包版本不随该共享改动递增，仍以 `--force` 覆盖安装同名 `0.2.4` 包。

对话中的相关代码组织图由宿主投影当前 RoutePlan 已校验的全部文件身份（相对路径、节点 ID、阅读标题、模块职责），共享 UI 按目录分组；组织连线不表示调用关系或运行证据。文件下方优先显示模块职责（`RouteNode.role`），缺失时回退阅读标题。源码导航仍由宿主依据原节点 ID 执行。默认展示最多四个目录、每目录两个文件，可展开；详见 Stage 05 记录。

阅读路径的每个节点在 `reason`（为什么停在这一行）之外可选携带 `role`（这个文件或模块负责什么、为什么存在）与 `relation`（与上一个节点的关系：调用方向、数据来源或跨越的边界），首个节点不填 `relation`。两者都是源码推断，与真实调试证据分开呈现：路径卡上 `role` 用 accent 竖线、`relation` 用推断色。旧模型输出缺少这两个字段时界面不占位，行为不变。

Marketplace 免费预览版的发布资料位于 plugins/jetbrains/MARKETPLACE.md，隐私说明位于 plugins/jetbrains/PRIVACY.md。0.2.3-preview 已提交审核，插件页为 https://plugins.jetbrains.com/plugin/34438-code-cat；当前尚未公开，不能表述为已上架。当前工作树另生成 251 WebStorm 与 261 PyCharm 两个本地包，已去除强制 NodeJS 依赖；PyCharm 免费版中的 NodeJS 运行时可能被禁用。详见 docs/implementation/stage-05-guided-depth.md。

当前基线仍为 main/6babced，先前 0.1.7–0.1.9 改动保留在未提交工作树。本轮版本 0.2.0，未提交或推送。

核心迁入 packages/core，无 vscode 导入；src 原路径保留兼容转发。共享 UI 在 packages/ui；JetBrains 经 packages/engine 的私有 stdio 通信。plugins/jetbrains 使用平台调试、源码导航、PasswordSafe 和 JCEF。WebStorm SDK 251 已构建并真实命中 TS source-map 断点，共享引擎已保存观察消息。PyCharm 261 已验证插件加载与 JCEF 宿主创建，页面内容回读和 Python 真暂停尚未验证。预览版尚无变量、完整调用栈和跨 IDE 历史同步，不宣称整个 JetBrains 产品线已验证。

后续阅读 docs/implementation/stage-04.md、examples/stage-04-shared-core/README.md、plugins/jetbrains/README.md。继续修改核心需运行独立引擎测试及原 VS Code 回归；修改宿主需运行隔离 WebStorm 测试。

0.2.1 修正 JetBrains 深色阅读样式：行内源码链接独立于普通按钮的尺寸/悬停，跟随编辑器底色，去除重复品牌标题、精简输入区。测试与截图见 stage-04 末尾。

0.2.2 修复用户在 agent-boot 中询问 defineCapability 却只获调用示例的问题：确认该仓库本身名为 @agent-boot/core，定义在 src/capability/definition.ts。JetBrains 主源码目录优先扫描、最多2000文件并标记截断，声明精确命中优先且围绕定义截取；两端补本地包身份，VS Code 也按提问选择摘录。新增 test/engine/retrieval.cjs 和 stage04 的 inspect-project.cjs，实际仓库只读验证已确认定义进入上下文。模型输出仍非确定性；历史错误回答不会被修改。

0.2.3：实际 agent-boot RunManager 指向 issue-3/main.ts，而用户断点在 issue-6/main.ts。增加 DebugLaunch，精确匹配入口优先；不匹配显示完整路径与选择，明确选择后才复制现有 Node 配置（保留解释器/加载器/参数）。原配置不变。启动即记录运行状态，无暂停结束时给出检查提示。原生 smoke 现在验证错误旧入口复制到正确入口后真实停回 TS，防止只测手工预配置的理想路径。

## 0.2.3 远程同步记录

用户已授权提交并同步到 origin/main。实现提交：`7507e80b6d02eb62d385ad238ced41c1167973ad`，标题：`feat(ide): 共享代码阅读核心并接入 JetBrains 调试预览版`。本次记录覆盖 Stage 02–04 与 0.2.1–0.2.3 修复；前文“未提交/未推送”描述的是当时验证状态。提交前再次执行 npm run check 与 git diff --check，通过。安装包、依赖和测试沙箱为构建产物，不纳入 Git；构建与复现入口已随源码同步。

## Stage 06 · 检索与暂停绑定

`extractRetrievalTerms`（`packages/core/src/project/retrievalTerms.ts`）是两端共用的检索词提取规则，只认拉丁标识符。中文提问返回空数组是「需要扩展」的信号，不是失败；此前两端各写一份同样的正则，规则容易漂移。

`AiTutor.retrievalHints` 只在问题提不出标识符时才调用模型生成候选标识符——已经带 `authorize`、`CheckoutService` 这类词的问题一次调用都不多花。候选词仅参与符号打分，命中真实符号才加分，因此不会凭空产生文件。该调用是非流式的，输出不进入界面。`ProjectContext.promptContext(question, hints)` 增加可选参数，两个宿主同步支持；省略时行为与之前一致。

`answerPauseQuestion` 现在同时携带项目检索结果，让暂停之后的设计类问题能引用现场之外的代码。提示词要求把「已观察」的现场证据与「源码推断」的检索结果分开陈述，`Do not create a new reading route` 保留不变，追问不会突然弹出一条新路线。

扩展调用失败或超时退回空词集检索，不阻塞回答。示例与验证见 `examples/stage-06-retrieval-and-pause-binding/` 与 `docs/implementation/stage-06-retrieval-and-pause-binding.md`。

## 版本与发布状态

两个安装包的版本号各有唯一来源：VS Code 取 `package.json` 的 `version`（当前 `0.2.5`），JetBrains 取 `plugins/jetbrains/src/main/resources/META-INF/plugin.xml` 的 `<version>`（当前 `0.2.8-preview`），构建脚本从这里读取并用于 zip 文件名，不要再手改脚本里的版本串。

JetBrains Marketplace：pluginId `34438`，pluginXmlId `dev.codecat`，线上 `0.2.3-preview` 已通过审核并公开，兼容范围只有 `251.*`（2025.1 系列），因此 PyCharm / WebStorm 2026.1 装不上。每个新版本都要人工审核，通常 3–4 个工作日，没有通道豁免。上传后只有兼容范围可改，描述与 change notes 必须在上传前定稿。发布流程、接口与自查清单见 `plugins/jetbrains/MARKETPLACE.md`；命令行上传用 `npm run publish:jetbrains`（`scripts/publish-jetbrains.py`，需要 `PUBLISH_TOKEN`）。
