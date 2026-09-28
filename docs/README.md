# 文档导航

按「你想了解什么」组织。所有路径都相对于仓库根目录。

## 我想先用起来

| 你的疑问 | 看这里 |
| --- | --- |
| 这东西是什么？装得上吗？ | [README.md](../README.md) |
| 想先跑一个能动的例子 | [examples/README.md](../examples/README.md) |
| 支持哪些模型服务，Key 放哪 | [README · 模型服务与配置](../README.md#模型服务与配置) |
| 想在 JetBrains 里装 | [plugins/jetbrains/README.md](../plugins/jetbrains/README.md) |
| 想知道发了哪些版本 | [CHANGELOG.md](../CHANGELOG.md) |

## 我想改代码

| 你的疑问 | 看这里 |
| --- | --- |
| 提改动的流程、验证要求 | [CONTRIBUTING.md](../CONTRIBUTING.md) |
| 环境怎么搭、分层怎么分、怎么验证 | [development.md](development.md) |
| 有哪些跨阶段稳定的规则 | [AGENTS.md](../AGENTS.md) |
| 术语怎么定义、当前事实是什么 | [CONTEXT.md](../CONTEXT.md) |
| 接下来打算做什么 | [roadmap.md](roadmap.md) |

## 我想理解设计

| 你的疑问 | 看这里 |
| --- | --- |
| 整体分层与数据流 | [architecture/mvp.md](architecture/mvp.md) |
| 为什么这么拆，失败路径是什么 | [architecture/mvp.md](architecture/mvp.md) |
| 参考过哪些可复用构件 | [research/reusable-building-blocks.md](research/reusable-building-blocks.md) |

## 我想知道某个阶段是怎么做的

每个阶段都有一份实现记录，结构固定：目标 → Mermaid 图 → 验收场景 → 边界 → 验证方式 → 实现完成回填。

| 阶段 | 主题 | 记录 |
| --- | --- | --- |
| Stage 01 | 从问题到验证：暂停对话 | [stage-01.md](implementation/stage-01.md) |
| Stage 02 | 支持 TS / JS 与 Node 调试 | [stage-02.md](implementation/stage-02.md) |
| Stage 03 | 流式回答与可读的源码摘录 | [stage-03.md](implementation/stage-03.md) |
| Stage 04 | 共享核心与 JetBrains 宿主 | [stage-04.md](implementation/stage-04.md) |
| Stage 05 | 从作用到现场的连续探索 | [stage-05-guided-depth.md](implementation/stage-05-guided-depth.md) |
| Stage 06 | 中文提问检索与暂停绑定 | [stage-06-retrieval-and-pause-binding.md](implementation/stage-06-retrieval-and-pause-binding.md) |
| Stage 07 | 阅读路径围绕探索目标累积 | [stage-07-exploration-continuity.md](implementation/stage-07-exploration-continuity.md) |
| Stage 08 | 请求活性：超时与取消必定生效 | [stage-08-request-liveness.md](implementation/stage-08-request-liveness.md) |

对应阶段的可运行示例在 [`examples/stage-NN-<slug>/`](../examples/README.md)，先读并运行 `user_code/`，再读 `core/`。

## 文档怎么维护

- 设计记录与实现记录是**同一个文件**：先写目标、验收场景与边界，实现后追加「实现完成回填」，写明实际代码映射、实际断点与观察变量、实际执行过的命令与结果。
- 未实现的设计草案也放在 `implementation/` 下，顶部标注「状态：设计草案，尚未实现」；实现后补全并去掉标注。
- 提交任何文档改动前执行 `python3 scripts/verify-docs.py`，它会检查内部链接、示例目录约定、末尾换行，以及各处版本号与 `package.json`、`plugin.xml` 是否一致。
