#!/usr/bin/env python3
"""仓库文档自检：YAML 语法、Markdown 内部链接、示例目录约定、末尾换行、版本与打包一致性。

在仓库根目录运行：
    python3 scripts/verify-docs.py

退出码 0 = 全部通过，1 = 存在问题。
只依赖标准库（YAML 检查需要 pyyaml，缺失时自动跳过该项）。

只检查 git 已跟踪的文件，因此不会去读 node_modules、构建产物和测试沙箱。
"""
import glob
import json
import os
import re
import subprocess
import sys

failures = []


def section(title):
    print(f"\n=== {title} ===")


def tracked_files():
    """返回 git 已跟踪的文件列表（相对仓库根目录）。"""
    try:
        out = subprocess.run(
            ["git", "ls-files", "-z"],
            capture_output=True,
            check=True,
        ).stdout
    except (OSError, subprocess.CalledProcessError) as exc:
        print(f"  跳过：无法读取 git 跟踪列表（{exc}）")
        return []
    return [p for p in out.decode("utf-8").split("\0") if p]


# 二进制与压缩产物不做末尾换行检查
BINARY_SUFFIXES = (
    ".png", ".jpg", ".jpeg", ".gif", ".ico", ".webp", ".svg", ".pdf",
    ".zip", ".jar", ".vsix", ".gz", ".tgz", ".woff", ".woff2", ".ttf",
    ".mp3", ".mp4", ".mov", ".so", ".dylib", ".dll", ".class", ".pyc",
)

FILES = tracked_files()


# ---------- 1. YAML 语法 ----------
section("1. .github 下的 YAML")
yml_files = sorted(
    f for f in FILES if f.startswith(".github/") and f.endswith((".yml", ".yaml"))
)
if not yml_files:
    print("  跳过：未找到 .github 下的 YAML")

try:
    import yaml
except ImportError:
    print("  跳过：未安装 pyyaml（pip install pyyaml 后可启用）")
    yaml = None

if yaml:
    VALID_ISSUE_TYPES = {"markdown", "input", "textarea", "dropdown", "checkboxes"}
    for f in yml_files:
        try:
            d = yaml.safe_load(open(f, encoding="utf-8"))
        except Exception as e:
            print(f"  FAIL {f}: YAML 解析失败 -> {e}")
            failures.append(f)
            continue

        if "ISSUE_TEMPLATE" in f and "config" not in os.path.basename(f):
            missing = [k for k in ("name", "description", "body") if k not in d]
            if missing:
                print(f"  FAIL {f}: 缺少必填字段 {missing}")
                failures.append(f)
                continue
            bad = [b.get("type") for b in d["body"] if b.get("type") not in VALID_ISSUE_TYPES]
            if bad:
                print(f"  FAIL {f}: 非法 type {bad}（合法值：{sorted(VALID_ISSUE_TYPES)}）")
                failures.append(f)
                continue
            print(f"  OK   {f}  -> {d['name']}（{len(d['body'])} 字段）")
        elif f.startswith(".github/workflows/"):
            # YAML 1.1 会把裸 on: 解析成布尔 True，两种键名都要认
            has_on = isinstance(d, dict) and ("on" in d or True in d)
            if not has_on or "jobs" not in d:
                print(f"  FAIL {f}: workflow 缺少 on / jobs")
                failures.append(f)
                continue
            print(f"  OK   {f}  -> jobs: {', '.join(d['jobs'])}")
        else:
            print(f"  OK   {f}")


# ---------- 2. Markdown 内部链接 ----------
section("2. Markdown 内部链接")
pat = re.compile(r"\[([^\]]*)\]\(([^)]+)\)")
FENCED = re.compile(r"^[ \t]*(```|~~~).*?^[ \t]*\1", re.S | re.M)
INLINE_CODE = re.compile(r"`[^`\n]*`")
HTML_COMMENT = re.compile(r"<!--.*?-->", re.S)
broken = checked = 0


def strip_non_prose(text):
    """去掉围栏代码块、行内代码与 HTML 注释，避免把示例里的链接形式当真实链接。"""
    text = FENCED.sub("", text)
    text = HTML_COMMENT.sub("", text)
    return INLINE_CODE.sub("", text)


for md in sorted(f for f in FILES if f.endswith(".md")):
    base = os.path.dirname(md)
    try:
        content = open(md, encoding="utf-8").read()
    except Exception:
        continue
    for _, target in pat.findall(strip_non_prose(content)):
        if target.startswith(("http://", "https://", "mailto:", "#", "tel:")):
            continue
        path = target.split("#")[0].strip()
        if not path:
            continue
        checked += 1
        resolved = os.path.normpath(os.path.join(base, path))
        if not os.path.exists(resolved):
            print(f"  BROKEN {md}  ->  {target}")
            broken += 1

print(f"  检查 {checked} 个内部链接，失效 {broken} 个")
if broken:
    failures.append(f"{broken} 个失效链接")


# ---------- 3. 示例目录约定 ----------
section("3. examples/stage-* 目录约定")
stage_dirs = sorted(d for d in glob.glob("examples/stage-*") if os.path.isdir(d))
if not stage_dirs:
    print("  跳过：未找到 examples/stage-* 目录")
for d in stage_dirs:
    miss = [s for s in ("user_code", "core") if not os.path.isdir(os.path.join(d, s))]
    if miss:
        print(f"  FAIL {d}: 缺少 {miss}")
        failures.append(d)
    else:
        print(f"  OK   {d}")


# ---------- 4. 末尾换行 ----------
section("4. 末尾换行")
nonl = []
for rel in FILES:
    if rel.endswith(BINARY_SUFFIXES):
        continue
    try:
        size = os.path.getsize(rel)
    except OSError:
        continue
    # 0 字节占位文件（.gitkeep）不需要末尾换行
    if size == 0:
        continue
    with open(rel, "rb") as fh:
        if fh.read()[-1:] != b"\n":
            nonl.append(rel)
if nonl:
    print(f"  FAIL 缺少末尾换行：{nonl}")
    failures.append("末尾换行")
else:
    print(f"  OK   {len(FILES)} 个已跟踪文件均以换行结尾")


# ---------- 5. 版本号与打包一致性 ----------
section("5. 版本号与打包一致性")

package_json = "package.json"
plugin_xml = "plugins/jetbrains/src/main/resources/META-INF/plugin.xml"
changelog = "CHANGELOG.md"

vscode_version = jetbrains_version = None

try:
    vscode_version = json.load(open(package_json, encoding="utf-8"))["version"]
    print(f"  package.json version            = {vscode_version}")
except Exception as e:
    print(f"  FAIL 无法读取 {package_json}: {e}")
    failures.append(package_json)

try:
    xml = open(plugin_xml, encoding="utf-8").read()
    m = re.search(r"<version>([^<]+)</version>", xml)
    jetbrains_version = m.group(1) if m else None
    if not jetbrains_version:
        raise ValueError("未找到 <version>")
    print(f"  plugin.xml <version>            = {jetbrains_version}")
except Exception as e:
    print(f"  FAIL 无法读取 {plugin_xml}: {e}")
    failures.append(plugin_xml)

if vscode_version and os.path.exists(changelog):
    body = open(changelog, encoding="utf-8").read()
    if not re.search(rf"^## {re.escape(vscode_version)}\b", body, flags=re.M):
        print(f"  FAIL {changelog} 缺少当前版本小节：## {vscode_version}")
        failures.append(changelog)
    else:
        print(f"  OK   {changelog} 有 {vscode_version} 小节")
    if jetbrains_version and jetbrains_version not in body:
        print(f"  FAIL {changelog} 未提到 JetBrains 版本 {jetbrains_version}")
        failures.append(changelog)
    else:
        print(f"  OK   {changelog} 提到 JetBrains 版本 {jetbrains_version}")

for readme in ("README.md", "README.en.md"):
    if not os.path.exists(readme):
        continue
    body = open(readme, encoding="utf-8").read()
    missing = []
    if vscode_version and vscode_version not in body:
        missing.append(vscode_version)
    if jetbrains_version and jetbrains_version not in body:
        missing.append(jetbrains_version)
    if missing:
        print(f"  FAIL {readme} 未提到当前版本 {missing}")
        failures.append(readme)
    else:
        print(f"  OK   {readme} 提到两个当前版本")

vscodeignore = ".vscodeignore"
try:
    ignored = open(vscodeignore, encoding="utf-8").read()
except OSError:
    ignored = None
    print(f"  FAIL 未找到 {vscodeignore}")
    failures.append(vscodeignore)

if ignored is not None:
    must_ignore = ["CONTEXT.md", "AGENTS.md", "CONTRIBUTING.md"]
    leaked = [name for name in must_ignore if name not in ignored]
    if leaked:
        print(f"  FAIL {vscodeignore} 未排除贡献者文档：{leaked}（会被打进 vsix）")
        failures.append(vscodeignore)
    else:
        print(f"  OK   {vscodeignore} 已排除 {must_ignore}")


# ---------- 汇总 ----------
print("\n" + "=" * 46)
if failures:
    print(f"结论：发现 {len(failures)} 处问题")
    for f in failures:
        print(f"  - {f}")
    sys.exit(1)
print("结论：全部通过")
sys.exit(0)
