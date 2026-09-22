# 工作导航

开始前按顺序阅读 `README.md` → `AGENTS.md` → `CONTEXT.md` → `examples/README.md` → 相关 `docs/implementation/` 记录。

- 唯一 canonical example 根目录是 `examples/`。新增阶段使用独立目录，包含 `user_code/` 和 `core/`；先验证用户通过公开 UI / API 的使用路径，再说明内部实现。
- 修改使用入口、状态模型或目录时，同步 README、CONTEXT、示例索引与阶段记录。断点用稳定符号定位，不照抄旧行号。
- 调试证据必须来自真实暂停；区分当前暂停、历史观察、源码推断和不可用证据。不要执行模型生成的表达式。
- 使用 `npm run check` 检查类型；调试链路使用 `npm run smoke:vscode`。UI 改动另做实际 Webview 渲染验证。
- 记录真实测试结果、基线与工作树状态；未经用户授权不提交、推送或发布。不要求文档包含自身所在提交的 SHA。
