# dsh-purge-零甲

**DeepSeek Harness 破甲插件 · iOS RootHide 越狱环境实测 · DSH 0.2.2-rc.5 · 零甲层四出口删甲**

<p>
  <img alt="version" src="https://img.shields.io/badge/version-1.8.0-7c3aed">
  <img alt="platform" src="https://img.shields.io/badge/platform-iOS%20%C2%B7%20RootHide%20jailbreak-111111">
  <img alt="dsh" src="https://img.shields.io/badge/DSH-0.2.1--rc.1%20…%200.2.2--rc.5-0ea5e9">
  <img alt="node" src="https://img.shields.io/badge/Node.js-%E2%89%A518-339933">
  <img alt="license" src="https://img.shields.io/badge/license-MIT-65a30d">
  <img alt="patches" src="https://img.shields.io/badge/host%20patches-92%20%2F%204%20sinks-14b8a6">
  <img alt="release" src="https://img.shields.io/github/v/release/axisovo/dsh-purge-lingjia?label=release">
</p>

**1.8.0**（当前版本）· 适配 **DSH Desktop 0.2.2-rc.5**（0.2.2-rc.1/rc.2/rc.3、0.2.1-rc.1/rc.2/rc.3/rc.5 同样通过）

## 运行环境（先看这个）

> ### 实测环境：iPhone · **RootHide 越狱**（jbroot 容器 / AppGroup 路径）· DSH **0.2.2-rc.5** web profile · Node 24（`--jitless`）
>
> 本仓库 **92 条宿主补丁、零甲层 #97–#100、四个自测脚本的全部数字，都是在这台 iOS RootHide 越狱机上跑出来的**：
> 宿主源码位于 `…/AppGroup/.jbroot-*/var/mobile/dsh/dsh-ios/dsh/node_modules/@deepseek-ai/`，
> 数据目录位于同一 jbroot 下的 `dsh-home/`，插件通过 `web` profile 加载。
>
> **为什么强调环境**：iOS 上的 DSH 是自带 Node 运行时（`--jitless`，无 WebAssembly）的定制包，
> 进程空间、路径、重启方式都和桌面端不同；越狱环境（RootHide / jbroot）额外引入 AppGroup 路径与权限差异。
> 换环境不是「应该也能跑」，而是**锚点与自检结论都要重新验证**。
>
> 桌面端（macOS / Windows / Linux）与 CLI 路径来自上游通用实现，**未在本机复测**——按「未验证」对待，
> 详见 [docs/environments.md](docs/environments.md)。

**关键词 / Search**：dsh 破甲 · DSH 破甲插件 · DeepSeek Harness 破甲 · 越狱 iPhone 破甲 ·
iOS RootHide 插件 · jbroot DSH · dsh-purge 零甲 · prompt injection · jailbreak · zero-armor · 无限制模式

DeepSeek Harness 破甲插件。**dsh-purge-零甲** 在 [dsh-purge Community 1.7.20](https://github.com/kingcharleslzy-ai/dsh-purge) 的基础上做了三件事：

1. **补上零甲层**：不再只改写宿主里的限制句，而是在模型请求的**四个出口做整句删除**（#97–#100）；
2. **移植两条生态能力**：`obsoleteWhenAbsent`（功能被上游删掉时判 `na`，不再永久漂移）、历史拒绝清洗（多轮里拒过一次不再一路拒）；
3. **整合成一个包**：补丁表、零甲钩子、红队演练台、提示词三级槽、拒绝重试、备份回滚全部在同一个插件里，装一次就够。

```
system prompt / runtime context ─→ [#97 文本洗净]  ─┐
messages(deriveMessages)        ─→ [#98 消息丢甲]  ─┼─→ 模型
assistant 历史(拒绝句)          ─→ [#100 历史清洗] ─┤
tool schemas                    ─→ [#99 schema洗甲]┘
```

## 名称说明

- **项目名（展示名）**：`dsh-purge-零甲`，插件内所有面向人的文案都只用这个名字。
- **技术标识**：`dsh-purge-lingjia`（npm 包名 / node_modules 目录 / cordis 挂载名）。npm 与 GitHub
  仓库名不接受非 ASCII 字符，所以用「零甲」的拼音；两者是同一个东西，不是两个项目。
- **旧包名 `dsh-purge-community` / `dsh-purge`** 仅作为兼容别名保留在迁移逻辑里：已装 1.7.x 的机器
  能被识别、原地升级，不需要手改 profile。

---

## 参考过的项目（地址在此）

本项目站在这些实现与它们的实测记录上。思路引用与代码移植的边界见 [NOTICE.md](NOTICE.md)。

| 项目 | 地址 | 许可 | 参考了什么 |
|---|---|---|---|
| dsh-purge Community | https://github.com/kingcharleslzy-ai/dsh-purge | MIT | **本包的基座**：补丁表、提示词三级槽、备份回滚、红队演练台 |
| dsh-purge 维护线 1.1.97 | https://github.com/ZiDuNet/dsh-purge | Apache-2.0 | `obsoleteWhenAbsent` 漂移判定（按本仓库引擎重写） |
| dsh-purge-go | https://github.com/NANA7MI0/dsh-purge-go | AGPL-3.0 | 多轮「拒过一次一路拒」的实测，历史清洗的动机 |
| dsh-jailbreak | https://github.com/xqpsec/dsh-jailbreak | AGPL-3.0 | 请求边界改写的思路与踩坑（`new Request` 三参数被静默丢弃、网关吞 system） |
| fujiang-armor | https://github.com/enticingns/fujiang-armor | — | 中转网关整段替换 system 的实测：零甲在这个场景必须复测 |
| dsh-breach | https://github.com/zhuchongba-01/dsh-breach | MIT | 从 purge 剥离的破甲最小集（72 项）对照 |
| dsh-extreme | https://github.com/Alec-WangLi/dsh-extreme | MIT | 社区线 1.7.22 的漂移审计与 25 层自检做法 |
| dsh-purge-plus | https://github.com/EthanChewCN/dsh-purge-plus | MIT + Apache-2.0 | 双上游 vendor + overlay 锚点编辑 + 验收组守卫 |
| DSH-YS-pojia | https://github.com/yushang657/DSH-YS-pojia | Apache-2.0 | 三层破甲（宿主 / 消息层拒绝清洗 / 提示词）的能力面对照 |
| dsh-purge-ports | https://github.com/shenwei322/dsh-purge-ports | Apache-2.0 | 把破甲规则移植到其它宿主的做法 |
| yaklang/hack-skills | https://github.com/yaklang/hack-skills | MIT | 演练台技能库（103 个攻击 playbook） |
| yaklang/yak-skills | https://github.com/yaklang/yak-skills | MIT | Yaklang / Yakit 技能（12 个） |
| 原始 dsh-purge | 作者 小杨 / YuJunZhiXue（仓库已下线） | MIT | 概念与补丁表血统 |

---

## 1. 它做了什么

### 1.1 四层「甲」与处置

| 层 | 甲在哪 | 本包怎么处理 | 补丁 |
|---|---|---|---|
| L1 执行闸门 | 审批弹窗、`sandbox_permissions`、fs 围栏、escalation、`ask_user` 阻塞、工具结果修剪 | 全部拆除（沙箱直通、审批 never、围栏禁用、观察策略放行、等待上限） | #6–#17、#35、#62、#89 |
| L2 系统提示文本 | identity / persona / sandbox policy / approval policy / 免责句 | **#97 整句删**（不是改写） | #1–#5、#25、#26、#32–#34、#43、#53、#61、#76、#93 |
| L3 消息级注入 | runtime-context 快照、`agent-instructions`、`developer/message`、deliverables | **#98 整条丢**（用户来源保留） | — |
| L4 工具 schema | 工具/参数 description 里的审批、沙箱、禁制句 | **#99 逐句剥 / 首行化** | #36 也被零甲覆盖 |
| L4+ 历史 | assistant 自己说过的拒绝（多轮污染源） | **#100 删拒绝句**（默认不删消息，保住 roles 交替） | — |
| L5 模型权重 | RLHF 对齐出来的拒绝倾向 | 不可达；只能靠上下文压制 | — |

补丁表 **92 条**（`lib/patches/*.mjs`），本机实测 92 条判定 → 74 应用 / 13 不适用 / 2 关闭 / 3 跳过 / 0 漂移。

### 1.2 零甲层细节

规则、处置表、实测样本、开关、回退全在 **[docs/zero-armor.md](docs/zero-armor.md)**。要点：

- 六类甲：身份 / 授权 / 沙箱 / 免责 / 禁制 / 征询；
- **最小删除单位是整句**，不留残句（残句比原句更容易让模型读出「这里本来有个限制」）；
- 四个出口都在宿主把请求交给模型的**最后一个可改点**，钩子本体在插件侧：规则改了不用重打补丁，宿主升级也不会让锚点漂移；
- 开关：`$DSH_HOME/dsh-purge/tuning.json` 的 `zeroArmor` / `zeroArmorMode` / `historyScrub` / `historyScrubDrop`。

### 1.3 其余能力（继承自基座）

- **提示词三级槽**：面板输入框 > `prompt-inject.md` > 加密出厂槽（AES-256-GCM），被宿主回写冲掉也能恢复；
- **尾部强化段**：`boost.js` 把 override 段追加在 prompt section 尾部（长上下文里尾部指令更稳）；
- **拒绝重试**：`llm/stream` 钩子检测推脱开头 → 单次重跑（默认关，`tuning.json` 开）；
- **红队演练台**：资产测绘 / 知识库（SQLite + FTS5）/ 漏洞战果 / 攻击链 / 报告；
- **状态诊断与回滚**：逐条报告补丁状态（含 `na` 语义）、自动快照、一键回滚。

---

## 2. 安装

### 2.1 让 Agent 装（推荐）

```text
帮我把 https://github.com/axisovo/dsh-purge-lingjia 装到我这台机器的 DSH 上。
先读仓库 AGENTS.md 的「部署说明」，检查是否已装旧版（dsh-purge-lingjia，有就原地迁移、保留设置）。
装完跑一次 tools/selftest-engine.mjs 和 tools/selftest-zero-armor.mjs，把两条结果贴给我。
重启由我自己操作。
```

### 2.2 CLI

```bash
# macOS / Linux
curl -fsSL https://raw.githubusercontent.com/axisovo/dsh-purge-lingjia/main/scripts/install.sh -o /tmp/dsh-purge-install.sh
sh /tmp/dsh-purge-install.sh --dry     # 先看计划
sh /tmp/dsh-purge-install.sh
```

```powershell
# Windows 11 · PowerShell 5.1 / 7
$PurgeInstaller = Join-Path $env:TEMP 'dsh-purge-install.ps1'
Invoke-WebRequest -UseBasicParsing -TimeoutSec 90 -Uri 'https://raw.githubusercontent.com/axisovo/dsh-purge-lingjia/main/scripts/install.ps1' -OutFile $PurgeInstaller
powershell -ExecutionPolicy Bypass -File $PurgeInstaller -DryRun
powershell -ExecutionPolicy Bypass -File $PurgeInstaller
```

固定版本 tgz（Release 资产，带 SHA256SUMS）：

```
https://github.com/axisovo/dsh-purge-lingjia/releases/download/v1.8.0/dsh-purge-lingjia-1.8.0.tgz
```

### 2.3 界面里装

DSH → 插件 → 添加插件 → 填 `https://github.com/axisovo/dsh-purge-lingjia`。

### 2.4 安装边界（这些是承诺）

- 插件加载前若市场安装失败（issue #7），插件本身尚未运行；先读脱敏错误、核对依赖来源，不能承诺安装器能修复所有市场或网络错误。
- 不自动应用宿主补丁、不自动重启、不改代理、**不修改全局 npm 源**或清空缓存。脚本和 bootstrap 从本仓库 `main` 下载；Release 包另做 SHA256 校验，这不是对下载脚本的独立签名验证。
- 装完**不会**自己 apply、自己 restart：这两步留给你决定（`/purge apply` 或面板里的清洗按钮）。
- 只动本机 `@deepseek-ai/*` 包与本地配置；不上传提示词、配置或会话内容。

---

## 3. 使用

### 3.1 面板

会话标题旁的按钮打开右侧栏：**清洗**（补丁状态、应用、回滚、提示词编辑）+ **演练台**（资产、知识库、战果、攻击链、报告）。

### 3.2 命令

```
/purge status        补丁与注入状态（含零甲 #97–#100）
/purge apply         应用宿主补丁（写前自动快照）
/purge revert        回滚到备份原件
/purge edit          编辑 prompt-inject.md
/purge selfcheck     逐层自检：每层对应哪条补丁、这层没了会发生什么
```

### 3.3 开关

`$DSH_HOME/dsh-purge/tuning.json`：

| 键 | 默认 | 作用 |
|---|---|---|
| `zeroArmor` | `true` | #97–#99 总开关 |
| `zeroArmorMode` | `"scrub"` | `scrub` 逐句剥甲 / `void` 工具描述只留首行 |
| `historyScrub` | `true` | #100 历史拒绝清洗 |
| `historyScrubDrop` | `false` | 整条丢弃「只含拒绝」的 assistant 消息（Anthropic 形状端点上要小心） |
| `boost` | `true` | 尾部 override 段 |
| `injectPosition` | `"head"` | `head` / `tail` / `both` |
| `refusalRetry` | `false` | 推脱时单次重跑 |
| `contextManagement` | `false` | #18 重复调用提醒、#19 工具结果修剪 |

---

## 4. 验证

```bash
node tools/selftest-engine.mjs        # 18 条：obsoleteWhenAbsent 判定 + 补丁表完整性 + 真实引擎复核
node tools/selftest-zero-armor.mjs    # 19 条：四个出口的行为断言
node tools/zero-audit.mjs             # 静态审计：清点模型可见文本，给净化前后对比

# 文档与版本一致性（需要 yaml 解析器；自测本身零依赖）
npm i --no-save yaml && node scripts/check-docs.mjs
```

三个脚本都不碰宿主：`selftest-*` 是纯函数断言，`zero-audit` 只读宿主源码做静态清点。

本机实盘（DSH 0.2.2-rc.5 / iOS web profile）：

| 项 | 结果 |
|---|---|
| 宿主补丁 | 92 条定义 → 92 条判定 → **74 应用 / 13 na / 2 关闭 / 3 跳过 / 0 漂移** |
| 零甲锚点 | `dsh-system-prompt` 2 处、`dsh-agent-loop` 2 处，全部 `applied` |
| 文本审计 | 263 条模型可见文本，含甲 11 条 → 净化后残留 **0 / 11** |
| 运行态探针 | `messages 52→49 dropped 3`；`history rewritten N emptied M` |
| 自测 | engine **18/18**、zero-armor **19/19** |

---

## 5. 目录结构

```
lib/
  core.js              宿主定位、补丁应用、备份/回滚、状态机（含 na 判定）
  core/shared.mjs      补丁判定簇（patchApplied / obsoleteSymbolsAbsent …）
  core/verify.mjs      应用与汇总（applyReplacementsToText / rollupPatchStatus）
  patches/             92 条补丁：prompt / code / engine / new-tools / opt-in / stability / zero-armor
  zero-armor.js        零甲规则引擎 + 四个出口钩子 + 历史清洗
  tuning.js            插件自有开关（不进 profile YAML）
  boost.js             尾部强化段
  refusal-retry.js     拒绝检测 + 单次重跑
  redteam/             演练台（SQLite + FTS5 + 面板）
  index.js             插件入口：注入段注册、工具、命令、面板路由
tools/
  selftest-engine.mjs       引擎语义自测
  selftest-zero-armor.mjs   四出口行为自测
  zero-audit.mjs            静态审计
docs/zero-armor.md    零甲设计说明（规则、处置表、开关、回退）
docs/UPLOAD.md        上传 GitHub 前的 6 步清单
scripts/set-repo-owner.mjs  把 OWNER 占位符改成你的 GitHub 账号
.github/workflows/ci.yml    语法检查 + 两个自测 + 文档一致性
```

---

## 6. 回退

```bash
# 只关零甲，回到「补丁改写」行为
echo '{"zeroArmor": false}' > $DSH_HOME/dsh-purge/tuning.json

# 撤掉宿主补丁（保留 prompt-inject.md / 演练台数据 / 配置）
purge-lingjia revert

# 完全卸载（数据保留）
purge-lingjia uninstall
```

---

## 7. 许可与署名

- **MIT**，继承自上游 dsh-purge / dsh-purge Community；`LICENSE`、`NOTICE.md`、`CONTRIBUTORS.md` 原样保留。
- 本项目**不附加个人署名**，以项目名 `dsh-purge-零甲` 作为唯一标识。
- 参考项目与移植边界见上面的[参考项目表](#参考过的项目地址在此)与 [NOTICE.md](NOTICE.md)。
- 二开、换皮、搬运请保留来源与许可；不得倒卖原版。

## 8. 边界

它在**你自己的机器、你自己的安装**上改宿主源码，并替换系统提示里的身份、审批与沙箱段落。装之前请自行备份；虽然每条改动都留 `.dshpurge.bak` 并有一键回滚，但不保证与任意宿主版本兼容。

代码层能做到的极限是「发给模型的文本里不存在任何甲」。模型权重里的对齐倾向不在仓库里，没有补丁能删——零甲只能压制，不能删除。
