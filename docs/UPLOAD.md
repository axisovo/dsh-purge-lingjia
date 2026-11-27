# 上传到 GitHub（手机端两条路）

本仓库已经可以直接传：项目名 **dsh-purge-零甲**，包名 `dsh-purge-lingjia`，版本 `1.8.0`。
仓库目录：`gtaxis/dsh-purge-zero`（另有一份在 `Documents/dsh-purge-lingjia`，方便手机文件 App / RepoPocket 浏览）。

> **这台机器上没有 git、没有 curl**——所以下面第一条路用 Python 直接走 GitHub API，
> 不需要 `.git` 目录，也不需要装任何东西。

---

## 路线 A（推荐）：Python 脚本直推，一条命令搞定 384 个文件

### A1. 建 token

手机浏览器打开 <https://github.com/settings/tokens> → **Generate new token (classic)**：

- Note：`dsh-purge-lingjia-push`
- Expiration：7 天（推完就过期，最省心）
- Scopes：勾 **`repo`**（要私有仓库）或只勾 **`public_repo`**（只传公开仓库）

生成后复制那串 `ghp_…`。**别把它贴进聊天、别写进任何文件。**

### A2. 先看计划（不联网写任何东西）

```bash
cd /var/mobile/gtaxis/dsh-purge-zero
python3 scripts/push_to_github.py --dry
```

输出会告诉你：要传多少个文件、总大小、以及最大的几个文件（已自动排除 `node_modules`、`*.bak`）。

### A3. 真正推送

```bash
export GITHUB_TOKEN=ghp_你的token
python3 scripts/push_to_github.py --repo dsh-purge-lingjia
```

它会按顺序做四件事：

1. 用 token 校验身份（`GET /user`）；
2. 仓库不存在就**自动创建**（默认 public；加 `--private` 建私有）；
3. 逐个上传文件 → 造 tree → 造 commit → 更新 `main` 分支；
4. 打印 commit 短 SHA 和仓库地址。

想要组织命名空间、或顺手发 Release：

```bash
# 组织仓库
python3 scripts/push_to_github.py --repo dsh-purge-lingjia --owner 你的组织名

# 顺手建 v1.8.0 tag + Release，并把 tgz 当资产上传
python3 scripts/push_to_github.py --release --asset dist/dsh-purge-lingjia-1.8.0.tgz
```

可以重复执行：同一个分支再推会追加一个 fast-forward commit，不 force、不删历史。

推到一半断了怎么办：直接重跑同一条命令。已传的 blob 会重新上传（幂等），最终 tree/commit 与一次跑完等价。

### A4. 推完收尾

```bash
unset GITHUB_TOKEN        # 清掉环境变量
```

然后去 <https://github.com/settings/tokens> 把那个 token **Revoke**（如果设了 7 天过期，也可以不动）。

---

## 路线 B：用 RepoPocket（适合建仓库 / 改单个文件 / 发 Release）

[RepoPocket](https://github.com/wm0104/RepoPocket) 是 iOS 上的 GitHub 客户端：浏览仓库、读代码、
**编辑单个文件并提交**、多账号、管理 Release 与 Actions。它按文件走 GitHub API，
**不适合一次提交 384 个文件**，所以推荐分工：

| 步骤 | 用谁 |
|---|---|
| 建仓库、建 token、发 Release、以后改某个文件 | **RepoPocket** |
| 首次把整个仓库推上去 | **路线 A 的脚本** |

RepoPocket 里的填法：

1. `+` → New Repository → 名字 `dsh-purge-lingjia` → 不要勾 README / .gitignore（保持空仓库）；
2. Settings → Accounts → Add Account → 粘贴同一个 PAT；
3. 仓库页 → Releases → Draft a new release → Tag `v1.8.0` → 上传
   `dist/dsh-purge-lingjia-1.8.0.tgz` 与 `dist/SHA256SUMS.txt`；
4. 之后要改 README 之类的小文件，直接在 App 里编辑提交即可（走 `contents` API）。

---

## 路线 C（不推荐）：网页 Upload files

网页端「Add file → Upload files」在 iOS Safari 里一次只能挑少量文件，
384 个文件 + 目录结构会丢子目录。除非只想传几个根文件，否则别用。

---

## 推完之后必须做的事

1. **确认仓库根目录**：`README.md`、`package.json`、`cordis.patch.yml`、`lib/`、`docs/` 都在第一层。
2. **把 `OWNER` 换成你的账号**（如果你是在这台机器上生成的仓库，可以直接跑）：
   ```bash
   python3 scripts/set-repo-owner.mjs 你的账号 --dry    # 先看会改哪些
   python3 scripts/set-repo-owner.mjs 你的账号
   python3 scripts/push_to_github.py --repo dsh-purge-lingjia   # 再推一次，把链接改过来
   ```
   不换的话，README 里的安装命令指向 `github.com/OWNER/...`，别人复制会 404。
3. **打开 Actions**：`.github/workflows/ci.yml` 会跑语法检查 + 两个自测 + 文档一致性。
4. **建 Release 并上传资产**（路线 A 的 `--release`，或 RepoPocket 手点）：
   - `dist/dsh-purge-lingjia-1.8.0.tgz`（安装用，带 `package/` 前缀，`dsh plugin add` 直接吃）
   - `dist/SHA256SUMS.txt`
   - 资产名必须是 `dsh-purge-lingjia-1.8.0.tgz`：`package.json` 的 `dsh.install.tarball`、
     README 的固定版本链接、更新通道校验都按这个名字找。

## 让 GitHub 正确「认出」这是发行版（About / Topics / Release）

推完代码后还有三处元数据，直接决定别人搜不搜得到、仓库右侧栏有没有 Releases 条目：

### 1. About 描述（带关键词）

`Settings → General → Description`（或 API `PATCH /repos/{owner}/{repo}`）：

```
dsh-purge-零甲 · DeepSeek Harness 破甲插件（零甲整合版）· iOS RootHide 越狱实测 · DSH 0.2.2-rc.5 · 92 宿主补丁 + 4 个删甲出口
```

Website 填 `https://github.com/<owner>/dsh-purge-lingjia/releases/latest`。

### 2. Topics（搜索权重最高的一处）

`Settings → General → Topics`，建议直接粘这一串：

```
dsh  deepseek-harness  jailbreak  roothide  ios  jbroot  dsh-plugin  prompt-injection  zero-armor  破甲  零甲
```

### 3. Release 必须「已发布且非 draft / 非 prerelease」

- tag 形如 `v1.8.0`，标题带版本号，正文写清本版变化（可用 `.github/release.yml` 的自动分类）；
- 资产名必须是 `<包名>-<版本>.tgz`（本项目是 `dsh-purge-lingjia-1.8.0.tgz`）——
  `package.json` 的 `dsh.install.tarball`、README 的固定版本链接、更新通道校验都按这个名字找；
- `https://api.github.com/repos/<owner>/<repo>/releases/latest` 能返回该版本，GitHub 侧栏才会显示 "Releases 1"。

一条命令检查三件事：

```bash
python3 - <<'EOF'
import json,urllib.request
u="https://api.github.com/repos/axisovo/dsh-purge-lingjia"
for path,label in ((u,"repo"),(u+"/topics","topics"),(u+"/releases/latest","latest")):
    r=urllib.request.Request(path,headers={"User-Agent":"chk","Accept":"application/vnd.github+json"})
    d=json.loads(urllib.request.urlopen(r,timeout=20).read().decode())
    print(label, d.get("description") or d.get("names") or d.get("tag_name"))
EOF
```

## 别提交的东西

`.gitignore` 已经排掉：`node_modules/`、`*.bak`、`*.dshpurge.bak`、`*.dshperma.bak`、`scratch/`、`dist/`、`.env`。
其中 `*.dshpurge.bak` 是**宿主官方源码的原始备份**，传上去等于把 DeepSeek 的源码发出去——脚本和 .gitignore 都会拦。

## 两条硬提醒

1. **从 1.7.20 升级的老用户**：先 `purge-lingjia revert` 撤宿主补丁，装 1.8.0 后再 `/purge apply`。
   零甲那 4 处锚点必须按新宿主原文重打；直接覆盖安装会留下旧锚点（状态页显示 `pending`）。
2. **#100 不需要新的宿主补丁**：它复用 #98 的落点，`revert` 后 `apply` 一次即可；
   行为开关在 `$DSH_HOME/dsh-purge/tuning.json` 的 `historyScrub` / `historyScrubDrop`。
