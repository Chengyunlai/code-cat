# 先运行，再追问

这是插件用户真正调试的 Python 程序，不依赖 Code Cat 内部类。Code Cat 的公开使用入口是 VS Code 视图与命令，而非 Python SDK。

仓库根目录执行：

```sh
python3 examples/stage-01-pause-conversation/user_code/main.py
```

输入是 `checkout(quantity=10)`，库存为 8。输出为 `库存不足，未进入扣款步骤`，不会出现 `已进入扣款步骤`。

## 通过插件验证

1. 在扩展开发窗口或安装新版插件的 VS Code 中打开本 `user_code/` 文件夹，打开 `main.py`，选择 Python 解释器并配置模型。
2. 在 Code Cat 输入“库存不足时，还会扣款吗？”。在 `reserve_inventory` 的 `if stock < quantity` 行放置断点，从 Code Cat 启动调试。也可在其规划的核心位置开始，再单步进入库存函数。
3. 对话中出现观察，源码为当前判断，展开依据可见变量 `stock=8`、`quantity=10`。点“解释一下”，再问“凭什么确定不会扣款？”和“异常会被谁处理？”。
4. 回答应区分当前运行值、源码推断和未验证部分。点“单步验证”观察异常分支，再在“更多 → 提问依据”中切回第一次观察，确认它显示为历史，不能控制当前执行。
5. 模型回答期间输入下一条草稿，再点停止回答。草稿应保留，可以再次发送。

最短调用链：用户在 Code Cat 提问 → 选择断点并运行这个 Python 文件 → 暂停出现于对话 → 继续输入问题。无需用户理解 DAP、快照字段或模型提示协议。

先读本文件，再读 [core](../core/README.md) 或 [阶段记录](../../../docs/implementation/stage-01.md)。模型回答文字会随模型变化；上面的实际变量和程序输出不会因此改变。
