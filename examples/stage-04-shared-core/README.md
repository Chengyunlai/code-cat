# Stage 04 · 同一核心，不同 IDE

先执行 `npm run compile`，再执行 `node examples/stage-04-shared-core/user_code/main.cjs`。这个示例只导入 `@code-cat/core` 的公开入口，在普通 Node 中完成一次会话问答，不需要 VS Code 或 JetBrains。它验证的是会话 API，不伪装成真实调试证据。

真实调试使用 `npm run smoke:vscode` 和 `npm run smoke:jetbrains`：后者在隔离 WebStorm 中运行库存函数，从生成的 JS 经 source map 停回 `main.ts`，宿主把暂停传给共享引擎。

阅读顺序：[用户入口](user_code/main.cjs) → [核心说明](core/README.md) → [实现记录](../../docs/implementation/stage-04.md)。

要检查模型实际能看到哪些源码，可运行 `node examples/stage-04-shared-core/user_code/inspect-project.cjs /项目路径 defineCapability`。该入口仅打印本地检索结果，不调用模型；关注本地包身份、扫描范围、定义位置和源码摘录，不能把未选中的文件当作不存在。
