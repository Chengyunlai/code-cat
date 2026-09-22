# 核心实现

- `ProjectIndex.snapshot`：扫描 Python / TS / JS；脚本符号优先使用 VS Code 语言服务，超时或不可用时退回声明扫描。
- `AiTutor.answerQuestion`：先检查支持的源码，再发送项目上下文；不再要求 Python 文件存在。
- `nodeFileConfiguration`：JS 使用 Node；TS 使用项目已安装的 tsx；否则要求显式运行配置。
- `DebugSessionObserver.observeAdapterMessage`：跟踪真实 Node 子会话，捕获暂停，不把启动器当执行现场。
- 连续追问复用 `AiTutor.answerPauseQuestion` 与现有证据归属机制。

公开使用路径见 [user_code](../user_code/README.md)。真实验证见 [stage-02](../../../docs/implementation/stage-02.md)。
