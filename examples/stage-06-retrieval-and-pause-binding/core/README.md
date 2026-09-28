# 核心映射

检索词提取规则只有一份：`packages/core/src/project/retrievalTerms.ts`。两端宿主都从这里导入，避免各写一份正则后漂移。它只认拉丁标识符，中文提问返回空数组——这不是失败，而是「需要扩展」的信号。

`packages/core/src/ai/aiTutor.ts` 的 `retrievalHints` 决定何时值得多花一次模型调用：问题里已经有标识符就直接返回空数组，一次调用都不花；只有提不出词时才请模型给出候选标识符。候选词只参与 `scoreSymbol` 打分，命中真实符号才加分，因此不会凭空产生文件。这次调用是非流式的——它的输出不进入界面。

两个宿主的实现分别在 `src/project/projectIndex.ts` 与 `packages/engine/src/project.ts`，都通过 `ProjectContext.promptContext(question, hints)` 接收扩展词。`answerPauseQuestion` 同时改为携带项目检索，让暂停之后的设计类问题能引用现场之外的代码；`Do not create a new reading route` 保留不变，追问不会突然弹出一条新路线。

关键断点：`selectPromptSymbols`（观察 `terms` 是否为空、选中集合如何变化）、`retrievalHints` 里的分支判断（观察带标识符的问题是否真的跳过了模型调用）。

设计与验证见 `docs/implementation/stage-06-retrieval-and-pause-binding.md`。
