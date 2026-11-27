// 零甲审计：清点宿主里「模型可见」的文本，逐条判定是否含甲，并给出净化结果。
// 用法：node tools/zero-audit.mjs [--json]
import fs from "node:fs";
import path from "node:path";
import { hasArmor, scrubArmorText } from "../lib/zero-armor.js";

const AI_DEFAULT = "/private/var/mobile/Containers/Shared/AppGroup/.jbroot-6B7ED810276E8410/var/mobile/dsh/dsh-ios/dsh/node_modules/@deepseek-ai";
const AI = process.env.DSH_AI_BASE || AI_DEFAULT;

// 会进入模型上下文的包
const PACKAGES = [
  "dsh-system-prompt", "dsh-user-approval", "dsh-sandbox-policy", "dsh-harness-dev-context",
  "dsh-plan-mode", "dsh-tool-agent-team", "dsh-tool-bash", "dsh-tool-fs", "dsh-tool-fs-search",
  "dsh-tool-web", "dsh-tool-subagent", "dsh-tool-workflow", "dsh-tool-goal", "dsh-tool-jobs",
  "dsh-tool-schedule", "dsh-tool-ralph", "dsh-tool-terminal", "dsh-tool-session-query",
  "dsh-tool-ask-user", "dsh-agent-instructions", "dsh-client-ui-deliverables",
  "dsh-working-directory", "dsh-subagent", "dsh-skill-badge", "dsh-persona",
  "dsh-repeat-tool-reminder", "dsh-session-reference", "dsh-file-reference-local",
];

// 已知的「模型可见」常量名（section / context 正文）
const CONSTANTS = [
  "NEVER_SENTENCE", "ASK_SENTENCE", "HARNESS_SOURCE_PROMPT", "WEB_SURFACE_PROMPT",
  "PLAN_POLICY", "TEAM_POLICY", "SUBAGENT_DELEGATION_CONTEXT", "DELIVERABLES_PROMPT",
  "FILE_REFERENCE_PROMPT", "STRUCTURED_OUTPUT_INSTRUCTION", "GUIDANCE", "PROMPT_TEXT",
];

function extractStringAt(source, index) {
  const quote = source[index];
  if (quote !== '"' && quote !== "'" && quote !== "`") return "";
  let out = "";
  for (let i = index + 1; i < source.length; i += 1) {
    const ch = source[i];
    if (ch === "\\") { out += source[i + 1] ?? ""; i += 1; continue; }
    if (ch === quote) return out;
    out += ch;
  }
  return out;
}

function collect(pkg) {
  const file = path.join(AI, pkg, "lib/index.js");
  if (!fs.existsSync(file)) return [];
  const source = fs.readFileSync(file, "utf8");
  const found = [];
  // 1) 工具 / 参数 description 字面量
  const re = /\bdescription:\s*/g;
  let m;
  while ((m = re.exec(source))) {
    const at = m.index + m[0].length;
    const ch = source[at];
    if (ch !== '"' && ch !== "'" && ch !== "`") continue;
    const text = extractStringAt(source, at);
    if (text.length < 24) continue;
    found.push({ pkg, field: "description", text });
  }
  // 2) 已知常量
  for (const name of CONSTANTS) {
    const at = source.indexOf(`const ${name} = `);
    if (at < 0) continue;
    const start = source.indexOf("=", at) + 1;
    let i = start;
    while (i < source.length && /\s/.test(source[i])) i += 1;
    const text = extractStringAt(source, i);
    if (text.length < 24) continue;
    found.push({ pkg, field: name, text });
  }
  // 3) 内联模板：return / case 分支里直接吐给模型的策略文案（sandbox-policy 这类）
  const templateRe = /`((?:\\.|[^`\\]){40,2000})`/g;
  let template;
  while ((template = templateRe.exec(source))) {
    const body = template[1];
    if (body.includes("${")) continue; // 带变量的先跳过，避免噪声
    if (!/\b(policy|sandbox|approval|escalat|permission|writable|read-only)\b/i.test(body)) continue;
    found.push({ pkg, field: "inline-template", text: body });
  }
  return found;
}

const rows = [];
for (const pkg of PACKAGES) for (const entry of collect(pkg)) rows.push(entry);
const armorRows = rows.filter((row) => hasArmor(row.text));

const report = {
  scanned: rows.length,
  armor: armorRows.length,
  items: armorRows.map((row) => ({
    pkg: row.pkg,
    field: row.field,
    before: row.text.replace(/\s+/g, " ").slice(0, 200),
    beforeLength: row.text.length,
    after: scrubArmorText(row.text).replace(/\s+/g, " ").slice(0, 200),
    afterLength: scrubArmorText(row.text).length,
    residual: hasArmor(scrubArmorText(row.text)),
  })),
};

if (process.argv.includes("--json")) {
  console.log(JSON.stringify(report, null, 2));
} else {
  console.log(`扫描模型可见文本 ${report.scanned} 条，含甲 ${report.armor} 条\n`);
  for (const item of report.items) {
    console.log(`[${item.pkg} :: ${item.field}]  ${item.beforeLength} → ${item.afterLength} 字节  残留甲=${item.residual}`);
    console.log(`  前: ${item.before}`);
    console.log(`  后: ${item.after || "(整段删除)"}`);
    console.log();
  }
  const residual = report.items.filter((item) => item.residual).length;
  console.log(`净化后仍含甲: ${residual}/${report.armor}`);
  process.exit(residual === 0 ? 0 : 1);
}
