# Code Cat · JetBrains 预览版

> 免费预览版已提交 [JetBrains Marketplace 审核](https://plugins.jetbrains.com/plugin/34438-code-cat)，目前尚未公开；审核通过前请继续使用下文的本地安装方法。发布资料见 [MARKETPLACE.md](MARKETPLACE.md)，隐私与模型请求范围见 [PRIVACY.md](PRIVACY.md)。

一个共享核心，两种 IDE 宿主：JetBrains 负责文件跳转、断点、真实暂停和密码库；本地 Node 进程负责 AI 协议、会话和教学提示。两端使用相同的聊天界面。

## 安装与使用

1. 在仓库执行 `npm ci`、`npm run build:jetbrains`。默认使用 macOS `/Applications/WebStorm.app/Contents` 的 SDK；其他位置设置 `CODE_CAT_JETBRAINS_HOME`。需要该 IDE 自带的 JDK 21、Node.js 20+ 和 Python 3。
2. 在 WebStorm 的 Settings → Plugins → 齿轮 → Install Plugin from Disk 中选择 `build/code-cat-jetbrains-0.2.3-preview.zip`，重启 IDE。
3. 打开项目与 Code Cat 工具窗口。在“更多 → 配置模型”填写 Node 可执行文件路径、协议、Base URL、模型名与 API Key。密钥保存至 JetBrains PasswordSafe，不写进项目或会话历史。
4. 直接提问以理解项目；已有运行配置时，点击回答中的“进入调试”设置断点并启动所选配置。暂停后可继续提问、跳转源码、单步和继续运行。会话标题可打开历史或新建会话。

火山 Coding Plan：OpenAI Chat 使用 `https://ark.cn-beijing.volces.com/api/coding/v3`；Anthropic 使用 `https://ark.cn-beijing.volces.com/api/coding`。协议与地址必须配套，模型名按账户实际可用名称填写。

## 当前范围

- 已用 WebStorm 2025.1.3（251）SDK 编译，插件兼容范围暂限 251。
- JS/TS/Python 源码索引、流式 Markdown 回答、历史、源码跳转使用共享实现。
- 本轮真实验证 WebStorm 的 TS source map 断点。其他 JetBrains 产品与语言调试器未验证，不能理解为“全家桶均已支持”。
- 目前捕获顶层暂停位置和源码，尚不捕获变量与完整调用栈；回答上下文明确附带这一限制。
- 调试启动优先匹配目标文件的已有配置；不匹配时显示完整路径，可选择复制现有 Node 配置调试目标文件、选择已有配置或仅放置断点。复制沿用原解释器、加载器与参数，不覆盖原配置；库文件需要选择会调用它的入口。手工断点不会被插件删除；插件自己创建的断点可再次点击取消。
- 运行时暂不随插件分发，Node 不可用时需配置绝对路径。接口仅走子进程 stdin/stdout，不开启本地网络服务。
- 与 VS Code 的历史各自存于宿主本地，暂不跨 IDE 同步。重新打开历史不会恢复一个已经结束的真实调试现场。

## 验证

`npm run smoke:jetbrains` 在 `.vscode-test/jetbrains` 内建立独立配置、缓存、插件和 TS 项目。测试构建临时包含启动器，验证后重新生成不带测试入口的可安装包。详细设计和证据见 [stage-04](../../docs/implementation/stage-04.md)。

0.2.3 修正“断点在一个示例，却启动另一个示例”的问题；调试结束但未捕获暂停时会明确提示检查入口与 source map。
