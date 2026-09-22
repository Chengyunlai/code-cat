# 关键职责与断点

- `packages/core/src/ports.ts`：模型、源码、存储与取消接口，核心不依赖 IDE。
- `SessionStore.beginQuestion / completeQuestionWithAnswer`：观察提问中到可继续提问的状态转换。
- `SessionStore.recordPause`：仅接受当前调试会话的快照；保留“观察不是当前行已执行”的含义。
- `AiTutor.answerPauseQuestion`：按真实快照构建追问，区分源码推断与运行证据。
- `packages/engine/src/main.ts` 的 `dispatch`：std​​io 消息进入同一个核心；暂停事件顺序处理，提问取消可即时处理。
- JetBrains `IdeActions.capture`：平台暂停位置转换成共享数据；明确缺失变量/完整栈。
- `packages/ui`：与宿主无关的 HTML、样式与交互；VS Code 与 JCEF 各自适配消息桥。
