# 核心映射

`packages/core/src/ai/aiTutor.ts` 负责由项目问题建立“作用 → 边界 → 路径”的回答约束，并让暂停追问沿已有对话继续深入。`packages/ui/src/runtimeMapScript.ts` 负责把阅读路径线索与真实暂停并列呈现，将推荐问题放进可编辑输入框；`runtimeMapStyles.ts` 保持窄面板与深色主题可读。宿主仍负责真实断点、快照和主动单步。设计与验证见 `docs/implementation/stage-05-guided-depth.md`。

组织图的数据由 `src/views/runtimeMapView.ts` 和 `packages/engine/src/main.ts` 从已校验的阅读路径投影；UI 用目录包含关系绘制，并通过节点 ID 请求宿主打开源码。它不是模型生成的调用图，也不把完整仓库误称为当前问题的局部视图。
