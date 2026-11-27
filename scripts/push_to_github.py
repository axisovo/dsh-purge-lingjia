#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
push_to_github.py —— 不用 git 也能把本仓库推上 GitHub（只用 Python 3 标准库）。

为什么需要它：iOS 上的 DSH 环境里通常没有 git/curl，但有 python3。这个脚本直接走
GitHub REST API（blobs → tree → commit → ref），因此不需要 .git 目录、不需要 git 二进制。

用法
----
    # 0) 先在 https://github.com/settings/tokens 建一个 token（勾 repo 或 public_repo）
    export GITHUB_TOKEN=ghp_xxxxxxxx

    # 1) 只看计划，不写任何东西
    python3 scripts/push_to_github.py --dry

    # 2) 真正推送（仓库不存在会自动创建，默认 public）
    python3 scripts/push_to_github.py --repo dsh-purge-lingjia

    # 3) 私有仓库 + 指定 owner（组织或别人的命名空间需要相应权限）
    python3 scripts/push_to_github.py --repo dsh-purge-lingjia --private --owner my-org

    # 4) 顺手建 tag 与 Release，并把 tgz 作为资产上传
    python3 scripts/push_to_github.py --release --asset dist/dsh-purge-lingjia-1.8.0.tgz

可重复执行：同一个分支再次推送会追加一个新 commit（Fast-forward，不 force、不删历史）。
"""

from __future__ import annotations

import argparse
import base64
import hashlib
import http.client
import socket
import threading
import time
from concurrent.futures import ThreadPoolExecutor, as_completed
import json
import mimetypes
import os
import subprocess
import sys
import urllib.error
import urllib.request
from pathlib import Path

API = "https://api.github.com"
UA = "dsh-purge-lingjia-publisher/1.0"
ROOT = Path(__file__).resolve().parent.parent
lock = threading.Lock()

# 与 .gitignore 保持一致：这些目录/文件不推。
SKIP_DIRS = {"node_modules", ".git", "dist", "scratch", "coverage", "tmp", "__pycache__"}
SKIP_SUFFIXES = (".bak", ".dshpurge.bak", ".dshperma.bak", ".log", ".DS_Store")
SKIP_NAMES = {".env", ".DS_Store"}


def log(msg: str = "") -> None:
    print(msg, flush=True)


def fail(msg: str, code: int = 1) -> "NoReturn":  # type: ignore[name-defined]
    log(f"✗ {msg}")
    sys.exit(code)


def request(method: str, path: str, token: str, payload=None, *, raw=False, timeout=60):
    """一次 GitHub API 调用。返回 (status, body_dict_or_bytes)。"""
    url = path if path.startswith("http") else API + path
    data = None
    headers = {"User-Agent": UA, "Accept": "application/vnd.github+json"}
    if token:
        headers["Authorization"] = f"Bearer {token}"
    if payload is not None:
        data = json.dumps(payload).encode()
        headers["Content-Type"] = "application/json"
    req = urllib.request.Request(url, data=data, headers=headers, method=method)
    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            body = resp.read()
            return resp.status, (body if raw else json.loads(body or b"{}"))
    except urllib.error.HTTPError as e:
        body = e.read()
        try:
            parsed = json.loads(body or b"{}")
        except Exception:
            parsed = {"message": body[:300].decode("utf-8", "replace")}
        return e.code, parsed
    except (urllib.error.URLError, http.client.RemoteDisconnected, ConnectionError, socket.timeout, TimeoutError) as e:
        # 手机网络会掐连接：交给上层重试，不在这里直接退出。
        return 599, {"message": f"{type(e).__name__}: {getattr(e, 'reason', e)}", "transient": True}


def collect_files(root: Path):
    files = []
    for path in sorted(root.rglob("*")):
        if not path.is_file():
            continue
        rel = path.relative_to(root)
        if any(part in SKIP_DIRS for part in rel.parts[:-1]):
            continue
        if rel.name in SKIP_NAMES or rel.name.endswith(SKIP_SUFFIXES):
            continue
        if rel.name.endswith(".pyc"):
            continue
        files.append((rel.as_posix(), path))
    return files


def is_binary(path: Path) -> bool:
    try:
        chunk = path.read_bytes()[:8000]
    except OSError:
        return True
    if b"\x00" in chunk:
        return True
    return False


def main() -> None:
    ap = argparse.ArgumentParser(description="把本仓库推上 GitHub（不需要 git）")
    ap.add_argument("--repo", default="dsh-purge-lingjia", help="仓库名（默认 dsh-purge-lingjia）")
    ap.add_argument("--owner", default="", help="账号或组织（默认 token 所属用户）")
    ap.add_argument("--branch", default="main", help="分支（默认 main）")
    ap.add_argument("--message", default="", help="commit message")
    ap.add_argument("--private", action="store_true", help="建私有仓库")
    ap.add_argument("--release", action="store_true", help="推送后建 tag 与 Release")
    ap.add_argument("--tag", default="", help="Release tag（默认 v<package.json version>）")
    ap.add_argument("--asset", action="append", default=[], help="随 Release 上传的资产文件，可重复（如 --asset a.tgz --asset SHA256SUMS.txt）")
    ap.add_argument("--jobs", type=int, default=6, help="并发上传数（默认 6）")
    ap.add_argument("--dry", action="store_true", help="只扫描并打印计划，不联网写入")
    args = ap.parse_args()

    token = os.environ.get("GITHUB_TOKEN", "").strip()
    version = json.loads((ROOT / "package.json").read_text(encoding="utf-8"))["version"]
    message = args.message or f"dsh-purge-零甲 {version}"
    tag = args.tag or f"v{version}"

    files = collect_files(ROOT)
    total = sum(p.stat().st_size for _, p in files)
    log(f"仓库目录：{ROOT}")
    log(f"待推送文件：{len(files)} 个，共 {total/1048576:.2f} MiB（已按 .gitignore 排除 node_modules / *.bak 等）")
    biggest = sorted(files, key=lambda x: x[1].stat().st_size, reverse=True)[:5]
    for rel, p in biggest:
        log(f"  · {rel}  {p.stat().st_size/1024:.0f} KiB")

    if args.dry:
        log("\n[dry] 未联网写入。去掉 --dry 即执行推送。")
        if not token:
            log("[dry] 提示：真正推送前需要 export GITHUB_TOKEN=<你的 PAT>")
        return

    if not token:
        fail("缺少 GITHUB_TOKEN。请先建 token（勾 repo 或 public_repo），然后 export GITHUB_TOKEN=…")

    # 1) 校验 token
    status, me = request("GET", "/user", token)
    if status != 200:
        fail(f"token 校验失败（HTTP {status}）：{me.get('message', me)}")
    owner = args.owner or me["login"]
    log(f"\n已认证：{me['login']}　目标仓库：{owner}/{args.repo}")

    # 2) 确保仓库存在
    status, repo = request("GET", f"/repos/{owner}/{args.repo}", token)
    created = False
    if status == 404:
        status, repo = request("POST", "/user/repos" if not args.owner else f"/orgs/{args.owner}/repos", token, {
            "name": args.repo,
            "private": bool(args.private),
            "description": "dsh-purge-零甲：DeepSeek Harness 破甲插件（零甲整合版）",
            "has_issues": True,
            "has_wiki": False,
            "auto_init": False,
        })
        if status not in (200, 201):
            fail(f"创建仓库失败（HTTP {status}）：{repo.get('message', repo)}")
        created = True
        log(f"已创建仓库：{repo['html_url']}")
    elif status != 200:
        fail(f"读取仓库失败（HTTP {status}）：{repo.get('message', repo)}")
    else:
        log(f"仓库已存在：{repo['html_url']}（将追加 commit）")

    # 2.5) 空仓库引导：Git Data API 在仓库还没有任何 commit 时会返回
    #      409 "Git Repository is empty."，所以先用 contents API 建出第一次提交，
    #      随后真实 README 会覆盖它。
    status, commits = request("GET", f"/repos/{owner}/{args.repo}/commits?per_page=1", token)
    if status == 409 or (status == 200 and isinstance(commits, list) and not commits):
        status, boot = request("PUT", f"/repos/{owner}/{args.repo}/contents/README.md", token, {
            "message": "chore: bootstrap repository",
            "content": base64.b64encode("# dsh-purge-零甲\n\n初始化提交，随后由发布脚本覆盖。\n".encode()).decode(),
            "branch": args.branch,
        })
        if status in (200, 201):
            log(f"空仓库已引导（{args.branch} 上建了第一次提交）")
        else:
            fail(f"引导空仓库失败（HTTP {status}）：{boot.get('message', boot)}")

    # 3) 上传 blobs（并发，默认 6 路；每个请求独立，失败即中止）
    log(f"\n上传文件 …（{args.jobs} 路并发）")
    tree = []
    done = {"n": 0}

    cache_file = ROOT / ".blob-cache.json"
    cache = {}
    try:
        cache = json.loads(cache_file.read_text(encoding="utf-8"))
    except Exception:
        cache = {}

    def upload_once(rel, payload):
        """一次上传，网络抖动最多重试 5 次（指数退避）。"""
        last = None
        for attempt in range(1, 6):
            status, blob = request("POST", f"/repos/{owner}/{args.repo}/git/blobs", token, payload)
            if status in (200, 201):
                return blob["sha"]
            last = f"HTTP {status}：{blob.get('message', blob)}"
            if status in (599, 502, 503, 504) or blob.get("transient"):
                time.sleep(min(2 ** attempt, 15))
                continue
            break
        raise RuntimeError(f"上传 {rel} 失败（{last}）")

    def upload_one(item):
        rel, path = item
        data = path.read_bytes()
        digest = hashlib.sha256(data).hexdigest()
        hit = cache.get(rel)
        if hit and hit[0] == digest:
            with lock:
                done["n"] += 1
                if done["n"] % 40 == 0 or done["n"] == len(files):
                    log(f"  {done['n']}/{len(files)}（缓存复用）")
            return {"path": rel, "mode": hit[2], "type": "blob", "sha": hit[1]}
        if is_binary(path):
            payload = {"content": base64.b64encode(data).decode(), "encoding": "base64"}
        else:
            try:
                payload = {"content": data.decode("utf-8"), "encoding": "utf-8"}
            except UnicodeDecodeError:
                payload = {"content": base64.b64encode(data).decode(), "encoding": "base64"}
        sha = upload_once(rel, payload)
        mode = "100755" if os.access(path, os.X_OK) and not rel.endswith((".md", ".json", ".yml", ".png")) else "100644"
        with lock:
            cache[rel] = [digest, sha, mode]
            if done["n"] % 10 == 9:
                try:
                    cache_file.write_text(json.dumps(cache), encoding="utf-8")
                except Exception:
                    pass
        with lock:
            done["n"] += 1
            if done["n"] % 20 == 0 or done["n"] == len(files):
                log(f"  {done['n']}/{len(files)}")
        return {"path": rel, "mode": mode, "type": "blob", "sha": sha}

    with ThreadPoolExecutor(max_workers=max(1, args.jobs)) as pool:
        futures = [pool.submit(upload_one, item) for item in files]
        for fut in as_completed(futures):
            try:
                tree.append(fut.result())
            except Exception as exc:  # noqa: BLE001 - 单文件失败必须报清楚
                fail(str(exc))
            finally:
                pass
    try:
        cache_file.write_text(json.dumps(cache), encoding="utf-8")
    except Exception:
        pass
    tree.sort(key=lambda row: row["path"])

    # 4) 造 tree（无 parent → 全新树）
    status, new_tree = request("POST", f"/repos/{owner}/{args.repo}/git/trees", token, {"tree": tree})
    if status not in (200, 201):
        fail(f"创建 tree 失败（HTTP {status}）：{new_tree.get('message', new_tree)}")

    # 5) 现有分支的 tip 作为 parent（存在则 fast-forward）
    status, ref = request("GET", f"/repos/{owner}/{args.repo}/git/ref/heads/{args.branch}", token)
    parent = None
    if status == 200:
        parent = ref["object"]["sha"]
    elif status not in (404, 409):
        log(f"（读取分支 {args.branch} 返回 HTTP {status}，按新分支处理）")

    commit_payload = {"message": message, "tree": new_tree["sha"]}
    if parent:
        commit_payload["parents"] = [parent]
    status, commit = request("POST", f"/repos/{owner}/{args.repo}/git/commits", token, commit_payload)
    if status not in (200, 201):
        fail(f"创建 commit 失败（HTTP {status}）：{commit.get('message', commit)}")

    # 6) 更新或创建分支引用
    if parent:
        status, upd = request("PATCH", f"/repos/{owner}/{args.repo}/git/refs/heads/{args.branch}", token, {"sha": commit["sha"], "force": False})
    else:
        status, upd = request("POST", f"/repos/{owner}/{args.repo}/git/refs", token, {"ref": f"refs/heads/{args.branch}", "sha": commit["sha"]})
    if status not in (200, 201):
        fail(f"更新分支失败（HTTP {status}）：{upd.get('message', upd)}\n提示：若目标分支有保护规则，请先在仓库设置里放开，或换一个分支名。")

    log(f"\n✓ 已推送 {len(files)} 个文件到 {owner}/{args.repo}@{args.branch}")
    log(f"  commit: {commit['sha'][:12]}  {message}")
    log(f"  打开：https://github.com/{owner}/{args.repo}")

    # 7) 可选：tag + Release + 资产
    if args.release:
        log("\n创建 tag 与 Release …")
        request("POST", f"/repos/{owner}/{args.repo}/git/refs", token, {"ref": f"refs/tags/{tag}", "sha": commit["sha"]})
        status, rel = request("POST", f"/repos/{owner}/{args.repo}/releases", token, {
            "tag_name": tag,
            "name": f"dsh-purge-零甲 {version}",
            "body": f"见 CHANGELOG.md。零甲层 #97–#100、obsoleteWhenAbsent、历史拒绝清洗。\n\n本版安装：\n```\n{args.repo}-{version}.tgz\n```",
            "draft": False,
            "prerelease": False,
        })
        if status not in (200, 201):
            log(f"（Release 创建失败 HTTP {status}：{rel.get('message', rel)}；可能是 tag 已存在）")
        else:
            log(f"  Release: {rel['html_url']}")
            upload_url = rel["upload_url"].split("{")[0]
            assets = list(args.asset) if args.asset else []
            if not assets:
                guess = ROOT / "dist" / f"{args.repo}-{version}.tgz"
                if guess.exists():
                    assets = [str(guess)]
            for asset in assets:
                ap_path = Path(asset)
                if not ap_path.exists():
                    log(f"  · 跳过资产（不存在）：{asset}")
                    continue
                ctype = mimetypes.guess_type(ap_path.name)[0] or "application/octet-stream"
                req = urllib.request.Request(
                    f"{upload_url}?name={urllib.parse.quote(ap_path.name)}",
                    data=ap_path.read_bytes(),
                    headers={
                        "User-Agent": UA,
                        "Authorization": f"Bearer {token}",
                        "Content-Type": ctype,
                        "Accept": "application/vnd.github+json",
                    },
                    method="POST",
                )
                try:
                    with urllib.request.urlopen(req, timeout=300) as resp:
                        log(f"  · 已上传资产 {ap_path.name}（HTTP {resp.status}）")
                except urllib.error.HTTPError as e:
                    log(f"  · 资产上传失败 {ap_path.name}：HTTP {e.code} {e.read()[:200]}")


if __name__ == "__main__":
    main()
