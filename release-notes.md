# 1.8.0

## 中文

- **新增零甲层（#97–#100）**：不再只改写宿主里的限制句，而是在模型请求的四个出口做**整句删除**——
  #97 系统提示 / runtime context、#98 消息（丢 developer 与非用户来源的 user）、#99 工具 schema
  （含参数级 description 下钻）、#100 历史拒绝清洗（删 assistant 消息里的拒绝句，保住 roles 交替）。
  设计、规则、处置表、开关、回退：`docs/zero-armor.md`。
- **移植 `obsoleteWhenAbsent`**（思路来自 ZiDuNet/dsh-purge 1.1.97，Apache-2.0，按本仓库引擎重写）：
  补丁可声明「这个功能没了这些符号就是被上游删了」。符号全消失 → 判 `na`（不适用），不再永久
  `drifted` 污染状态页。已给 7 条补丁声明符号（#56/#77/#87/#88/#89/#91/#92）。
- **补丁 #100 ZERO_ARMOR_HISTORY_SINK**：runtime 级补丁，复用 #98 的宿主锚点，行为由
  `tuning.historyScrub` / `historyScrubDrop` 控制（默认开 / 默认不删整条）。
- **新增自测**：`tools/selftest-engine.mjs`（18 条，含真实引擎复核：合成宿主树上判 `na` 而非 `drifted`）、
  `tools/selftest-zero-armor.mjs`（19 条，四出口行为断言）。`npm run selftest` 一把跑完。
- **整合为单一包并定名**：项目名 **dsh-purge-零甲**，包名 `dsh-purge-lingjia`（ASCII 拼音标识），补丁表、零甲、演练台、
  提示词三级槽、拒绝重试、备份回滚同包分发；旧包名保留为兼容别名，旧安装可原地升级。
- 文档：README 重写为整合版；新增 `docs/zero-armor.md`、`CHANGELOG.md`、`scripts/set-repo-owner.mjs`。

## English

- New zero-armor layer (#97–#100): delete armor sentences at the four outbound sinks instead of rewriting
  them — system prompt / runtime context (#97), messages (#98), tool schemas incl. parameter descriptions
  (#99), assistant history refusal sentences (#100). See `docs/zero-armor.md`.
- Ported `obsoleteWhenAbsent` (idea from ZiDuNet/dsh-purge 1.1.97, Apache-2.0, reimplemented here): a patch
  whose declared feature symbols are all gone reports `na` instead of drifting forever. Declared on
  #56/#77/#87/#88/#89/#91/#92.
- #100 `ZERO_ARMOR_HISTORY_SINK`: runtime patch riding on #98's anchor, controlled by `tuning.historyScrub`
  / `historyScrubDrop`.
- New selftests: `tools/selftest-engine.mjs` (18) and `tools/selftest-zero-armor.mjs` (19); `npm run selftest`.
- Consolidated single-package distribution; repo identity `dsh-purge-lingjia`, package name unchanged.
