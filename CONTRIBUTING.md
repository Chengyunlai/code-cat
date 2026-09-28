# 参与贡献

感谢你愿意花时间改进 Code Cat。这份文档说明**怎么提改动**、**改动要满足什么**，以及**验证怎么贴**。

开始之前请先读：

1. [AGENTS.md](AGENTS.md) —— 跨阶段稳定的工作规则。
2. [CONTEXT.md](CONTEXT.md) —— 术语表与各阶段的关键事实。
3. [docs/development.md](docs/development.md) —— 环境、分层、验证要求。

## 反馈问题

**本仓库不使用 GitHub Issue 跟踪任务与排期。** 设计与实现记录统一走 `docs/implementation/stage-NN-<slug>.md`，示例走 `examples/stage-NN-<slug>/`。因此：

- 发现 bug 或想提功能：优先直接提 Pull Request，在描述里写清**复现步骤**和**期望行为**。
- 只能描述问题、还提不出 PR：可以开一个 Issue，但请不要期待它有排期——需要推动的改动最终都要落到 PR 上。
- 其他沟通渠道见 [@Chengyunlai](https://github.com/Chengyunlai)。

## 一个 PR 只做一件事

- 一个 PR 只解决一个主题。功能、修复、文档、发版各自独立，不要把三件事混在一个 PR 里。
- 提交按主题拆分，沿用 Conventional Commits 前缀：`feat` / `fix` / `refactor` / `docs` / `test` / `chore` / `build`。
- 提交信息用中文描述，代码标识符保留英文。
- 写提交信息前先用 `git show --stat <sha>` 核对改动落在哪些文件，避免把别的提交的内容写进来。

## 改动必须配套记录

Code Cat 用文档而不是 Issue 记录设计意图。因此：

- 新的功能阶段 → 新增 `docs/implementation/stage-NN-<slug>.md`，并在 [examples/README.md](examples/README.md) 登记对应的 `examples/stage-NN-<slug>/`（含 `user_code/` 与 `core/`）。
- 未实现的设计草案也放在同一位置，顶部标注「状态：设计草案，尚未实现」。
- 修改公开入口、状态模型或目录结构 → 同步 README、CONTEXT、示例索引与阶段记录。
- 断点用稳定符号定位，不照抄旧行号。

## 验证要求

**任何改动都必须跑完整命令并贴真实输出。** 不接受「应该没问题」这类结论。

| 改动范围 | 必须执行 |
| --- | --- |
| 任何源码改动 | `npm run check` |
| `packages/core`、`packages/engine` | `npm run test:engine` |
| `packages/ui` 的样式或脚本 | `npm run compile` 后 `node test/webview/index.cjs` |
| VS Code 宿主 `src/` | `npm run smoke:vscode` |
| JetBrains 宿主 `plugins/jetbrains/` | `npm run build:jetbrains`，按需 `npm run smoke:jetbrains` |
| 任何文档、README、版本号 | `python3 scripts/verify-docs.py` |
| 提交前 | `git diff --check` |

补充要求：

- **回归测试要做负向验证。** 新加的断言要证明它能抓住旧行为：把实现退回修复前，确认测试失败，再恢复。没有负向验证的断言不视为有效。
- **UI 改动要做实际渲染验证**，不要只靠肉眼读 CSS。渲染断言与探针输出放在 `.vscode-test/ui/`。
- **记录真实基线。** 写清基线提交 SHA 与工作树状态；不要要求文档包含自身所在提交的 SHA。
- 调试证据必须来自真实暂停。区分当前暂停、历史观察、源码推断和不可用证据；不要执行模型生成的表达式。

## 代码分层约束

- `packages/core` **不得导入任何 IDE**（不得出现 `vscode` 或 JetBrains 平台 API）。
- `packages/ui` 只负责共享呈现，通过消息桥与主题变量与宿主通信。
- 宿主操作（文件、断点、调试、密钥）留在 `src/` 与 `plugins/jetbrains/`。
- `packages/engine` 是 JetBrains 的本地 stdio 适配，不监听网络端口。

## 外部写操作

提交、推送、创建 Release、上传 Marketplace 都需要**用户明确授权**。未获授权时只记录基线与工作树状态，不要自行推送或发布。

## 许可

贡献的代码按仓库的 [MIT 许可](LICENSE) 授权。
