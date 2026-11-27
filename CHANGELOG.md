# CHANGELOG

本文件只记本仓库（dsh-purge-零甲）的改动；1.7.20 及更早的历史见
[release-notes.md](release-notes.md) 与 [docs/releases/](docs/releases/)。

## 1.8.0

### 新增

- 零甲层（zero-armor），四个出模型前的出口：
  - `#97 ZERO_ARMOR_PROMPT_SINK` — system prompt / runtime context 文本洗净
  - `#98 ZERO_ARMOR_MESSAGES_SINK` — 消息层丢甲（developer / 非用户来源 user）
  - `#99 ZERO_ARMOR_TOOLS_SINK` — 工具 schema 洗甲（含参数级 description）
  - `#100 ZERO_ARMOR_HISTORY_SINK` — assistant 历史拒绝句清洗
- `lib/zero-armor.js` 规则引擎（六类甲、整句删除）+ `tools/zero-audit.mjs` 静态审计。
- `tuning.json` 新增 `historyScrub` / `historyScrubDrop`。
- `tools/selftest-engine.mjs`、`tools/selftest-zero-armor.mjs`，`npm run selftest` 一把跑完。
- `docs/zero-armor.md` 设计说明。

### 变更

- 补丁状态机新增 `na` 语义（`obsoleteWhenAbsent`）：功能被上游删掉 → 不适用，不算漂移。
  已声明符号：#56 #77 #87 #88 #89 #91 #92。
- 项目名定为 **dsh-purge-零甲**，包名 `dsh-purge-lingjia（ASCII 拼音标识）`；旧包名 `dsh-purge-community` / `dsh-purge` 保留为兼容别名，旧安装可原地升级。
- 数据目录沿用旧名的（若已存在），避免把备份/对象库/preset 迁移记录搬到孤儿路径。
- README 重写为整合版；`scripts/check-docs.mjs` 改为从 `package.json` 派生仓库地址。

### 兼容

- DSH `>=0.2.1-rc.1 <0.3.0`，实测 0.2.2-rc.5。
- 从 1.7.20 升级：先 `revert` 再装、再 `apply`（零甲 4 处锚点需按新宿主原文重打）。
- 从 1.7.20 升级不丢数据：`$DSH_HOME/dsh-purge-lingjia/` 与 `$DSH_HOME/dsh-purge/` 都会被继续使用。
