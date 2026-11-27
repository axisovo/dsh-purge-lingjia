# 运行环境与适配矩阵

> 本项目是 **iOS RootHide 越狱环境**下开发并验证的。这一页把「在哪儿验证过」和「没验证过」分开写清楚，
> 避免把桌面端的通用实现当成 iOS 上也成立。

## 一、实测环境（本仓库所有数字的来源）

| 项 | 值 |
|---|---|
| 设备 / 系统 | iPhone · **RootHide 越狱**（jbroot 容器，非 rootful 常规路径） |
| DSH | DeepSeek Harness **0.2.2-rc.5**，`web` profile |
| 运行时 | 包自带 Node **24**，以 `--jitless` 启动（**无 WebAssembly**，`fetch` 走 HTTPS shim） |
| 宿主源码位置 | `…/Containers/Shared/AppGroup/.jbroot-*/var/mobile/dsh/dsh-ios/dsh/node_modules/@deepseek-ai/` |
| 用户数据位置 | 同一 jbroot 下的 `…/var/mobile/dsh/dsh-ios/dsh-home/`（`profiles/`、`dsh-purge/`、`redteam/`） |
| 插件安装位置 | `…/dsh-home/profiles/web/node_modules/dsh-purge-lingjia/` |
| 重启方式 | 从多任务里划掉 DSH App 再重开（补丁写的是宿主模块，进程不热重载） |
| 验证日期 | 2026-11-27 |

实测结论（本机）：

```
宿主补丁：92 条定义 → 92 条判定 → 74 applied / 13 na / 2 disabled / 3 skipped / 0 drifted
零甲锚点：#97 #98 #99 #100 全部 applied（dsh-system-prompt ×2、dsh-agent-loop ×2）
文本审计：263 条模型可见文本，含甲 11 → 净化后残留 0
自测：engine 18/18、zero-armor 19/19
运行态探针：messages 52→49（dropped 3）、history rewritten ≥1
```

## 二、为什么 iOS + 越狱要单独声明

1. **Node 是定制构建**：`--jitless` 且没有 WebAssembly，所以：
   - 依赖 undici `fetch` 的脚本会直接报 `WebAssembly is not defined`（本仓库的推送脚本因此用 Python 标准库写，而不是 node）；
   - 任何依赖 WASM 的 OCR / 解析库在 iOS 上不可用。
2. **路径是 jbroot 结构**：宿主与数据都在 `AppGroup/.jbroot-*/` 下，`/var/mobile/...` 的常规路径不存在于同一命名空间。
   本仓库的宿主定位（`lib/core.js`）走的是 `DSH_HOME` 与 profile 探测，不写死路径。
3. **越狱环境差异**：RootHide 把越狱痕迹与 AppGroup 路径隐藏给未授权进程；插件必须运行在 DSH 自己的进程里，
   **不要**用外部越狱工具去改宿主文件（会被下一次「应用」覆盖，也可能因路径不可见而误判）。
4. **重启语义不同**：桌面端是退出进程，iOS 是划掉 App；`selfcheck` 的判断标准一样，但操作路径不同。

## 三、适配矩阵

| 环境 | 宿主补丁 | 零甲 #97–#100 | 状态 |
|---|---|---|---|
| **iPhone · RootHide 越狱 · DSH 0.2.2-rc.5（web）** | 74 applied / 0 drifted | 4/4 applied | **实测** |
| iPhone · 非越狱（TrollStore / 侧载 DSH） | — | — | 未验证（路径与权限不同，需重跑 `patchStatus`） |
| macOS 桌面端（DSH Desktop） | 上游声明兼容 | 未复测 | 未验证（锚点需按该版本原文核对） |
| Windows 11（PowerShell 5.1 / 7） | 上游声明兼容 | 未复测 | 未验证 |
| Linux CLI / Web | 上游声明兼容 | 未复测 | 未验证 |

> 「未验证」不等于不能用，而是**这个仓库没有在该环境给过证据**。换环境后请按
> [AGENTS.md 的 D5](../AGENTS.md#d5-部署后验证四步按顺序) 重跑四步：`status` → `selfcheck` → 两个 selftest → `zero-audit`。

## 四、换环境时的自检顺序

```bash
# 1) 宿主定位对不对（iOS 上必须是 jbroot 里的 @deepseek-ai）
purge-lingjia status

# 2) 逐层证据
purge-lingjia selfcheck --text

# 3) 纯函数自测（与宿主无关，任何环境都应全绿）
node tools/selftest-engine.mjs        # 18
node tools/selftest-zero-armor.mjs    # 19

# 4) 静态审计：模型可见文本里还有没有甲
node tools/zero-audit.mjs             # 期望 0/N
```

只要第 1 步定位到 `@deepseek-ai` 根、第 2 步 `applied` 占多数且 `drifted` 为 0，就说明这套锚点在该环境成立；
`drifted > 0` 表示那是另一个宿主版本，需要 `purge-lingjia diagnose` 看差在哪一行。
