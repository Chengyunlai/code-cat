# 暂停对话的实现路径

先运行 [user_code](../user_code/README.md)。正式源码保留在 `src/`，这里不复制实现。

| 稳定符号 | 实现位置 | 要观察的行为 |
| --- | --- | --- |
| `DebugSessionObserver.capturePause` | `src/debug/debugSessionObserver.ts` | 真实 DAP 栈和变量，暂停时截取的工作区源码；失败不伪装成成功 |
| `SessionStore.recordPause` | `src/core/sessionStore.ts` | 对话新增观察，选中最新暂停；保留正在处理的问题 |
| `actions.askQuestion` | `src/extension.ts` | 请求开始时捕获选定快照，之后切换观察不更换本次证据 |
| `AiTutor.answerPauseQuestion` | `src/ai/aiTutor.ts` | 问题、历史、源码和快照进入同一请求；不重新规划路径 |
| `SessionStore.completeQuestionWithAnswer` | `src/core/sessionStore.ts` | 回答绑定原快照 ID；运行已继续时仍标为历史依据 |
| `renderObservation` | `src/views/runtimeMapScript.ts` | 对话内观察与按需展开的证据；原始快照释放时明确标注 |

取消通过 VS Code CancellationToken 与 Promise 竞速结束请求。迟到的服务返回不能落入下一条问题。原始运行快照不持久化；聊天中的观察标识和回答会持久化。

验证与提交状态见 [阶段记录](../../../docs/implementation/stage-01.md)。实现提交：`d1d6112dbcaa861387a978c98b107dbceafffbb0`。
