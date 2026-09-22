# 实现路径

- `requestStreamingModel`：读取真实 SSE，处理跨网络块的 UTF-8、协议终止事件与用量；取消和超时中止网络。
- `partialAnswer`：从未闭合的 JSON 中只提取 message / summary，处理转义，不把协议字段显示给用户。
- `AiTutor.answerQuestion` / `answerPauseQuestion`：传递正文片段，要求按概念展开、引用已有源码、给出验证方向。
- `ProjectIndex.promptContext`：加入有数量与长度上限的真实源码摘录，防止只能依靠符号列表讲解。
- `SessionStore.streamAnswer`：临时回答与正式历史分离；完成后写正式答案，失败或取消时移除临时内容。
- `renderBusy` / `renderRichText`：流式正文使用同一阅读渲染器；标题、列表、代码与链接都是安全 DOM 元素。
- `openSourceReference`：扩展宿主再次验证源码文件与行号，再跳转。

协议测试：`test/smoke/streaming.js`；界面测试：`test/webview/index.cjs`。模型仍可能忽略排版指令，因此测试证明传输与交互，不宣称所有在线模型都能给出优质解释。

历史路径：`ChatMessage.route` 持久化；`SessionStore.routeForMessage` 按消息 ID 查找；`debugFromMessage` 校验位置并区分运行中补断点与结束后重新启动。
