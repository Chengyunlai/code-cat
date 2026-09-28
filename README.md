# Code Cat

**简体中文** | [English](./README.en.md)

[![License: MIT](https://img.shields.io/github/license/Chengyunlai/code-cat)](LICENSE)
[![VS Code](https://img.shields.io/badge/VS%20Code-%5E1.105-007ACC)](https://code.visualstudio.com/)
[![JetBrains Marketplace](https://img.shields.io/jetbrains/plugin/v/34438)](https://plugins.jetbrains.com/plugin/34438-code-cat)

Code Cat 是一个面向 Python、TypeScript 和 JavaScript 项目的 AI 代码阅读插件。围绕一个问题，它先定位代码，再让你在真实断点处观察，然后与 AI 持续追问：哪些是已观察到的事实、哪些是源码推断、下一步如何验证。

当前版本：VS Code 扩展 `0.2.9`，JetBrains 预览插件 `0.2.12-preview`。完整版本历史见 [CHANGELOG.md](CHANGELOG.md)。

## 目录

- [它是什么，不是什么](#它是什么不是什么)
- [快速开始](#快速开始)
- [核心能力](#核心能力)
- [安装](#安装)
- [模型服务与配置](#模型服务与配置)
- [API Key、隐私与模型用量](#api-key隐私与模型用量)
- [使用](#使用)
- [代码理解输出约束](#代码理解输出约束)
- [从源码构建与测试](#从源码构建与测试)
- [仓库结构](#仓库结构)
- [当前限制](#当前限制)
- [参与贡献](#参与贡献)
- [许可](#许可)
- [延伸阅读](#延伸阅读)

## 它是什么，不是什么

### 它是什么

- 一个**代码阅读**工具：把一个问题变成一条可以逐步展开的源码路径，而不是一次性倒出整条推测链路。
- 一个**调试驱动**的验证工具：只有真实断点命中之后，调用栈和变量才会作为运行证据出现。
- 一个**区分事实与推断**的助手：模型回答、阅读路径、调试证据三类信息分开呈现，互不冒充。

### 它不是什么

- **不是自动改代码的工具**。Code Cat 不替你写业务代码，也不会执行模型生成的表达式。
- **不是完整的 Python / TypeScript 解析器**。结构索引基于声明扫描，不是编译器级分析。
- **不是调试器的替代品**。它观察你已有的调试会话并放置临时教学断点，不接管、也不删除你自己的断点。
- **不是浏览器调试工具**。TSX / JSX 支持阅读，执行需要项目自己的 Node 构建配置。

### 项目状态

正在积极开发的早期原型，尚未发布到 VS Code Marketplace。

- **VS Code 端**：Python、TS / JS 代码阅读与 Python / Node 调试均已验证。
- **JetBrains 端**：免费预览版。WebStorm 2025.1 已验证 TypeScript 真断点与 JCEF 页面呈现；PyCharm 2026.1 已验证插件加载与 JCEF 宿主创建，Python 真断点尚未验证。变量与完整调用栈尚未接入。
- 稳定版本发布前，插件 API 和工作区数据结构仍可能调整。

## 快速开始

1. 安装 **VS Code 1.105 或更高版本**。
2. 按[从源码构建与测试](#从源码构建与测试)生成 `code-cat-*.vsix`，再按[安装](#安装)中的步骤装入。
3. 以**文件夹**方式打开一个 Python / TS / JS 项目。Python 项目请执行 **Python: Select Interpreter** 选择能运行该项目的环境。
4. 执行 **Code Cat: Configure Model Provider** 选择一个模型服务。默认选项是 VS Code 内置模型，不需要额外提供 Key。
5. 在 Code Cat 面板提问，例如「结账流程如何校验库存并完成扣款？」，读到核心代码位置后，点 **用断点跟一遍** 观察真实执行。

想先看运行效果，可以直接跑仓库里的示例：

```bash
python3 examples/stage-01-pause-conversation/user_code/main.py
node examples/stage-02-node-conversation/user_code/main.js
```

## 核心能力

### 从作用到现场的连续探索

本地 `0.2.12-preview` 先从问题涉及的功能**为何存在、负责什么、位于哪一步**建立背景，再沿最相关的源码路径深入。真实暂停卡片把源码线索与运行观察分开，并提供“先看作用”“再看机制”“验证下一步”三个可编辑追问入口；用户决定何时发送与单步。没有采集到的变量或调用栈不会被当成事实。可从 [Stage 05 结账示例](examples/stage-05-guided-depth/user_code/README.md)体验这条路径。Marketplace 公开的 `0.2.3-preview` 早于这些改动，也不包含后续的检索、路径累积与请求活性修复，且只兼容 2025.1 系列。

回答旁的**相关代码组织图**按目录展示这次问题已定位的文件，并在文件下方标出这个文件或模块**负责什么**（模型给出的职责判断；模型未给出时回退为阅读标题）。点击文件可打开源码，按需展开更多文件。图的连线只表示目录包含关系；执行路径和真实暂停在各自的视图中呈现。

阅读路径的每个节点分开讲两件事：**职责**说明这个文件或模块为什么存在，**关系**说明它和上一个节点怎么衔接（谁调用谁、数据从哪来、跨越了哪条边界）。这两项与「为什么停在这一行」的选行依据分开呈现，都属于源码推断，不会被写成运行事实。模型没有给出时对应行不显示。

阅读路径围绕**一个探索目标**累积。第一次提问给出目标与第一批站点；在同一目标下继续追问时，只有本次新增的站点会追加到路径尾部，已读过的位置和展开状态都保留，回答也接着已有链路说、不再重复一遍总览。路径卡会显示「路径共 N 站 · 本次新增 K 站」，新增的站点带「本次新增」标记。模型认为你换了一个功能时，界面只提示并给出「开始新的探索目标」入口，由你决定是否切换——不会静默丢掉已经读过的链路，也不会清掉已经采集到的运行证据。可从 [Stage 07 三问示例](examples/stage-07-exploration-continuity/user_code/README.md)直接看到这段行为。

提问用中文也可以。检索会先把中文意图转成候选的代码标识符（例如「权限是怎么检查的」→ `authorize`），再拿项目里的真实符号去验证；候选词找不到对应符号就不加分，不会凭空产生文件。问题里已经写了标识符时不会因此多花一次模型调用。暂停之后追问模块设计，回答能引用这次暂停之外的代码，现场证据仍然保留。

### 能力清单

- 为 Python 文件、类、函数和异步函数建立可复用的结构索引。
- 根据当前问题规划最多 8 个高价值代码位置，但默认只展示最相关的一处。
- 把同一目标下的多次提问累积成一条阅读路径，只追加新增站点并标出「本次新增」。
- 在回答下方给出「探索目标」「路径起点」、上下文说明和精确源码跳转。
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

### 三类信息严格分开

1. **模型回答**只回答当前问题。
2. **路径图**是代码阅读假设，需要逐步验证。
3. **调用栈和变量**只来自真实调试暂停，不由模型虚构。

## 安装

### VS Code

#### 环境要求

- VS Code 1.105 或更高版本。
- Python 项目：Python 3.9 或更高版本；Node 项目：项目要求的 Node.js 版本。
- VS Code 内置模型，或[下文支持的任一模型服务](#模型服务与配置) API Key。
- 只有从源码构建 Code Cat 时才需要 Node.js 22 或更高版本。

#### 1. 按项目准备运行环境

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

#### 2. 安装 Code Cat

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

#### 3. 选择解释器并配置模型

1. 以文件夹方式打开项目，而不是只打开单个文件。
2. Python 项目执行 **Python: Select Interpreter**，选择能够运行当前项目的环境。
3. 点击 Code Cat「更多」中的模型入口，或执行 **Code Cat: Configure Model Provider**。
4. 选择模型服务，确认模型名，并在需要时输入 API Key。
5. 保存后选择 **Test connection**，或执行 **Code Cat: Test Model Provider**。

默认选项是 **VS Code built-in model**，它使用 VS Code Language Model API，不需要向 Code Cat 单独提供 Key。可选服务见[模型服务与配置](#模型服务与配置)。

### JetBrains 预览版

JetBrains 免费预览版已在 [JetBrains Marketplace](https://plugins.jetbrains.com/plugin/34438-code-cat) 公开，线上版本 `0.2.3-preview` 只兼容 2025.1 系列。最新本地测试包为 `0.2.12-preview`，会自动查找 Node.js 运行时；按 [JetBrains 指南](plugins/jetbrains/README.md) 从本地安装可体验最新改动。发布与更新流程见 [MARKETPLACE.md](plugins/jetbrains/MARKETPLACE.md)，隐私说明见 [PRIVACY.md](plugins/jetbrains/PRIVACY.md)。

PyCharm 2026.1 有单独的本地安装包，已验证插件加载和 JCEF 宿主创建；Python 真断点尚未验证。JetBrains 的变量与完整调用栈仍待接入。

## 模型服务与配置

除默认的 VS Code 内置模型外，Code Cat 支持直接配置以下 API：

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

## 使用

### 会话与渐进式代码探索

第一次提问会成为会话标题。相关追问会保留在同一个会话中，直到用户执行 **Code Cat: New Conversation**。

点击 Code Cat 顶部的会话标题，可以：

- 新建会话，并清理 Code Cat 创建的临时断点。
- 打开历史会话，恢复消息、最近的阅读路径和已展开进度。
- 在当前工作区保留最多 20 个非空会话。

会话保存在 VS Code `workspaceState`，不会在 Python 项目中创建聊天记录文件。

当用户提出代码问题时，初始回答只处理当前问题，并展示**探索目标**和路径上的第一个位置（路径只有一站时标为**核心代码位置**，多站时标为**阅读路径起点**）：

- 显示文件、精确行号和节点标题。
- 解释为什么应该先看这里。
- 点击 **打开代码** 可以跳转到源码行。
- 从 **更多** 打开路径视图，查看已展开的阅读路径。
- 在路径视图点击 **继续下一处**，每次只增加一个代码位置。
- 直接在输入框追问，进一步明确关心的分支、函数或异常场景；同一目标下的追问会把新站点追加到同一条路径上。

路径图是阅读假设，不等于运行时调用栈。只有真实断点命中后，调用栈和变量才成为可引用的运行证据。

### 第一次教学调试

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

### 源码行教学控制

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

### 界面颜色与交互

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

## 代码理解输出约束

Code Cat 把可读性作为产品约束，而不是完全依赖模型自由发挥：

- 规划路径只允许引用已经校验的项目文件，并限制为 1–8 个节点。
- 初始回答只解决当前问题，不枚举完整路径。
- 暂停追问结合快照与暂停时源码，要求区分观察事实、源码推断、未知和下一次验证；简单追问直接回答。
- 格式错误的模型输出不会作为原始文本直接渲染。
- 调试变量在采集时统一去重、折叠换行、限制长度并遮盖敏感字段。
- 调用栈遵循“顶层源码位置 → 结构化解释 → 真实栈帧 → 下一步调试操作”的阅读顺序。
- 对话 Markdown 只渲染安全的 DOM 子集，模型文本不会作为可执行 HTML 插入。

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

| 命令 | 作用 |
| --- | --- |
| `npm run check` | 四个 tsconfig 的类型检查 |
| `npm run test:engine` | 引擎与协议测试，含流式、检索、超时与取消 |
| `node test/webview/index.cjs` | 实际 Webview 渲染与交互验证（需 Playwright 与 Chrome） |
| `npm run smoke:vscode` | 真实 VS Code Extension Host 冒烟测试 |
| `npm run build:jetbrains` | 构建 JetBrains 本地安装包 |
| `npm run smoke:jetbrains` | 隔离 JetBrains 宿主验证 |
| `npm run publish:jetbrains` | 上传 JetBrains Marketplace（需 `PUBLISH_TOKEN`） |

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

可选 UI 验证：在 Node 能解析 `playwright` 的环境中先执行 `npm run compile`，再执行 `node test/webview/index.cjs`。默认使用本机 Chrome；其他位置通过 `CODE_CAT_BROWSER_EXECUTABLE` 指定。测试输出放在 `.vscode-test/ui/`。

完整开发约定、调试入口与提交规范见 [CONTRIBUTING.md](CONTRIBUTING.md) 和 [docs/development.md](docs/development.md)。

## 仓库结构

当前仓库包含 VS Code 宿主与 JetBrains 预览宿主，共享会话、索引、AI 提示词和界面：

```text
packages/core/             IDE 中立的会话、索引、提示词与证据规则
packages/ui/               共享对话与图示界面
packages/engine/           JetBrains 的本地进程协议
src/                       VS Code 宿主
plugins/jetbrains/         JetBrains 宿主与本地安装包
docs/                      架构、研究与分阶段实现记录
examples/                  唯一示例根目录，按阶段划分
test/                      引擎、协议、渲染与超时回归测试
scripts/                   构建、打包、发版与冒烟脚本
```

JetBrains 的安装包按已验证的 IDE build 分开构建。PyCharm 当前验证到插件加载，Python 调试链路仍需实测。

## 当前限制

- 结构索引基于 Python 声明扫描，不是完整 Python 解析器。
- 路径规划目前只执行一次模型请求，后续可以增加符号和调用层级检索。
- 变量采集只覆盖顶层栈帧，并受设置中的数量和长度限制。
- 暂无独立单元测试运行器、遥测和多根工作区路径消歧；CI 目前只校验文档链接。
- 会话历史只保存在本地工作区，不进行云同步。
- 界面以对话和暂停证据为主，路径视图用于辅助阅读。
- 变量名脱敏并不保证清除所有敏感内容；发送问题时，相关源码、选定快照与近期对话会交给所选模型服务。
- JetBrains 端尚未接入变量与完整调用栈，其他 JetBrains 产品尚未逐一验证。

阅读路径是待验证的假设。真实暂停提供运行证据；AI 的解释仍需要结合源码与下一步执行验证。

## 参与贡献

欢迎提 Pull Request。开始前请先读 [CONTRIBUTING.md](CONTRIBUTING.md)：它写明了提交规范、验证要求和「一个 PR 只做一件事」的约定。

- 本仓库**不使用 GitHub Issue 跟踪任务与排期**，设计与实现记录统一放在 [`docs/implementation/`](docs/implementation/)，示例放在 [`examples/`](examples/README.md)。
- 任何改动都必须跑完对应的验证命令，并在 PR 描述里贴真实输出。
- 问题反馈请优先提 Pull Request；只能描述问题时也可以开 Issue，其他沟通渠道见 [@Chengyunlai](https://github.com/Chengyunlai)。

## 许可

[MIT](LICENSE) © 2026 Code Cat contributors

## 延伸阅读

- [文档导航](docs/README.md) — 按「你想了解什么」组织的入口
- [项目上下文](CONTEXT.md) — 术语表与各阶段的关键事实
- [工作规则](AGENTS.md) — 给人和 AI 协作者的稳定约定
- [开发规范](docs/development.md) — 环境、分层、验证要求
- [路线图](docs/roadmap.md) — 分阶段的待验证假设
- [更新日志](CHANGELOG.md) — 版本历史
- [示例总索引](examples/README.md) — 每个阶段的可运行示例
- [MVP 架构](docs/architecture/mvp.md)、[可复用构件研究](docs/research/reusable-building-blocks.md)
- [JetBrains 安装指南](plugins/jetbrains/README.md)、[发布流程](plugins/jetbrains/MARKETPLACE.md)、[隐私说明](plugins/jetbrains/PRIVACY.md)
