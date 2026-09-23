# Example 导航

`examples/` 是唯一示例根目录。阶段示例先读并运行 `user_code/`，再读 `core/`；修改使用路径时同步更新本索引和阶段记录。

| Example | 运行入口 | 预期结果 | 记录 / 提交 |
| --- | --- | --- | --- |
| [stage-01-pause-conversation](stage-01-pause-conversation/README.md) | `python3 examples/stage-01-pause-conversation/user_code/main.py` | 库存不足，未进入扣款步骤；暂停后可连续追问 | [stage-01](../docs/implementation/stage-01.md)，实现提交 `d1d6112` |
| python-order-service | 扩展开发窗口默认工作区；`npm run smoke:vscode` | 库存与支付调试链路 | 既有集成示例 |
| python-console-entrypoint | `npm run smoke:vscode` 第二组 | 项目脚本入口命中断点 | 既有集成示例 |
| [stage-02-node-conversation](stage-02-node-conversation/README.md) | `node examples/stage-02-node-conversation/user_code/main.js` | TS / JS 索引与 Node 断点追问 | [stage-02](../docs/implementation/stage-02.md)，工作树实现 |
| [stage-03-streamed-reading](stage-03-streamed-reading/README.md) | 复用 stage-02 的公开 UI 操作 | 实时回答、源码链接与可读代码 | [stage-03](../docs/implementation/stage-03.md)，工作树实现 |

- [Stage 04：共享核心与 IDE 宿主](stage-04-shared-core/README.md)：普通 Node 调用公开会话 API，以及 WebStorm TS 真断点验证入口。

JetBrains 免费预览版已[提交 Marketplace 审核](https://plugins.jetbrains.com/plugin/34438-code-cat)，安装与审核状态见 [插件指南](../plugins/jetbrains/README.md)；示例运行方式不因发布渠道改变。
