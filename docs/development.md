# 开发指南

环境、技术选型、代码规范与验证要求。改动前请先读 [CONTRIBUTING.md](../CONTRIBUTING.md) 和 [AGENTS.md](../AGENTS.md)。

## 环境

| 需要什么 | 版本 | 用途 |
| --- | --- | --- |
| Node.js | 22 或更高 | 构建、测试、VS Code 宿主 |
| npm | 随 Node 提供 | 依赖与脚本入口 |
| Python | 3.9 或更高 | 示例、JetBrains 构建脚本、文档校验 |
| VS Code | 1.105 或更高 | 宿主与冒烟测试 |
| Microsoft Python 扩展 | `ms-python.python` + `ms-python.debugpy` | Python 调试冒烟测试 |
| JetBrains IDE | WebStorm 2025.1 或 PyCharm 2026.1 | JetBrains 宿主构建 |
| JDK | 21 | JetBrains 宿主构建（可用 IDE 自带 JBR） |
| Google Chrome | 任意近期版本 | Webview 渲染验证 |
| Playwright | 能被子进程解析即可 | Webview 渲染验证 |

```bash
npm install
npm run check
```

## 技术选型与分层

```text
packages/core/   会话、索引、提示词、模型客户端、证据规则   —— 不导入任何 IDE
packages/ui/     共享对话与图示界面（HTML + CSS + 脚本）   —— 只依赖消息桥与主题变量
packages/engine/ JetBrains 的本地 stdio 适配进程           —— 不监听网络端口
src/             VS Code 宿主：文件、断点、调试、密钥、命令
plugins/jetbrains/ JetBrains 宿主：平台 API、调试、PasswordSafe、JCEF
test/            引擎、协议、检索、超时与渲染回归测试
scripts/         构建、打包、发版、冒烟与文档校验脚本
```

三条硬约束：

1. `packages/core` 里不得出现 `vscode` 导入或 JetBrains 平台 API。核心通过 `ports.ts` 接收项目索引、模型、存储与取消能力。
2. `packages/ui` 不直接调用宿主 API，只通过消息桥通信。
3. 宿主操作（读写文件、放置断点、启动调试、存取密钥）留在 `src/` 与 `plugins/jetbrains/`。

## 代码规范

- 缩进与换行由 [.editorconfig](../.editorconfig) 定义：TypeScript / JavaScript / JSON / XML / Java 用 2 空格，Python 用 4 空格，统一 LF 与末尾换行；Markdown 保留行尾空格。
- 交付中文文档与中文提交信息；代码标识符、注释里的 API 名保留英文。
- 类型检查是硬门槛：`npm run check` 覆盖四个 tsconfig，任何一项失败都不算完成。
- 不要为了通过检查而放宽类型；用具体的联合类型或显式的窄化代替 `any`。
- 新增用户可见文案要同时考虑中英文一致性；共享 UI 的文案变更要确认两端宿主都能渲染。

## 验证要求

**跑完整命令，贴真实输出。** 这是本仓库唯一的验收方式。

| 改动范围 | 命令 |
| --- | --- |
| 任何源码改动 | `npm run check` |
| 核心与引擎（`packages/core`、`packages/engine`） | `npm run test:engine` |
| 共享界面（`packages/ui`） | `npm run compile` 后 `node test/webview/index.cjs` |
| VS Code 宿主（`src/`） | `npm run smoke:vscode` |
| JetBrains 宿主（`plugins/jetbrains/`） | `npm run build:jetbrains`，按需 `npm run smoke:jetbrains` |
| 文档、README、版本号 | `python3 scripts/verify-docs.py` |
| 提交前 | `git diff --check` |

`scripts/verify-docs.py` 的 YAML 检查需要 pyyaml（`python3 -m pip install pyyaml`）。没装时会明确打印「跳过」并继续，其余四项照常执行，所以缺依赖不会被误读成通过。

### 负向验证回归测试

新加的断言必须证明它**能抓住旧行为**：

1. 把 `dist` 复制到 `/tmp` 作为备份。
2. 把编译产物改回修复前的实现。
3. 重跑同一条测试，确认它**失败**。
4. 恢复备份，确认重新通过。

只做第 4 步不算验证。改动编译产物时注意：多行输出用单行字符串 `replace` 会静默不匹配，替换后必须断言「确实变了」，例如比较替换前后的出现次数。

### 渲染验证

`packages/ui` 的样式或脚本改动必须做实际渲染验证，不要只读 CSS：

```bash
npm run compile
NODE_PATH=<能解析 playwright 的目录> node test/webview/index.cjs
```

默认使用本机 Chrome，可用 `CODE_CAT_BROWSER_EXECUTABLE` 指定其他位置。截图与探针输出在 `.vscode-test/ui/`。

需要测量光标、命中区域这类「肉眼看不准」的属性时，用 `elementFromPoint` + `getComputedStyle` 写探针，把改动前后的数值都记录下来，而不是从截图里猜。

## 构建与安装

### VS Code

```bash
npm run package     # 生成 code-cat-<version>.vsix
```

```bash
code --install-extension "/absolute/path/to/code-cat-X.Y.Z.vsix" --force
```

重新安装同名版本必须加 `--force`。装完执行 **Developer: Reload Window**；已经运行的扩展宿主不会热加载编译后的 Webview 代码。

### JetBrains

```bash
npm run build:jetbrains     # 产物在 plugins/jetbrains/build/
```

一次只构建一个目标，靠 `CODE_CAT_JETBRAINS_HOME` 指向 IDE 的 `Contents` 目录切换，分支号从该目录下的 `product-info.json` 推导。WebStorm 包额外声明 `<depends>NodeJS</depends>`，PyCharm 包不声明——PyCharm 免费版禁用了 NodeJS 调试器，因此 TS 断点场景只能在 WebStorm 验证，PyCharm 用 `examples/python-order-service` 验证 Python 链路。

安装位置：`~/Library/Application Support/JetBrains/<产品><版本>/plugins/code-cat`。重装前把旧目录移到 `plugins/` 之外备份，否则会被当成插件加载。

### 发版

版本号有两个唯一来源，构建脚本从这里读取并用于产物文件名，**不要再手改脚本里的版本串**：

| 版本线 | 唯一来源 |
| --- | --- |
| VS Code 扩展 | `package.json` 的 `version` |
| JetBrains 预览插件 | `plugins/jetbrains/src/main/resources/META-INF/plugin.xml` 的 `<version>` |

发版后同步更新 [CHANGELOG.md](../CHANGELOG.md)、[CONTEXT.md](../CONTEXT.md) 的「版本与发布状态」一节，以及两个 README 顶部的当前版本行，然后跑 `python3 scripts/verify-docs.py` 确认没有漂移。JetBrains 的 change notes 必须在上传前定稿——上传后只有兼容范围可改。流程见 [plugins/jetbrains/MARKETPLACE.md](../plugins/jetbrains/MARKETPLACE.md)。

### 标签与 Release

标签名跟 **VS Code 版本线**，带 `v` 前缀，用附注标签（`git tag -a`）。**先提交并推送 `main`，再打标签**，否则标签会落后于 `main`。

```bash
git tag -a v0.2.9 -m "Code Cat 0.2.9 …"
git push origin v0.2.9
gh release create v0.2.9 --verify-tag --title "Code Cat 0.2.9" --notes-file /tmp/notes.md --latest
gh release upload v0.2.9 code-cat-0.2.9.vsix <jetbrains zips>
```

约定：

- `--verify-tag` 保证标签已存在，不会让 gh 从默认分支凭空建一个。
- Release notes 用 `--notes-file` 传，避免 shell 转义；正文按 CHANGELOG 对应小节改写成用户可读版本，并加一节「安装」。
- Release 必须挂构建产物：VS Code 扩展未上架 Marketplace，JetBrains 的本地预览包也不在任何渠道，Release 附件是唯一的下载入口。
- 标签指向「该版本首次出现在 `package.json` 的提交」。`0.1.5` 与 `0.1.7`–`0.2.2` 从未单独提交，没有对应标签；不要为它们造标签。
- 不为历史版本补建 GitHub Release：`gh release create` 无法回填发布日期，十几个历史版本会全部显示成同一天，比只保留标签更误导。
- `CHANGELOG.md` 的版本标题统一不带链接——部分版本有标签、部分没有，只给有标签的加链接会不一致。

## 常见坑

| 坑 | 表现 | 处理 |
| --- | --- | --- |
| 只跑 `npm run compile` 就装 VSIX | 装的是旧代码 | 用 `npm run package` 重新打包，`--force` 覆盖安装 |
| 直接在 `dist/` 里验证修复 | 读到的是旧的编译产物 | 先 `npm run compile`，再验证 |
| 找共享 UI 的产物找错地方 | JetBrains 包里没有 `packages/ui/dist` | JetBrains 的 UI 被内联成 jar 内的 `codecat.html`，用 `unzip -p <jar> codecat.html` 核对 |
| 在 `dist/views/runtimeMapHtml.js` 里搜文案 | 搜不到 | 该文件是包装器，运行时才读 UI 产物；要核对就查 `packages/ui/dist/` |
| CSS 覆盖不生效 | 同为 `(0,0,1,1)` 优先级，被源码顺序决定 | 提高选择器特异性，例如 `.composer-inner button:disabled` |
| 给随主题变化的属性加过渡 | 断言同步读到过渡起始值 | 加过渡前确认没有同步读取该属性的断言 |
| 批量删除超过 50 个文件 | 构建脚本的 `rmtree` 被拦，整条命令中止 | 把目标目录 `mv` 改名（改名不计入删除），让脚本认为目录不存在 |
| 仓库被 IDE 打开时提交 | `.git/index.lock` 被反复重建 | 把 `rm -f .git/index.lock` 和 `git add/commit` 放进同一条命令 |

## 调试入口

- VS Code：在仓库里按 `F5`，扩展开发窗口会自动打开 `examples/python-order-service`。
- JetBrains：`npm run smoke:jetbrains` 在隔离目录 `.vscode-test/jetbrains/` 下启动宿主，不读取用户模型密钥。
- 引擎：`node examples/stage-04-shared-core/user_code/main.cjs` 直接用公开 API 跑一次会话。
