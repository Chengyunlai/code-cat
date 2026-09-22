# Example 导航

`examples/` 是唯一示例根目录。阶段示例先读并运行 `user_code/`，再读 `core/`；修改使用路径时同步更新本索引和阶段记录。

| Example | 运行入口 | 预期结果 | 记录 / 提交 |
| --- | --- | --- | --- |
| [stage-01-pause-conversation](stage-01-pause-conversation/README.md) | `python3 examples/stage-01-pause-conversation/user_code/main.py` | 库存不足，未进入扣款步骤；暂停后可连续追问 | [stage-01](../docs/implementation/stage-01.md)，实现提交 `d1d6112` |
| python-order-service | 扩展开发窗口默认工作区；`npm run smoke:vscode` | 库存与支付调试链路 | 既有集成示例 |
| python-console-entrypoint | `npm run smoke:vscode` 第二组 | 项目脚本入口命中断点 | 既有集成示例 |
