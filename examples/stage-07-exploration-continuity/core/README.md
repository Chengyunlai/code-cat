# 核心映射

累积这件事只有一个实现点：`packages/core/src/core/sessionStore.ts` 的 `accumulateRoute`，由 `applyRoute` 调用。两端宿主都只投影结果，不各写一份合并逻辑。

- **身份判定**：`routeNodeKey` 用「文件 + 行」当站点身份。模型重复给出已有站点时被过滤掉，只有真正新增的站点会被追加到路径尾部，并打上 `addedByQuestion`（带来这一站的那个问题）。第一条路径上的站点不打标记——那批站点是起点，不是新增。
- **已展开数**：`revealedRouteNodeCount` 从「固定为 1」改为 `min(总站数, max(1, 原值) + 新增数)`。用户已经展开的部分保持展开，本次新增的直接可见；否则连续提问后用户看到的还是「路径没变」。
- **目标**：`RoutePlan.goal` 是当前正在理解的功能，`pendingGoal` 是模型建议的新目标。`goal` 只在模型给出新目标且不是「换目标」时更新；`pendingGoal` 出现时界面给一个「开始新的探索目标」入口，由 `SessionStore.startNewGoal()` 采纳——只保留 `addedByQuestion` 等于本次提问的站点。首条路径没有「上一个目标」，所以 `accumulateRoute` 会把模型误报的 `pendingGoal` 降级为 `goal`。
- **现场证据**：`applyRoute` 不再重置 `pauses` / `selectedPauseId` / `selectedFrameId`。结束调试后再提问，之前采集的暂停仍然属于同一个上下文。

提示词侧在 `packages/core/src/ai/aiTutor.ts`：`existingPathContext` 把当前目标与已有站点（压缩成「路径:行 标题 职责」）拼进提示词，`routeInstructions` 要求模型只返回本次新增的站点、并让 summary 接着已有链路说。`answerQuestion` 与 `locateRoute` 都新增了一个可选的「当前路径」参数，由宿主从 `store.snapshot().route` 传入；没有路径时这段上下文为空串，首问的提示词与加入本阶段之前完全一致。

渲染侧在 `packages/ui/src/runtimeMapScript.ts`：

- `pathScaleLabel` 给路径卡加「路径共 N 站 · 本次新增 K 站」。
- `renderExplorationContext` 先渲染「探索目标」，再渲染起点卡。路径超过一站时标签从「核心代码位置」改为「阅读路径起点」——累积之后 `nodes[0]` 是整次探索的入口，不再是「本问题的核心位置」。
- 断点邀请不再无条件出现，也不再泛泛地问「想通过断点看看这个过程吗」。`breakpointInvitationStop` 取当前已展开的最后一站（`confidence` 为 `low` 的猜测站跳过），文案指名「第几站、哪个文件:行、能看到什么」，按钮降为次级样式。

关键断点：`accumulateRoute`（观察 `route.nodes` 是追加还是替换、`revealedRouteNodeCount` 怎么变）、`applyRoute` 的提示词上下文分支（观察第二次提问时提示词里是否出现 `Stops already on the reading path`）、`breakpointInvitationStop` 的循环（观察哪些站点会被跳过）。

两端投影分别在 `src/views/runtimeMapView.ts` 与 `packages/engine/src/main.ts`，都只是 `state.route.nodes.slice(0, state.revealedRouteNodeCount)`，本阶段没有改投影逻辑，只同步了调用点。新增的 `startNewGoal` 消息在两端各有一个分支。
