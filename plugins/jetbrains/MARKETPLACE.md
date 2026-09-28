# Marketplace 发布与更新流程 · Code Cat JetBrains

## 当前状态（2026-09-28 核对）

| 项 | 值 |
| --- | --- |
| pluginId | `34438` |
| pluginXmlId | `dev.codecat` |
| 插件页 | https://plugins.jetbrains.com/plugin/34438-code-cat |
| vendor | `Chengyunlai`（organization 20817，non-trader） |
| 定价 | FREE |
| 线上版本 | `0.2.3-preview`，Stable 通道 |
| 兼容范围 | `since-build 251.0` — `until-build 251.*` |
| 版本号规则 | 该插件启用了 semver 校验（`semverOnly: true`） |

核对方式（都不需要登录）：

```bash
curl -s https://plugins.jetbrains.com/api/plugins/34438
curl -s "https://plugins.jetbrains.com/api/plugins/34438/updates?size=10"
curl -s "https://plugins.jetbrains.com/api/searchPlugins?search=Code%20Cat&max=5"
curl -s -o /dev/null -w "%{http_code}\n" \
  https://plugins.jetbrains.com/files/34438/1177603/code-cat-jetbrains-0.2.3-preview.zip
```

结果：版本条目 `approve: true`、`listed: true`，公开搜索能搜到，包地址返回 200。**`0.2.3-preview` 已通过审核并公开。** 此前 README 与本文写的「审核中、尚未公开」已经过期，不要再对外这么说。

线上包只声明 `251.0 — 251.*`，因此 PyCharm 2026.1（261）用户装不上——见下文「兼容范围」。

英文 listing 文案与 change notes 在 `src/main/resources/META-INF/plugin.xml`。补充资料：

- Source: `https://github.com/Chengyunlai/code-cat`
- Documentation: `https://github.com/Chengyunlai/code-cat/blob/main/plugins/jetbrains/README.md`
- Privacy notice: `https://github.com/Chengyunlai/code-cat/blob/main/plugins/jetbrains/PRIVACY.md`
- Issue tracker: `https://github.com/Chengyunlai/code-cat/issues`
- License: MIT, `https://github.com/Chengyunlai/code-cat/blob/main/LICENSE`

## 发一个更新

### 版本号只有一个来源

`plugins/jetbrains/src/main/resources/META-INF/plugin.xml` 的 `<version>`。构建脚本从这里读取，并用它生成 zip 文件名——改一处即可，不要再手改脚本里的版本串。

版本号必须严格大于线上最新版，否则 Marketplace 拒绝。该插件启用了 semver 校验，所以 `0.2.12-preview` 这种「正式号 + 预发布标签」的写法是合法的，排序也符合直觉（`0.2.12-preview` > `0.2.8-preview`）。注意 semver 里预发布版低于同号正式版：`0.2.5-preview` < `0.2.5`。

### 构建

```bash
npm run build:jetbrains                                              # WebStorm 251
CODE_CAT_JETBRAINS_HOME=/Applications/PyCharm.app/Contents npm run build:jetbrains   # PyCharm 261
```

产物在 `plugins/jetbrains/build/`，文件名带版本和目标，例如 `code-cat-jetbrains-0.2.12-preview-webstorm-251.zip`。

### 上传：命令行（推荐，更新频繁时最省事）

令牌在 https://plugins.jetbrains.com/author/me/tokens 创建（permanent token，形如 `perm:xxxx`），只存在本地环境变量里。

```bash
PUBLISH_TOKEN=perm:xxxx npm run publish:jetbrains -- \
  plugins/jetbrains/build/code-cat-jetbrains-0.2.12-preview-webstorm-251.zip
```

加 `--channel preview` 发到 preview 通道；加 `--dry-run` 只打印将要发送的内容。脚本会在上传前拉取线上版本列表，版本没变大或该版本已存在时直接拒绝，不会白跑一次审核。

底层就是官方接口，出错时可以自己重放：

```bash
curl -i --header "Authorization: Bearer perm:xxxx" \
  -F pluginId=34438 \
  -F file=@plugins/jetbrains/build/code-cat-jetbrains-0.2.12-preview-webstorm-251.zip \
  -F channel= \
  https://plugins.jetbrains.com/api/updates/upload
```

`channel=` 留空表示 Stable。也可以用 `-F xmlId=dev.codecat` 代替 `pluginId`。

### 上传：网页

插件页右上角 **Upload Update** → 选择 zip → 选通道（留空即 Stable）→ 提交。首次发布插件走的是另一条路径（账号菜单 → Upload plugin），更新不需要。

### 审核

官方口径：**每个新版本都要人工审核**，没有「已通过过的插件后续免审」这回事，也没有按通道豁免的说明。

- 通常 3–4 个工作日；官方明确说不保证时限。
- 超过 3–4 个工作日没收到通知，发信 marketplace@jetbrains.com。
- 审核期间旧版本继续对用户可用，不会下线。
- 想先传上去但不立刻公开，上传时勾 hidden（API 加 `-F isHidden=true`）；审核通过后仍需手动取消隐藏才会公开。

### 上传后不能改

提交之后**只有兼容范围（`since-build` / `until-build`）可以再编辑**，描述和 change notes 都不能改。所以 `<change-notes>` 必须在上传前写好——写错了只能等下一个版本。

## 兼容范围：线上包只覆盖 251

线上 `0.2.3-preview` 声明 `since-build 251.0` / `until-build 251.*`，Marketplace 据此算出的兼容产品是 WEBSTORM / GOLAND / RUBYMINE / PHPSTORM / CLION / IDEA_PRO 的 2025.1 系列，PyCharm 只有 `PYCHARM_PRO 2025.1 — 2025.1.6.2`。**PyCharm 2026.1（261）用户装不上，WebStorm 2026.1 也装不上。**

`scripts/build-jetbrains.py` 会把 `<idea-version>` 收窄成当前构建目标的那一条（`251` 或 `261`），这是给本地测试包用的：一个 Marketplace 版本只能有一个包，而仓库现在按分支出两个包。

想用一个包同时覆盖两条产品线，需要：

1. 在 `plugin.xml` 里把范围写宽，例如 `since-build="251" until-build="261.*"`；
2. 用 Plugin Verifier 分别对 251 和 261 验证二进制兼容（审核要求里写明「每次上传都必须用 Plugin Verifier 验证兼容性」）；
3. 本地测试包继续按分支构建，只有上传 Marketplace 的那一个用宽范围。

在没做第 1、2 步之前，不要把 261 支持写进 listing。

## 提交前自查

- `<version>` 比线上最新版大，且是合法 semver。
- `<change-notes>` 写的是这次真实改动，不是「更新了一些内容」；审核明文禁止占位文案。
- `<description>` 里不能出现「Plugin」「IntelliJ」「JetBrains」或 JetBrains 产品名（审核条款 1.2h）。
- 插件 logo 必须是 40×40 SVG，且不能像 JetBrains 自家产品 logo。
- 所有外链可访问，且与插件或作者相关。
- 定价 FREE、开源 MIT → 必须提供源码地址（已提供）。
- 在 listing 里如实写明未验证范围：Python 断点未验证、JetBrains 宿主不采集变量与完整调用栈、不宣称覆盖全部 JetBrains 产品。
