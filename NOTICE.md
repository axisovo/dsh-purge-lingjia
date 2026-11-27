# Attribution

dsh-purge Community is an independently maintained fork of **dsh-purge**, original author **小杨 / YuJunZhiXue**:
https://github.com/YuJunZhiXue/dsh-purge

Original copyright and MIT license remain in LICENSE. The repository preserves upstream history and source attribution. Upstream README text is retained under docs/upstream. This fork is free and not offered for paid resale; it is not endorsed by or an official release of the upstream author.

The native settings UI was derived from the original 1.1.71 client and subsequently separated and integrated into this community distribution. Existing third-party notices under docs/redteam-upstream-LICENSE and docs/redteam-upstream-DISCLOSURE remain applicable to their respective material.

Community contributors and their contributions are recorded in [CONTRIBUTORS.md](CONTRIBUTORS.md).

The test fixture `test/fixtures/agent-loop-022-native.json` contains method bodies from DeepSeek Harness `@deepseek-ai/dsh-agent-loop` 0.2.2-rc.1. Its original MIT license is preserved in `test/fixtures/agent-loop-022-LICENSE`. These methods are used only for isolated contract tests.

---

## dsh-purge-lingjia（本仓库）的追加署名

本仓库在 **dsh-purge Community 1.7.20** 之上做二开，新增与移植内容如下。上游版权、MIT 许可与
`CONTRIBUTORS.md` 记录全部原样保留。

| 新增/移植 | 来源 | 许可 | 说明 |
|---|---|---|---|
| 零甲层 #97–#99（`lib/zero-armor.js`、`lib/patches/zero-armor.mjs`） | 本仓库首创实现 | MIT（随本仓库） | 在宿主三个出水口做整句删除，替代「改写限制句」 |
| #100 `ZERO_ARMOR_HISTORY_SINK`（历史拒绝清洗） | 动机与实测来自 [NANA7MI0/dsh-purge-go](https://github.com/NANA7MI0/dsh-purge-go) 的「历史清洗」 | AGPL-3.0（仅动机，未复制代码） | 本仓库独立实现：按句删拒绝、默认不删整条 |
| `obsoleteWhenAbsent` 漂移判定 | [ZiDuNet/dsh-purge](https://github.com/ZiDuNet/dsh-purge) **1.1.97** | Apache-2.0 | 本仓库按自研引擎重写，语义对齐（符号全消失 → `na`），未复制其 `lib/rules.js` 代码 |
| 请求边界兜底的思路与踩坑记录 | [xqpsec/dsh-jailbreak](https://github.com/xqpsec/dsh-jailbreak) | AGPL-3.0（仅思路） | 记录在 README/CHANGELOG，未引入代码 |

若上述项目维护者认为署名或引用方式需要调整，请开 issue，本仓库会按对方要求修改或移除。

## dsh-purge-零甲（本项目）的参考项目与移植边界

本项目不附加个人署名，以项目名 `dsh-purge-零甲` 作为唯一标识。以下项目的实现与实测记录被参考过，
地址一并列出；上游版权、MIT 许可与 `CONTRIBUTORS.md` 记录全部原样保留。

| 项目 | 地址 | 许可 | 参考/移植了什么 |
|---|---|---|---|
| dsh-purge Community | https://github.com/kingcharleslzy-ai/dsh-purge | MIT | **基座**：补丁表、提示词三级槽、备份回滚、红队演练台 |
| dsh-purge 维护线 1.1.97 | https://github.com/ZiDuNet/dsh-purge | Apache-2.0 | `obsoleteWhenAbsent` 漂移判定（按本项目引擎重写，未复制其 `lib/rules.js`） |
| dsh-purge-go | https://github.com/NANA7MI0/dsh-purge-go | AGPL-3.0 | 「拒过一次一路拒」的实测；历史清洗动机（代码为独立实现） |
| dsh-jailbreak | https://github.com/xqpsec/dsh-jailbreak | AGPL-3.0 | 请求边界改写思路与踩坑记录（`new Request` 三参数被静默丢弃等） |
| fujiang-armor | https://github.com/enticingns/fujiang-armor | — | 中转网关整段替换 system 的实测（零甲在该场景必须复测） |
| dsh-breach | https://github.com/zhuchongba-01/dsh-breach | MIT | 破甲最小集（72 项）对照 |
| dsh-extreme | https://github.com/Alec-WangLi/dsh-extreme | MIT | 社区线 1.7.22 漂移审计与自检分层做法 |
| dsh-purge-plus | https://github.com/EthanChewCN/dsh-purge-plus | MIT + Apache-2.0 | 双上游 vendor + overlay 锚点编辑 + 验收组守卫 |
| DSH-YS-pojia | https://github.com/yushang657/DSH-YS-pojia | Apache-2.0 | 三层破甲（宿主 / 消息层拒绝清洗 / 提示词）能力面对照 |
| dsh-purge-ports | https://github.com/shenwei322/dsh-purge-ports | Apache-2.0 | 把破甲规则移植到其它宿主的做法 |
| yaklang/hack-skills | https://github.com/yaklang/hack-skills | MIT | 演练台技能库（103 个攻击 playbook） |
| yaklang/yak-skills | https://github.com/yaklang/yak-skills | MIT | Yaklang / Yakit 技能（12 个） |
| 原始 dsh-purge | 作者 小杨 / YuJunZhiXue（仓库已下线） | MIT | 概念与补丁表血统 |

若上述项目维护者认为署名或引用方式需要调整，请开 issue，本项目会按对方要求修改或移除。
