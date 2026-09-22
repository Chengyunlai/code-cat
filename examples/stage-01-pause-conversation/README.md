# Stage 01：围绕暂停现场持续追问

从 [user_code/README.md](user_code/README.md) 开始，运行独立 Python 程序并通过插件的公开 UI 调试。再读 [core/README.md](core/README.md) 了解实现。

此例验证库存判断、暂停源码、连续追问和异常分支；不验证自动调试代理或真实支付系统。

命令：`python3 examples/stage-01-pause-conversation/user_code/main.py`（仓库根目录）。输入数量 10、库存 8，输出 `库存不足，未进入扣款步骤`。

[本地设计与实现记录](../../docs/implementation/stage-01.md)。尚未提交。
