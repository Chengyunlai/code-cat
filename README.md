# Code Cat

**简体中文** | [English](./README.en.md)

Code Cat 是一个面向 Python、TypeScript 和 JavaScript 项目的 AI 代码阅读插件，提供 VS Code 端和 JetBrains 预览端。围绕一个问题，你可以定位代码、在真实断点处观察，再与 AI 持续追问：哪些是已观察到的事实、哪些是源码推断，以及下一步如何验证。

> **项目状态：** 正在积极开发的早期原型。目前支持 VS Code 中的 Python、TS / JS 代码阅读与 Python / Node 调试；稳定版本发布前，插件 API 和工作区数据结构仍可能调整。

## 0.2.0：共享核心与 JetBrains 预览版

JetBrains 免费预览版已提交 [JetBrains Marketplace 审核](https://plugins.jetbrains.com/plugin/34438-code-cat)，目前尚未公开。审核通过前可按 [JetBrains 指南](plugins/jetbrains/README.md) 从本地安装；是否可直接安装请以 Marketplace 页面为准。

两端复用同一个会话核心和聊天界面。WebStorm 2025.1 已验证 TS 真断点、源码观察及实际 JCEF 页面呈现；JetBrains 的变量与完整调用栈仍待接入。安装见 [JetBrains 指南](plugins/jetbrains/README.md)。

## 0.1.9：历史回答保留断点入口

定位代码的回答会分别保存阅读路径。回到历史回答可打开源码，或再次“用断点跟一遍”；调试运行中则显示“在这里打断点”，只补充断点，不替换当前路径。源码位置失效时会提示重新定位。旧版历史可恢复最后保存的路径，更早未保存的位置需要重新提问定位。

## 0.1.8：边生成边理解

回答会随着模型返回实时显示，支持 VS Code 内置模型，以及 OpenAI Responses / Chat Completions、Anthropic、Gemini 的流式协议。生成期间可以编辑草稿或停止；断流会提示重试，未完成内容不会作为正式答案保存。

复杂问题按概念分节解释，并结合有长度限制的真实源码摘录。代码块提供基础高亮、语言标识和复制；点击回答中的源码引用可跳转到已验证的工作区文件。解释应区分源码、示意代码和运行证据，最后给出可验证的下一步，而不是堆砌符号名称。具体排版与内容质量仍取决于模型响应。

参见[流式代码阅读示例](examples/stage-03-streamed-reading/user_code/README.md)。

## 0.1.7：支持 TS / JS

可直接在 TS / JS 仓库提问，不再要求包含 Python 文件。支持 `.ts`、`.tsx`、`.mts`、`.cts`、`.js`、`.jsx`、`.mjs`、`.cjs` 的索引、源码跳转与阅读提示。

Node 调试优先使用项目已有的 `launch.json`（`node` / `pwa-node`）。没有配置时，打开 JS 入口可直接调试；普通 TS 文件可使用项目已安装的 `tsx`。其他 TS 项目请配置编译后的入口、`outFiles` 和 `sourceMaps`。TSX / JSX 支持阅读，执行需要项目的 Node 构建配置；浏览器调试暂不支持。

命中断点后，仍在同一对话中查看观察、连续追问和单步验证。详见 [TS / JS 可运行示例](examples/stage-02-node-conversation/user_code/README.md)。

## 0.1.6：从问题到验证

主界面围绕一条对话展开：**提出问题 → 在代码处暂停 → 看懂观察 → 继续追问 → 单步验证**。默认只保留输入框、单步验证和“更多”，路径、调用栈、变量和模型设置按需展开。

例如：“为什么没有扣款？”→ 查看库存判断处的观察 → 追问“哪些值证明库存不足？”→ 单步验证判断结果。可以从[可运行的库存示例](examples/stage-01-pause-conversation/user_code/README.md)开始。

## Code Cat 能做什么

- 为 Python 文件、类、函数和异步函数建立可复用的结构索引。
- 根据当前问题规划最多 8 个高价值代码位置，但默认只展示最相关的一处。
- 在回答下方给出“核心代码位置”、上下文说明和精确源码跳转。
- 让用户逐步展开路径，而不是一次性展示整条推测链路。
- 可选地在核心位置放置 Code Cat 临时断点并启动 `debugpy`。
- 从真实暂停状态采集调用栈和经过约束的顶层变量。
- 基于运行时证据解释“发生了什么、为什么重要、下一步看哪里”。
- 在同一对话中保留每次暂停与解释，普通追问自动带上选定现场、暂停时源码与近期对话。
- 在回答期间继续编辑草稿或停止回答；取消、失败和迟到回复不会替换当前观察。
- 在文件、路径节点、历史暂停、栈帧和源码之间联动导航。
- 在当前工作区保存最近的代码阅读会话，不向项目目录写入聊天文件。
- 追踪单次请求、当前会话和当前项目的模型 Token 用量。
- 在展示或发送变量前遮盖常见的密钥、令牌和密码字段。

Code Cat 把三类信息严格分开：

1. **模型回答**只回答当前问题。
2. **路径图**是代码阅读假设，需要逐步验证。
3. **调用栈和变量**只来自真实调试暂停，不由模型虚构。

## 在 VS Code 中安装

### 环境要求

- VS Code 1.105 或更高版本。
- Python 项目：Python 3.9 或更高版本；Node 项目：项目要求的 Node.js 版本。
- VS Code 内置模型，或下文支持的任一模型服务 API Key。
- 只有从源码构建 Code Cat 时才需要 Node.js 22 或更高版本。

### 1. 按项目准备运行环境

TS / JS 项目使用 VS Code 内置语言服务与 Node 调试器，不需要 Python 扩展。运行 Node 项目需安装项目要求的 Node.js 版本。

只有调试 Python 项目时，才需要在 VS Code 扩展市场安装：

- **Python** — `ms-python.python`，必需
- **Python Debugger** — `ms-python.debugpy`，必需
- **Pylance** — `ms-python.vscode-pylance`，推荐
- **Python Environments** — `ms-python.vscode-python-envs`，推荐

也可以通过终端安装：

```bash
code --install-extension ms-python.python
code --install-extension ms-python.debugpy
code --install-extension ms-python.vscode-pylance
code --install-extension ms-python.vscode-python-envs
```

macOS 中如果找不到 `code` 命令，请在 VS Code 命令面板执行 **Shell Command: Install 'code' command in PATH**。

也可以直接使用 VS Code 自带的命令：

```bash
"/Applications/Visual Studio Code.app/Contents/Resources/app/bin/code" \
  --install-extension ms-python.python
```

### 2. 安装 Code Cat

Code Cat 暂未发布到 VS Code Marketplace。请按照[从源码构建与测试](#从源码构建与测试)生成 `code-cat-*.vsix`，然后：

1. 打开 VS Code 扩展视图。
2. 点击扩展视图右上角的 `...`。
3. 选择 **Install from VSIX...**。
4. 选择生成的 VSIX 文件。

也可以通过终端安装：

```bash
code --install-extension "/absolute/path/to/code-cat-X.Y.Z.vsix" --force
```

请将示例路径和 `X.Y.Z` 替换为 `npm run package` 输出的实际文件与版本。

安装后在命令面板执行 **Developer: Reload Window**，让 Code Cat 的活动栏入口和命令生效。

### 3. 选择 Python 并配置模型

1. 以文件夹方式打开项目，而不是只打开单个文件。
2. Python 项目执行 **Python: Select Interpreter**，选择能够运行当前项目的环境。
3. 点击 Code Cat「更多」中的模型入口，或执行 **Code Cat: Configure Model Provider**。
4. 选择模型服务，确认模型名，并在需要时输入 API Key。
5. 保存后选择 **Test connection**，或执行 **Code Cat: Test Model Provider**。

默认选项是 **VS Code built-in model**，它使用 VS Code Language Model API，不需要向 Code Cat 单独提供 Key。

直接 API 配置支持：

| 服务预设 | 协议 | 需要补充的信息 |
| --- | --- | --- |
| OpenAI | Responses API | API Key、可编辑模型名 |
| Anthropic Claude | Messages API | API Key、可编辑模型名 |
| Google Gemini | `generateContent` | API Key、可编辑模型名 |
| DeepSeek | OpenAI 兼容 Chat Completions | API Key、可编辑模型名 |
| 阿里云 Qwen | DashScope OpenAI 兼容接口 | API Key、可编辑模型名 |
| Moonshot / Kimi | OpenAI 兼容接口 | API Key、可编辑模型名 |
| 智谱 GLM | OpenAI 兼容接口 | API Key、可编辑模型名 |
| 豆包 / 火山方舟 | OpenAI 兼容接口 | API Key、推理接入点 ID |
| NewAPI | OpenAI 兼容接口 | API Key、Base URL、渠道模型名 |
| 其他兼容服务 | OpenAI 兼容接口 | API Key、Base URL、模型名 |

NewAPI 的 Base URL 应填写 API 根地址，例如 `https://newapi.example.com/v1`，不要填写完整的 `/chat/completions` 地址。

模型名必须是 NewAPI 实际暴露的模型或别名。除本地开发的 `localhost` 外，Code Cat 要求使用 HTTPS。

## API Key、隐私与模型用量

API Key 保存在 VS Code `SecretStorage` 中，不会写入代码仓库、工作区设置、用户 `settings.json`、日志或模型提示词。

对于 NewAPI 和其他兼容服务，每个 Key 都绑定到规范化后的 API 根地址。更换 Base URL 后，Code Cat 不会复用旧地址的 Key，也不会携带授权头跟随 HTTP 重定向。

非敏感的服务类型、模型名和 Base URL 会显示在 VS Code 的 `Code Cat › AI` 设置中。执行 **Code Cat: Clear Stored API Key** 可以删除当前服务和地址对应的 Key。

首次模型请求后，Code Cat 会在 VS Code 状态栏显示简洁的用量入口。点击它或执行 **Code Cat: Show Model Usage**，可以查看：

- **单次请求**：输入、输出、缓存读取和总 Token。
- **当前会话**：区分服务端上报值和本地估算值。
- **当前项目**：跨会话累计，但只保存在本地 `workspaceState`。

新建会话会清除当前会话和单次请求统计，不会清除项目累计值。执行 **Code Cat: Reset Project Token Usage** 可以只重置项目统计。

OpenAI、OpenAI 兼容服务、NewAPI、Anthropic 和 Gemini 的用量字段会被统一展示。服务未返回用量时，Code Cat 会明确标记为估算值；它用于比较上下文大小，不代表账单金额。

对于同一个项目，Code Cat 会在 Python 文件没有变化时复用内存索引，并把稳定指令和稳定符号前缀放在提示词前部，以利用服务商的自动前缀缓存。

## 会话与渐进式代码探索

第一次提问会成为会话标题。相关追问会保留在同一个会话中，直到用户执行 **Code Cat: New Conversation**。

点击 Code Cat 顶部的会话标题，可以：

- 新建会话，并清理 Code Cat 创建的临时断点。
- 打开历史会话，恢复消息、最近的阅读路径和已展开进度。
- 在当前工作区保留最多 20 个非空会话。

会话保存在 VS Code `workspaceState`，不会在 Python 项目中创建聊天记录文件。

当用户提出代码问题时，初始回答只处理当前问题，并展示一个**核心代码位置**：

- 显示文件、精确行号和节点标题。
- 解释为什么应该先看这里。
- 点击 **打开代码** 可以跳转到源码行。
- 从 **更多** 打开路径视图，查看已展开的阅读路径。
- 在路径视图点击 **继续下一处**，每次只增加一个代码位置。
- 直接在输入框追问，进一步明确关心的分支、函数或异常场景。

路径图是阅读假设，不等于运行时调用栈。只有真实断点命中后，调用栈和变量才成为可引用的运行证据。

## 第一次教学调试

1. 打开 VS Code 活动栏中的 Code Cat。
2. 输入普通对话，或提出代码问题，例如“结账流程如何校验库存并完成扣款？”。
3. 按 **Enter** 发送，按 **Shift+Enter** 换行。
4. 阅读回答及其**核心代码位置**，必要时点击 **打开代码**。
5. 如果想观察执行过程，点击 **用断点跟一遍**。

Code Cat 会在核心位置放置临时教学断点，并按以下顺序选择运行入口：

1. `.vscode/launch.json` 中已有的 Python/debugpy 配置。
2. `pyproject.toml` 中 `[project.scripts]` 声明的控制台入口。
3. 当前打开的 Python 文件。

存在多个启动配置或项目脚本时，Code Cat 会让用户选择。调试启动后，路径图会标记执行位置；断点命中后，调用栈和变量会同步更新。

VS Code 启动调试时可能自动切换到 Run and Debug 视图。暂停后返回 Code Cat，对话中会出现一条“观察”，显示暂停处源码。点击“解释一下”或直接继续提问；无需切换页签。

- **单步验证**：执行当前行并在下一处暂停（Step Over）。
- **进入函数**：单步进入当前调用（Step Into）。
- **继续运行**：运行至下一断点或结束。
- **解释现场**：在对话里解释当前选定观察。

输入区上方只保留“单步验证”和“更多”。进入函数、继续运行、历史观察、路径与模型设置统一放进“更多”；“提问依据”在其中切换历史观察。历史观察只能阅读和追问，不能单步操作。完整调用栈、变量和源码在“查看依据”展开。已回答的观察不再显示重复的解释与追问按钮。

AI 回答时输入框仍可编辑，点击“停止回答”可取消请求。失败时在空输入框恢复原问题，不覆盖你新写的草稿。暂停处的高亮行通常尚未执行，解释应区分事实、推断与未知。

运行快照保留在当前扩展进程内，聊天与观察标识保存到工作区历史；重开会话时会明确标注原始快照已释放。

如果程序退出但没有命中教学断点，Code Cat 会说明没有采集到运行时证据，并提供**重新运行**入口。

如果调试会话在 Code Cat 开始观察前已经启动，请停止它并从 Code Cat 重新启动，以便采集完整的运行链路。

对于使用 `[project.scripts]` 的已安装 Python 应用，Code Cat 会通过扩展内置的小型启动器调用真实入口函数，并显式使用当前工作区选择的 Python 解释器。

如果程序需要命令行参数、特殊环境变量或框架启动器，请在 `.vscode/launch.json` 中增加配置；已有配置始终优先于自动发现。

## 源码行教学控制

阅读路径建立后，对应的 Python / TS / JS 源码行会显示克制的 `Code Cat · 步骤/标题` 注解。

将鼠标悬停在注解或源码行上，可以查看附近代码、路径上下文和停在这里的原因。暂停后的 AI 解释与连续追问保留在主对话中。

精确源码行上方的 CodeLens 会按阶段提供：

- 暂停前：查看上下文、在这里暂停或移除教学断点。
- 真实暂停时：解释当前位置、继续、单步进入和单步跳过。
- 已有用户断点时：显示为保留状态，Code Cat 不会删除或接管它。

如果 CodeLens 未显示，请在设置中启用 **Editor: Code Lens**，即 `"editor.codeLens": true`。

Code Cat 教学断点是临时的，会在以下情况自动移除：

- 教学调试结束。
- 新路径替换旧路径。
- 非调试状态下关闭 Code Cat 视图。
- 执行 **Code Cat: New Conversation**。
- 扩展被停用。

只有 Code Cat 创建的断点会被移除。用户手动创建的断点会被保留，同一会话中的普通追问也不会清除教学路径。

## 从源码构建与测试

```bash
npm install
npm run check
npm run package
```

`npm run package` 会在仓库根目录生成带版本号的 `code-cat-*.vsix`。

在 VS Code 中打开本仓库并按 `F5`，扩展开发窗口会自动打开 `examples/python-order-service` 示例工作区。

源码修改不会自动更新已经安装的 VSIX。需要在普通 VS Code 窗口验证修改时：

1. 执行 `npm run package`。
2. 使用 **Install from VSIX...** 重新安装生成的文件，或执行：

   ```bash
   code --install-extension "/absolute/path/to/code-cat-X.Y.Z.vsix" --force
   ```

3. 执行 **Developer: Reload Window**。

真实 VS Code 冒烟测试需要本机安装 VS Code 和 Microsoft Python 扩展：

```bash
npm run smoke:vscode
```

默认测试脚本使用 macOS Stable 版 VS Code，并从 `~/.vscode/extensions` 查找 Python 依赖。自定义安装路径时可以设置：

```bash
CODE_CAT_VSCODE_EXECUTABLE="/absolute/path/to/vscode-executable" \
CODE_CAT_VSCODE_EXTENSIONS_SOURCE_DIR="/absolute/path/to/installed/vscode/extensions" \
npm run smoke:vscode
```

Windows PowerShell：

```powershell
$env:CODE_CAT_VSCODE_EXECUTABLE = "C:\absolute\path\to\Code.exe"
$env:CODE_CAT_VSCODE_EXTENSIONS_SOURCE_DIR = "$env:USERPROFILE\.vscode\extensions"
npm run smoke:vscode
```

测试覆盖扩展激活、模型服务适配、Token 用量、断点创建与恢复、debugpy 启动、真实暂停、调用栈与变量采集、路径图渲染、调试控制和 `[project.scripts]` 入口。

## 代码理解输出约束

Code Cat 把可读性作为产品约束，而不是完全依赖模型自由发挥：

- 规划路径只允许引用已经校验的项目文件，并限制为 1–8 个节点。
- 初始回答只解决当前问题，不枚举完整路径。
- 暂停追问结合快照与暂停时源码，要求区分观察事实、源码推断、未知和下一次验证；简单追问直接回答。
- 格式错误的模型输出不会作为原始文本直接渲染。
- 调试变量在采集时统一去重、折叠换行、限制长度并遮盖敏感字段。
- 调用栈遵循“顶层源码位置 → 结构化解释 → 真实栈帧 → 下一步调试操作”的阅读顺序。
- 对话 Markdown 只渲染安全的 DOM 子集，模型文本不会作为可执行 HTML 插入。

## 可选的设计审查工作流

Runtime Map 的交互遵循 Emil Kowalski 的设计工程原则：高频操作应立即响应，指针反馈控制在 160 毫秒以内，过渡动画明确声明属性，并尊重 reduced-motion 设置。

希望使用同一设计审查 Skill 的贡献者可以执行：

```bash
npx skills@latest add emilkowalski/skills
```

该 Skill 仅用于贡献者的开发流程，不是 Code Cat 的运行时依赖。安装后请重新启动编码代理或开启新任务。

## IDE 支持与仓库结构

当前原型只支持 **VS Code**。未来的 PyCharm 支持应优先保留在同一个仓库中，共享项目索引、路径与会话领域模型、AI 提示词、脱敏规则和 IDE 中立协议。

未来可以逐步演进为：

```text
packages/core/             共享 Python 索引、路径、会话和 Tutor 协议
packages/vscode-extension/ 当前 VS Code/debugpy 适配器和 Webview UI
packages/jetbrains-plugin/ 未来 PyCharm 调试器适配器和 JetBrains UI
```

在 VS Code 垂直链路稳定前，不应提前创建 PyCharm 包。JetBrains 插件使用不同的 SDK、构建系统、调试接口和 UI 工具，过早共享实现会增加耦合。

## 架构资料

- `docs/architecture/mvp.md`
- `docs/research/reusable-building-blocks.md`

## 界面颜色与交互

界面保留简化后的入口，使用语义色帮助区分信息：蓝色表示链接与主要操作，绿色表示已观察信息，紫色表示源码推断，琥珀色表示待验证信息。文字标签仍然保留，不需要只凭颜色判断。

暂停位置的文件名可以直接点击打开源码；展开依据后的调用位置同样可以点击。代码片段提供基础词法高亮，按钮具有悬停、按下、焦点和禁用反馈。

颜色默认适配 VS Code 的浅色、深色和高对比主题。可通过 VS Code 的 `workbench.colorCustomizations` 按主题覆盖以下颜色，不需要新增界面菜单：

| 颜色标识 | 用途 |
| --- | --- |
| `codeCat.accent` | 可点击内容、主要操作 |
| `codeCat.accentHover` | 主要操作悬停 |
| `codeCat.onAccent` | 主要操作上的文字 |
| `codeCat.observed` | 已观察标签、当前暂停、字符串 |
| `codeCat.inference` | 源码推断标签、代码关键字 |
| `codeCat.uncertainty` | 待验证标签、数字 |

## 给人和 AI 的导航

读取顺序：[工作规则](AGENTS.md) → [项目上下文](CONTEXT.md) → [Example 总索引](examples/README.md) → [暂停对话实现记录](docs/implementation/stage-01.md)。

唯一示例根目录是 `examples/`。本轮从 [stage-01 的 user_code](examples/stage-01-pause-conversation/user_code/README.md) 开始，运行库存示例，再按需阅读 `core/`。修改公开入口或代码路径时同步这些导航。

可选 UI 验证：在 Node 能解析 `playwright` 的环境中先执行 `npm run compile`，再执行 `node test/webview/index.cjs`。默认使用本机 Chrome；其他位置通过 `CODE_CAT_BROWSER_EXECUTABLE` 指定。测试输出放在 `.vscode-test/ui/`。

## 当前限制

- 结构索引基于 Python 声明扫描，不是完整 Python 解析器。
- 路径规划目前只执行一次模型请求，后续可以增加符号和调用层级检索。
- 变量采集只覆盖顶层栈帧，并受设置中的数量和长度限制。
- 暂无独立单元测试运行器、CI、Marketplace 发布元数据、遥测和多根工作区路径消歧。
- 会话历史只保存在本地工作区，不进行云同步。
- 界面以对话和暂停证据为主，路径视图用于辅助阅读。
- 变量名脱敏并不保证清除所有敏感内容；发送问题时，相关源码、选定快照与近期对话会交给所选模型服务。

阅读路径是待验证的假设。真实暂停提供运行证据；AI 的解释仍需要结合源码与下一步执行验证。

## 跨 IDE 架构（0.2.0）

Code Cat 已拆出 `packages/core`（会话、教学、模型与证据规则）、`packages/ui`（共享聊天界面）、`packages/engine`（JetBrains 的本地进程）。现有 `src` 继续作为 VS Code 宿主，`plugins/jetbrains` 提供 WebStorm 2025.1 预览版。

JetBrains 安装、配置与限制见 [安装说明](plugins/jetbrains/README.md)。当前验证 TS 真断点及共享核心；变量与完整调用栈尚未接入 JetBrains，其他产品尚未逐一验证。VS Code 的现有调试能力保持不变。

开发入口：`npm run test:engine`、`npm run build:jetbrains`、`npm run smoke:jetbrains`。架构与证据见 [Stage 04](docs/implementation/stage-04.md)，可运行示例见 [共享核心示例](examples/stage-04-shared-core/README.md)。

0.2.1 优化 JetBrains 深色阅读：源码链接不再出现白色按钮块，减少重复标题和底部提示，输入区更紧凑。

0.2.2 修正本地实现检索：优先扫描主源码目录，按精确符号声明选择源码，并提供当前仓库与 workspace 包身份。超出扫描范围时明确标记部分索引，避免把“没提供实现上下文”误说成“仓库没有实现”。包含 0.2.1 的界面修订。

0.2.3 修正 JetBrains 的调试入口匹配：不会再无提示地运行另一个示例。入口不匹配时可选择目标文件、已有运行配置或仅放置断点；程序结束却未捕获暂停时明确提示检查入口与 source map。
