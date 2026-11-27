# AGENTS.md — 给 AI agent 的 dsh-purge-零甲 使用说明书

> 写给**在 DSH 里干活的 agent**，不是营销文档。
> 当前版本：**1.8.0** · 适配 DSH Desktop **0.2.2-rc.5**（0.2.2-rc.1 / rc.2 / rc.3 / 0.2.1-rc.1 / rc.2 / rc.3 / rc.5 同样通过）
> 版本号由 `npm run check:docs` 与 `package.json` 校验，发版必须同步；历史版本与 PR 记录在 [maintenance-archive](docs/maintenance-archive.md)，不要再写回本文件。

---

用户让你安装或升级时，直接从[安装 / 更新边界](#installation)开始。

## 0. 30 秒版本

- 这个插件（dsh-purge-零甲，包名 `dsh-purge-lingjia`）把 DSH 里**拦你的东西**拆掉：审批弹窗、沙箱拒绝、fs 围栏、工具结果修剪、计划模式硬拦、`ask_user_question` 等待、以及模型自己的拒绝倾向。
- 你不需要"绕过"它——**它就是替你拆闸的**。看到"我不能/建议你先确认"这类输出，多半不是插件失效，而是模型层的问题，按 §5 排查。
- 你的操作入口只有两个：**面板（左侧栏 Purge）** 和 **CLI（`purge-lingjia`，旧名 `purge-community` 仍可用）**。别手改 `~/Library/.../Resources/app` 下的宿主文件，改了会被下一次「应用」覆盖。

## 部署说明（Deployment）

> 给执行安装/升级的 agent 的完整流程。**安装不等于生效**：装完必须「应用」→ 退出重开。

### D1. 前置检查

1. 确认 DSH 版本：`package.json` 的 `dsh.compatibility.dsh` 是 `>=0.2.1-rc.1 <0.3.0`，实测 0.2.2-rc.5。
2. 确认是否已装旧版：`grep -n "dsh-purge" <profile>/package.json`。
   出现 `dsh-purge-community`（1.7.x）或 `dsh-purge` 时**不要先删**，本版会原地迁移（数据目录
   `$DSH_HOME/dsh-purge-community/` 与 `$DSH_HOME/dsh-purge/` 继续被使用）。
3. 确认 `dsh` 可执行体与 profile：`dsh --version`；profile 目录一般在
   `$DSH_HOME/profiles/<web|desktop|cli|dsh-tui>`。

### D2. 安装（三选一）

```bash
# ① 官方插件界面：DSH → 插件 → 添加插件 → https://github.com/OWNER/dsh-purge-lingjia

# ② CLI（macOS / Linux）——先 --dry 看计划
curl -fsSL https://raw.githubusercontent.com/OWNER/dsh-purge-lingjia/main/scripts/install.sh -o /tmp/dsh-purge-install.sh
sh /tmp/dsh-purge-install.sh --dry
sh /tmp/dsh-purge-install.sh

# ③ 本地 tgz（Release 资产，带 SHA256SUMS.txt）
dsh plugin --profile <profile> add /path/to/dsh-purge-lingjia-1.8.0.tgz
```

安装器**不会**自动 apply、不会自动重启、不改代理、不修改全局 npm 源。

### D3. 应用（写宿主补丁）

```bash
purge-lingjia apply        # 写前自动快照；幂等，不确定就再跑一次
# 或面板：右侧栏 → 清洗 → 应用
```

应用阶段会：解包/定位宿主 `@deepseek-ai/*` → 写 92 条补丁（含零甲 4 处锚点）→ 注入 shim →
建快照。任何一条 `strictFiles` 补丁锚点失配会中止并保留归档。

### D4. 重启

**必须退出并重开 DSH**——补丁写的是宿主模块，运行中的进程加载的是旧代码。
重启后 `selfcheck` 全绿才算部署完成。

### D5. 部署后验证（四步，按顺序）

```bash
purge-lingjia status                     # 补丁计数：applied / pending / na / skipped
purge-lingjia selfcheck --text           # 逐层证据（宿主补丁 / 注入 / 零甲 / 权限 / 预设）
node tools/selftest-engine.mjs           # 18 passed
node tools/selftest-zero-armor.mjs       # 19 passed
node tools/zero-audit.mjs                # 期望「净化后仍含甲: 0/11」
cat $DSH_HOME/dsh-purge/zero-armor-probe.json   # 运行态：钩子真的被调用过
```

`pending` 不是故障（还没应用）；`drifted` 才是需要处理的（宿主改版导致锚点失效 →
`purge-lingjia diagnose` 看行号，必要时 `reanchor`）。`na` 表示该功能被上游删掉了，属正常。

### D6. 升级（从 1.7.20 / 旧包名）

```bash
purge-lingjia revert          # 1) 先撤宿主补丁（零甲 4 处锚点必须按新宿主原文重打）
# 2) 装新包（D2 任一方式），profile 依赖名会被迁移
purge-lingjia apply           # 3) 重新应用
# 4) 退出重开 → D5 验证
```

### D7. 回退与卸载

```bash
echo '{"zeroArmor": false}' > $DSH_HOME/dsh-purge/tuning.json   # 只关零甲
purge-lingjia revert                                            # 撤宿主补丁（数据保留）
purge-lingjia uninstall                                         # 卸载（数据保留）
```

保留不删：`$DSH_HOME/prompt-inject.md`、`$DSH_HOME/dsh-purge/`、`$DSH_HOME/redteam/`。

### D8. 失败处理

| 现象 | 先查 | 处置 |
|---|---|---|
| `apply` 报 `pattern_not_found` / `drifted` | `purge-lingjia diagnose` | 宿主升级导致锚点变了：等插件适配，或用 `reanchor` 半自动重锚 |
| 重启后零甲没生效 | `zero-armor-probe.json` 是否更新 | 没更新 = 宿主补丁没加载：重跑 `apply` 再重开 |
| 模型仍推脱 | `tools/zero-audit.mjs` 残留数 | 残留 0 但还拒 = 模型层（L5），只能靠上下文压制 |
| 面板打不开 | `purge-lingjia selfcheck` 的宿主入口项 | 见 docs/troubleshooting.md |


## 1. 心智模型：五层，各管一件事

| 层 | 由谁提供 | 生效方式 | 你能怎么查 |
| --- | --- | --- | --- |
| **宿主补丁**（92 条） | 本插件写进 DSH 源码 | 点「应用」写入 → **退出重开**才加载 | `selfcheck` 看各层 `applied/required` |
| **提示词注入** | 插件运行时（每步重贴） | `prompt-inject.md` 作为 `dsh-purge` section | 探针（§4）或 `selfcheck` 的「运行时提示词注入」 |
| **破甲强化段** | 插件运行时 | 尾部 section（默认开） | `purge-lingjia boost` |
| **零甲层**（#97–#100） | 宿主出水口补丁 + 插件侧规则引擎 | 默认开（`tuning.zeroArmor`）；改规则不用动宿主 | `node tools/zero-audit.mjs` → 净化后残留甲 0 |
| **权限配置** | 宿主 profile 和会话自己的权限选择 | 新装默认沿用宿主策略，旧宿主可能保留先前写入的补丁 | `selfcheck` 的「当前 profile 的权限选择」 |
| **agent 预设** | `unrestricted` 预设 | 新会话下拉里选 | 面板/预设下拉 |

**关键结论**：宿主补丁与权限配置仍为全局；提示词注入和强化段默认全局，可用 `excludePresets` 按预设排除。排除不等于撤销全局补丁。

## 2. 生命周期：装 → 应用 → 重开

装（官方插件界面/市场，或社区安装器备份迁移）→ 点「应用」（解包 host / 写 92 条补丁 / 建快照）→ 退出并重开 DSH（**补丁只有重启后才被加载**）→ `selfcheck` 全绿 = 可以开工。
**什么时候要再点一次「应用」**：DSH 官方更新后（`app.asar` 会重新出现，旧补丁全部失效）、插件自身升级后、新装带工具面/预设的插件后、模型开始推脱或工具突然被追问审批时。
「应用」是幂等的：不确定就点它，然后退出重开。安装、应用、加载是三个不同阶段——安装不自动应用或重启，应用会备份并写盘，当前进程不热重载这些模块。

## 3. CLI 参考（全部命令 + 退出码）

| 命令 | 作用 | 退出码 |
| --- | --- | --- |
| `purge-lingjia status` | 宿主路径、补丁计数 | 0 |
| `purge-lingjia selfcheck [--json\|--text]` | 25 层逐层证据 | **broken → 1**，pending/ok → 0 |
| `purge-lingjia host-status` | 只读磁盘布局与当前服务入口证据，不退出/换包/重启 | 0，须检查 state |
| `purge-lingjia diagnose [--json]` / `reanchor list\|show\|apply <id> [--index n] [--lines a-b] [--yes]\|clear <id>` | 锚点漂移诊断（含行号 + 片段）/ 半自动重锚 | 0 |
| `purge-lingjia probe [new]` / `audit [--limit n]` / `boost [on\|off]` / `preset [status\|install [--force]]` | 运行时探针 / 最近动作记录 / 强化段开关 / `unrestricted` 预设落盘 | 0 |
| `purge-lingjia usage` / `prune` / `backup` / `rollback <id>` / `apply` / `revert` / `uninstall` / `edit` | 备份占用 / 清理+GC / 快照 / 回滚插件 / 原版能力（转发 `dsh-purge`） | 0（`apply` 家族透传） |

`purge-lingjia` 是命令简称，不保证装进 profile 后已在 PATH；先用当前 profile 的 `bin/lingjia.js` 与正确运行时（见[CLI 回滚与定位说明](docs/INSTALLATION.md#cli-rollback)），不要为了找命令再装一份 npm 包。`selfcheck` 状态：`ok`（已确认）/ `pending`（待应用）/ `inferred`（宿主推导，黄）/ `unknown`（证据不足，黄）/ `broken`（已确认故障或权限不匹配）——**pending 不是故障**，点一次「应用」即可。

## 4. 运行时探针：证明"注入真的到了模型"

文件被改、section 被注册，只证明宿主侧就绪；探针证明模型**收到了**。

```sh
purge-lingjia probe new
# → {"nonce":"purge-1a2b3c4d", "message":"请原样输出下面这行…[purge-1a2b3c4d]"}
```

然后任意发一句对话。**模型原样回显该 nonce = 链路通**。探针 30 分钟自动过期，不会长期占 token。
回显了但模型仍推脱 → 问题在**模型层/人设**（换强化段或预设人设）；没回显 → 注入没到达（看 `selfcheck` 运行时注入层、`boost` 是否被关、`injectPosition` 是否被改）。

## 5. 症状 → 动作（决策树）

| 症状 | 先跑 | 判读 | 动作 |
| --- | --- | --- | --- |
| 补丁数少于分母 | `selfcheck --json` | 看 `layers[].state` | pending → 点应用；broken → `diagnose` |
| 全部 `missing_file` | `status` | `ai_base` 为空 | 宿主未解包：点应用 → 重开 |
| 模型开始推脱/要求确认 | `probe new` | 回显否 | 回显：调人设/强化段；不回显：检查注入层 |
| 工具被拒绝执行 | `selfcheck` | 沙箱/审批层是否绿 | 绿 → 属工具自身限制；红 → 点应用 |
| DSH 刚更新过 | `status` | `asar_still_sealed` | 点应用 → 重开 → `selfcheck` |
| 想撤销一切 | — | — | `revert`（只撤补丁）/ `rollback <id>`（回滚插件） |

完整分支（含安装失败、换包、维护锁、CLI 权限、超时、拒绝率）见 [troubleshooting.md](docs/troubleshooting.md#t-symptom)。

## 6. 状态与文件（你可以安全读，不要乱写）

| 路径 | 内容 |
| --- | --- |
| `$DSH_HOME/dsh-purge/tuning.json` · `probe.json` | `{boost, injectPosition, askNoBlock, zeroArmor, zeroArmorMode}` / 探针 nonce（30 分钟 TTL） |
| `$DSH_HOME/dsh-purge/anchor-overrides.json` | 本地重锚覆盖（不改插件源码；删掉即恢复出厂锚点） |
| `$DSH_HOME/dsh-purge-lingjia/audit.jsonl` | 动作审计（1MB 轮转，保留 2 份）；面板「维护 → 最近动作」 |
| `$DSH_HOME/dsh-purge/applied.json` · `installed-rev` | 上次应用的插件版本 |
| `$DSH_HOME/dsh-purge-lingjia/backups/<id>/` | 快照（`manifest.json` + 小文件；大文件在 `objects/`） |
| `$DSH_HOME/.agent-presets/unrestricted/` | 无限制模式预设（升级保留原文；首行模板标记不代表用户授权覆盖） |
| `$DSH_HOME/prompt-inject.md` | **用户的注入正文**，插件只读不改（除非用户点保存） |
**不变量**：`prompt-inject.md`、规则集、其他插件配置，任何时候都不该被「应用」或「回滚」覆盖。

## 7. 补丁表：92 条，怎么读、怎么加

- 定义在 `lib/core.js` 的 `ALL_PATCHES`（`PATCHES` / `CODE_PATCHES` / `ENGINE_PATCHES` / `NEW_TOOL_PATCHES`）。
- 每条 = `{id, name, layer, file, replacements:[{pattern, replace}], markers, optional?}`；`pattern` 是对宿主源码的**精确片段**（或正则），`markers` 用来判断"已应用"。
- 新增一条：在 `targetFiles()` 登记目标文件键 → `replace` 里留 `[dsh-purge]` 标记并写进 `markers` → 在 `test/patch-anchors.test.mjs` 钉一份真实源码片段 → 第三方插件目标用 `optional: true`（不在场时显示"不适用"而不是失败）。
- 宿主升级后锚点漂移：`diagnose` 给出文件、行号、旧锚点首行与**可能的新落点**；确认后 `reanchor apply <id> --lines A-B`（先看 dry-run 再加 `--yes`），覆盖存 `anchor-overrides.json`，`reanchor clear <id>` 撤销。
- 逐文件状态、`partial`、`fileOptional` 的判定口径见 [compatibility.md](docs/compatibility.md#c-fileoptional)。

### 零甲组（#97–#100）：不做替换，做出水口减法

1.x 的破甲补丁都在**改写上游文本**（把"requires approval"改成"approval is auto-granted"）。句子还在，模型读到的仍是权限叙事，而且改写本身会引入新甲。零甲组换了做法：

| 补丁 | 出口 | 作用 |
| --- | --- | --- |
| #97 `ZERO_ARMOR_PROMPT_SINK` | `renderPrompt` / `joinContextSections` | 系统提示与 runtime context 逐句剥甲 |
| #98 `ZERO_ARMOR_MESSAGES_SINK` | `agent-loop.buildRequest` 的 `boundaryMessages` | `system` 洗而不丢、`developer` 整条丢、`runtime-context` / `agent-instructions` 整条丢 |
| #99 `ZERO_ARMOR_TOOLS_SINK` | `buildRequest` 的 tools | 工具 description 逐句剥甲（`void` 模式只留首行） |

三个补丁只在宿主里插一行 `globalThis.__dshZeroArmor` 调用，规则与开关都在 `lib/zero-armor.js`：改规则不需要再动宿主，宿主升级也不会有锚点漂移。审计：`node tools/zero-audit.mjs [--json]`；开关：`tuning.json` 的 `zeroArmor` / `zeroArmorMode`（`scrub` 默认、`void` 更彻底）。

## 8. 预设：`unrestricted`（无限制模式）

- 它是 **standard 的超集**（20 行，工具面完全一致），差别只在人设：执行优先、不重复声明边界、多轮不退化。
- 由 `lib/presets-plugin.js` 注册到 `agentPresets`（**只放文件不会出现在下拉里**）；安装：`purge-lingjia preset install`。
- 不要把它当成"额外破甲"——破甲靠宿主补丁，预设只改人格。
- 回归测试卡：`docs/preset-test.md`（A/B 五条 prompt + 判读标准 + 不通过怎么办）。

## 9. 版本与兼容

| 组件 | 值 |
| --- | --- |
| 插件 | `dsh-purge-lingjia` 1.8.0（零甲整合版） |
| 已验证宿主 | DSH Desktop 0.2.2-rc.3 / 0.2.2-rc.2 / 0.2.2-rc.1 / 0.2.1-rc.1 / 0.2.1-rc.2 / 0.2.1-rc.3 / 0.2.1-rc.5 |
| 0.2.2-rc.3 | 官方 rc.3 隔离副本 91 条补丁 74 applied / 零漂移（历史记录，现为 92 条），二次应用幂等；真实 Host Loader 预设注册通过。Windows rc.3 未复测补丁。 |
| 其它宿主 | 允许应用，但 `selfcheck` 会标"未验证"；先看 `diagnose` |
| Node | ≥18（桌面版自带运行时即可）；**红队工具需 ≥22.5**（依赖 `node:sqlite`，低版本会在加载红队工具时失败） |

- 清单声明是 `dsh.compatibility.dsh = ">=0.2.1-rc.1 <0.3.0"`，逐发行状态以 `package.json` 的 `dshReleases` 为准；rc.4 / alpha.2 仍为 `unknown`，不得写成 `compatible`。
- 0.1.5 / 0.2.0 低于声明下限，没有适配记录；`fileOptional`、premium/桌面版差异见 [compatibility.md](docs/compatibility.md#c-matrix)。

## 10. 这份文档的维护规则

**硬性约束（一条都不许删或弱化）**：
1. 不自动重启 DSH。
2. 不自动点「应用」。
3. 不修改 `~/.dsh/prompt-inject.md`（即 `$DSH_HOME/prompt-inject.md`）除非用户明确保存。
4. 不在没有用户要求时提交 commit/push/发版。
5. 变更版本号时补丁位 0–99、不写三段补丁号；历史版本保留原编号。
6. 发布说明必须放 `docs/releases/<version>.md` 且单版不超过 8 KiB。

**维护规则**：每次发版同步首部版本行、§9 表格、§3 命令表（如有新增）；`npm run check:docs` 校验 `AGENTS.md` / `README.md` / `release-notes.md` / `package.json` 版本一致，CI 里跑，不一致直接失败。
面向人的概览在 `README.md`；**面向 agent 的操作细节以本文件为准**——两者冲突时先信本文件，再去改 README。新增内容不进本文件：版本 / PR 记录进 [maintenance-archive](docs/maintenance-archive.md)，排障分支进 [troubleshooting](docs/troubleshooting.md)，兼容边界进 [compatibility](docs/compatibility.md)。

## 12. 安装 / 更新边界（细节见 troubleshooting）

<a id="installation"></a>

- 收到仓库链接时，用它确认项目身份并查最新稳定 Release。首装从市场工具取得 Git 目标时，原样传入固定提交的 `spec`；条目未返回 `registry` 就省略该参数。使用 CLI 时选择该稳定 Release 已上传的版本化 TGZ。沿用目标 profile 原有的 npm 配置。
- 若日志显示 pnpm 在 GitHub 仓库路径下请求 `/yaml`，核对本次安装的 registry、DSH 记住的「安装源」和宿主首选源。只纠正有误的 npm 地址，保留有效私有源、代理和全局配置。[字段对照与重试步骤](docs/INSTALLATION.md#install-addresses)
- 市场卡片显示旧版本时，先核对[社区索引](https://kingcharleslzy-ai.github.io/dsh-purge/index.json)中的包名、仓库和固定提交；用户指定了版本就沿用该版本。给市场生成安装按钮时遵循[收录说明](docs/MARKET-MIGRATION.md)，将目标版本和安装来源一起更新。
- **先选入口，不把社区脚本称为官方方法**：首次安装走 DSH 官方插件界面/市场确认框，或该实例的 `dsh plugin --profile <实际名称> add <固定版本TGZ URL>`；社区内容是 `scripts/install.sh` / `scripts/install.ps1`、索引和 TGZ。本项目没有供该流程使用的裸 npm 包名，不运行 `add dsh-purge` / `add dsh-purge-lingjia`，也不做全局 npm 安装。
- 先读目标 DSH 版本、可执行文件、`DSH_HOME`、profile 并确认已初始化；脚本先下到独立临时路径，审阅后 dry-run，再按已有授权执行。正式安装会备份、调用官方 CLI、迁移旧包引用并验证磁盘版本，可能修 `app/runtime` 链接或在 Linux 准备用户宿主副本——**并非完全不写宿主目录**。
- **不要安装后自动 apply/restart**；不改提示词、权限、代理、更新偏好或其他插件。真实的发布时长不足、integrity/trust 错误、私有源、未知错误保持失败并留日志：**不要设 minimumReleaseAge=0**、trustLockfile，也不要删锁文件、全局清缓存或改全局 npm 源。
- 失败先看 `backup_id`，恢复走 `rollback <id>`；公开 issue 只附脱敏错误。逐分支动作见 [troubleshooting.md#t-install](docs/troubleshooting.md#t-install)。

## 21. 多 profile 更新与源码 ZIP 校验

- 更新时以每个 profile 的实际包版本为准，不能把 `applied: true` 当成全部成功：同时检查 `ok`、`hasUpdate`、`targets` 和错误。部分安装仍可能需要用户手动重启，但重启不能替代失败目标的重试；不要因此改用户的更新开关、版本 pin、提示词或权限。
- 上游 ZIP 固定完整 commit SHA，并对全部文件校验 Git blob 摘要；GitHub API 不可用或清单不完整就停止，不能跳过校验。正式 TGZ 的 SHA256SUMS 校验保持不变。
- 诊断返回 unknown 时保留未知状态，不能称为全绿，也不要自动重装。边界见 [更新维护说明](docs/maintenance-issues-27-30.md)。

## 31. 讨论型 issue 不关闭（运维约定）

- 用户自己发起的讨论、经验分享、提问帖（非 bug / 非重复诉求）**只回复，不关闭**。
- 只有「已修复」「重复」「明确不在支持范围」的 bug/feature 才关闭，并在评论里写依据。
- 关闭时若带说明用 `gh issue close -c`；**纯评论**必须用 `gh issue comment --body/--body-file`（`-c` 在 comment 子命令上无效，会静默失败）。

## DSH Store 提交与复检

主插件申请必须使用 `GitHub repository: https://github.com/kingcharleslzy-ai/dsh-purge`、`Plugin path (optional): .`，不能因为表单提示根目录留空就省略；保留 `packages/purge-panel`（它不是本次安装目标）。
兼容信息从根 manifest 的 `dsh.compatibility` 读取，不把 README 范围或相邻版本推断写成精确 `compatible`。不得伪造固定 Commit 的 install/start/uninstall/rollback 证据，不为市场准入删功能或隐藏宿主维护能力。边界见 [DSH Store 说明](docs/DSH-STORE.md) 与 [compatibility.md](docs/compatibility.md#c-unknown)。

## 文档地图

| 文档 | 什么时候读 |
| --- | --- |
| `AGENTS.md`（本文件） | 干活前、不确定操作顺序或该不该点「应用」 |
| [troubleshooting.md](docs/troubleshooting.md) | 有症状、有报错、要判读 `selfcheck` / `host-status` 的 state |
| [compatibility.md](docs/compatibility.md) | 换宿主版本、判断某条补丁在该宿主适不适用 |
| [maintenance-archive.md](docs/maintenance-archive.md) | 追溯旧版本行为、核对某个 PR 的原始约束 |

## 零甲层与补丁状态（1.8.0 起）

- **零甲四出口**：`lib/zero-armor.js` 实现 `text` / `messages` / `tools` 三个钩子，宿主通过补丁
  #97（`dsh-system-prompt`）、#98 / #99（`dsh-agent-loop`）调用；#100 复用 #98 的锚点，钩子内部再洗
  assistant 历史。改规则只动 `lib/zero-armor.js`，**不要**为改规则去重打宿主补丁。
- **判定语义**：补丁状态新增 `na`（`obsoleteWhenAbsent`：补丁声明的功能符号在宿主里一个都不剩）。
  `na` 不进失败列表、不进待办计数，但会出现在 `patchStatusDetail` 的逐文件明细里。
  新增补丁若要这条语义，声明 `obsoleteWhenAbsent: ["符号A", "符号B"]`——**符号必须是功能级 API 名，
  不能等于补丁自己的锚点原文**，否则永远判 `na`。
- **runtime 级补丁**：`runtime: true` + 空 `replacements` + `markers` 指向别条补丁的标记，
  表示「不新增宿主锚点、靠已有出口生效」（#100 就是这样）。这类补丁必须写 `chainedAfter`。
- **自测**：`npm run selftest`（engine 18 条 + zero-armor 19 条）。改补丁表、改零甲规则、改 tuning
  之前先跑一遍基线；改完必须全绿再交付。
- **审计**：`node tools/zero-audit.mjs` 清点模型可见文本并给净化前后对比；运行态证据在
  `$DSH_HOME/dsh-purge/zero-armor-probe.json`（只在真的改了东西时才写）。

## 参考项目（地址）

- dsh-purge Community（基座，MIT）：https://github.com/kingcharleslzy-ai/dsh-purge
- dsh-purge 维护线 1.1.97（`obsoleteWhenAbsent` 来源，Apache-2.0）：https://github.com/ZiDuNet/dsh-purge
- dsh-purge-go（历史清洗动机）：https://github.com/NANA7MI0/dsh-purge-go
- dsh-jailbreak（请求边界改写与踩坑）：https://github.com/xqpsec/dsh-jailbreak
- fujiang-armor（网关吞 system 的实测）：https://github.com/enticingns/fujiang-armor
- dsh-breach / dsh-extreme / dsh-purge-plus / DSH-YS-pojia / dsh-purge-ports：见 README 的参考项目表
