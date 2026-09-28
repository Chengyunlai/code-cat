"""把已构建的 JetBrains 插件包上传到 JetBrains Marketplace。

用法：
    PUBLISH_TOKEN=perm:xxxx python3 scripts/publish-jetbrains.py <zip> [--channel preview]

只做两件事：校验版本号确实比线上新，然后调用 Marketplace 的上传接口。构建由
`npm run build:jetbrains` 负责，本脚本不改动任何文件。

上传接口见 https://plugins.jetbrains.com/docs/marketplace/plugin-upload.html
令牌在 https://plugins.jetbrains.com/author/me/tokens 创建（permanent token）。
"""
import argparse
import io
import json
import os
import pathlib
import re
import sys
import urllib.error
import urllib.request
import uuid
import zipfile

PLUGIN_ID = 34438
PLUGIN_XML_ID = "dev.codecat"
UPLOAD_URL = "https://plugins.jetbrains.com/api/updates/upload"
VERSIONS_URL = f"https://plugins.jetbrains.com/api/plugins/{PLUGIN_ID}/updates?size=200"
PLUGIN_PAGE = f"https://plugins.jetbrains.com/plugin/{PLUGIN_ID}-code-cat"

VERSION_PATTERN = re.compile(r"<version>([^<]+)</version>")
SEMVER_PATTERN = re.compile(r"^(\d+)\.(\d+)\.(\d+)(?:-(.+))?$")


def parse_version(text):
    """把 semver 拆成可比较的元组。预发布版本低于同号正式版，与 semver 一致。"""
    match = SEMVER_PATTERN.match(text.strip())
    if not match:
        raise SystemExit(f"版本号不是 semver，Marketplace 会拒绝：{text!r}")
    major, minor, patch, prerelease = match.groups()
    # 有预发布标记时排在同号正式版之前。
    return (int(major), int(minor), int(patch), 0 if prerelease else 1, prerelease or "")


def read_plugin_manifest(archive):
    """读出 plugin.xml：外层 zip 里的 code-cat/lib/code-cat.jar 是嵌套的 jar。"""
    with zipfile.ZipFile(archive) as bundle:
        jars = [n for n in bundle.namelist() if n.endswith("lib/code-cat.jar")]
        if not jars:
            raise SystemExit(f"包里找不到 lib/code-cat.jar：{archive}")
        with zipfile.ZipFile(io.BytesIO(bundle.read(jars[0]))) as jar:
            names = [n for n in jar.namelist() if n.endswith("META-INF/plugin.xml")]
            if not names:
                raise SystemExit(f"jar 里找不到 META-INF/plugin.xml：{jars[0]}")
            manifest = jar.read(names[0]).decode("utf-8")
    version = VERSION_PATTERN.search(manifest)
    if not version:
        raise SystemExit("plugin.xml 里没有 <version>")
    return version.group(1).strip()


def published_versions():
    """读取线上所有版本，用于上传前比对。失败时不阻塞，只提示。"""
    try:
        with urllib.request.urlopen(VERSIONS_URL, timeout=30) as response:
            return json.load(response)
    except (urllib.error.URLError, TimeoutError, json.JSONDecodeError) as error:
        print(f"警告：读不到线上版本列表（{error}），跳过版本比对。")
        return None


def encode_multipart(fields, file_field, file_path):
    """手工拼 multipart/form-data，避免为一次上传引入依赖。"""
    boundary = f"----codecat{uuid.uuid4().hex}"
    body = bytearray()
    for name, value in fields:
        body += f"--{boundary}\r\n".encode()
        body += f'Content-Disposition: form-data; name="{name}"\r\n\r\n'.encode()
        body += f"{value}\r\n".encode()
    body += f"--{boundary}\r\n".encode()
    body += (
        f'Content-Disposition: form-data; name="{file_field}"; '
        f'filename="{file_path.name}"\r\n'
    ).encode()
    body += b"Content-Type: application/zip\r\n\r\n"
    body += file_path.read_bytes()
    body += f"\r\n--{boundary}--\r\n".encode()
    return boundary, bytes(body)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("archive", type=pathlib.Path, help="build 目录里的 zip")
    parser.add_argument(
        "--channel",
        default="",
        help="发布通道；留空为默认 Stable，填 preview 则发布到 preview 通道",
    )
    parser.add_argument(
        "--hidden",
        action="store_true",
        help="审核通过后不公开，仅可通过直链获取",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="只打印将要发送的内容，不实际上传",
    )
    parser.add_argument(
        "--skip-version-check",
        action="store_true",
        help="跳过「版本必须比线上新」的校验",
    )
    args = parser.parse_args()

    archive = args.archive.resolve()
    if not archive.is_file():
        raise SystemExit(f"找不到文件：{archive}")

    version = read_plugin_manifest(archive)
    channel = args.channel.strip()
    channel_label = channel or "Stable"

    print(f"插件：{PLUGIN_XML_ID}（pluginId={PLUGIN_ID}）")
    print(f"包：{archive.name}（{archive.stat().st_size / 1024:.0f} KB）")
    print(f"版本：{version}")
    print(f"通道：{channel_label}")

    if not args.skip_version_check:
        existing = published_versions()
        if existing is not None:
            same_channel = [
                update for update in existing if (update.get("channel") or "") == channel
            ]
            if not same_channel:
                print(f"线上 {channel_label} 通道还没有版本，这将是第一个。")
            else:
                newest = max(same_channel, key=lambda u: parse_version(u["version"]))
                print(f"线上最新：{newest['version']}")
                if parse_version(version) <= parse_version(newest["version"]):
                    raise SystemExit(
                        f"版本没有变大：{version} <= {newest['version']}。"
                        "Marketplace 会拒绝重复或更低的版本，请先升 plugin.xml 的 <version>。"
                    )
                if any(u["version"] == version for u in existing):
                    raise SystemExit(f"版本 {version} 已经上传过。")

    token = os.environ.get("PUBLISH_TOKEN", "").strip()
    if not token and not args.dry_run:
        raise SystemExit(
            "缺少 PUBLISH_TOKEN。在 https://plugins.jetbrains.com/author/me/tokens "
            "创建 permanent token 后重试。"
        )

    fields = [("pluginId", str(PLUGIN_ID)), ("channel", channel)]
    if args.hidden:
        fields.append(("isHidden", "true"))

    if args.dry_run:
        print("\n--dry-run，未发送。将要发送的字段：")
        for name, value in fields:
            print(f"  {name}={value!r}")
        print(f"  file={archive.name}")
        print(f"  POST {UPLOAD_URL}")
        return

    boundary, body = encode_multipart(fields, "file", archive)
    request = urllib.request.Request(UPLOAD_URL, data=body, method="POST")
    request.add_header("Authorization", f"Bearer {token}")
    request.add_header("Content-Type", f"multipart/form-data; boundary={boundary}")

    try:
        with urllib.request.urlopen(request, timeout=300) as response:
            payload = response.read().decode("utf-8", "replace")
            status = response.status
    except urllib.error.HTTPError as error:
        detail = error.read().decode("utf-8", "replace")
        raise SystemExit(f"上传失败：HTTP {error.code}\n{detail}") from error
    except urllib.error.URLError as error:
        raise SystemExit(f"上传失败：{error}") from error

    print(f"\n上传完成：HTTP {status}")
    if payload.strip():
        print(payload.strip()[:2000])
    print(f"\n版本页：{PLUGIN_PAGE}/versions")
    print("提醒：每个新版本都要人工审核（官方说明 3-4 个工作日）。")
    print("若超时未收到通知，发信到 marketplace@jetbrains.com。")


if __name__ == "__main__":
    main()
