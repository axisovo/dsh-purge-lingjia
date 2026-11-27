#!/usr/bin/env node
// scripts/set-repo-owner.mjs —— 上传前把 OWNER 占位符改成你的 GitHub 账号。
//
//   node scripts/set-repo-owner.mjs <github-owner> [--repo dsh-purge-lingjia] [--branch main] [--dry]
//
// 只改「本仓库自己的发行通道」这些文件，不动历史署名（CONTRIBUTORS / NOTICE / docs/upstream）：
//   package.json（repository / homepage / bugs / dsh.install）、README.md、README.zh-CN.md、
//   docs/README.en.md、client.js（面板里的仓库链接）、lib/community.js（更新通道 REPOSITORY）。
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const args = process.argv.slice(2);
const owner = args.find((a) => !a.startsWith("--"));
const flag = (name, fallback) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 && args[i + 1] ? args[i + 1] : fallback;
};
const repo = flag("repo", "dsh-purge-lingjia");
const branch = flag("branch", "main");
const dry = args.includes("--dry");

if (!owner) {
  console.error("用法: node scripts/set-repo-owner.mjs <github-owner> [--repo dsh-purge-lingjia] [--branch main] [--dry]");
  process.exit(2);
}
if (!/^[A-Za-z0-9](?:[A-Za-z0-9-]{0,37}[A-Za-z0-9])?$/.test(owner)) {
  console.error(`GitHub 账号格式不合法: ${owner}`);
  process.exit(2);
}

const slugPlaceholder = "OWNER/dsh-purge-lingjia";
const slug = `${owner}/${repo}`;

const targets = [
  "package.json",
  "README.md",
  "README.zh-CN.md",
  "docs/README.en.md",
  "client.js",
  "lib/community.js",
  "scripts/check-docs.mjs",
];

const changed = [];
for (const rel of targets) {
  const fp = path.join(root, rel);
  if (!fs.existsSync(fp)) continue;
  const before = fs.readFileSync(fp, "utf8");
  let after = before.split(slugPlaceholder).join(slug);
  // 更新通道的英文仓库名也要跟着换（scripts/install.* 与 raw 链接同源）。
  after = after.replaceAll("OWNER/dsh-purge-lingjia", slug);
  if (after === before) continue;
  changed.push(rel);
  if (!dry) fs.writeFileSync(fp, after, "utf8");
}
if (dry) {
  console.log(`[dry] 将修改 ${changed.length} 个文件：%s`, changed.join(", ") || "(无)");
  process.exit(0);
}
console.log(`已把 OWNER 替换为 ${slug}（分支 ${branch}），涉及 ${changed.length} 个文件：`);
for (const rel of changed) console.log(`  - ${rel}`);
if (changed.length === 0) console.log("（没有文件包含 OWNER 占位符，可能已经改过了）");
console.log("\n接着检查：");
console.log("  node scripts/check-docs.mjs   # 文档版本与安装链接一致性");
console.log("  npm run selftest              # 引擎 + 零甲行为自测");
