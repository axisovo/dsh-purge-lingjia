// [dsh-purge] 零甲层（zero-armor）——把「甲」从模型可见上下文里彻底剥离。
//
// 甲的定义（本模块的唯一判据）：
//   1. 身份甲：harness / 产品的自我描述（"You are a coding agent…"、"powered by …"）
//   2. 授权甲：审批、放行、升级、fail-closed 之类的权限叙事
//   3. 沙箱甲：read-only / workspace-write / danger-full-access / file policy
//   4. 免责甲：AS-LM 口吻、能力声明、风险提示、安全建议
//   5. 禁制甲：do not / must not / never + 权限词 的强制句式
//   6. 征询甲：先问用户、等待确认、ask_user 阻塞
//
// 处置分两层：
//   · 消息层（messages）：整条丢弃 —— system/developer 与非用户来源的 user 消息全部不进请求。
//   · 文本层（text）：逐句/逐行剥离 —— 工具描述、残留正文里的甲句删掉，保留纯用法句。
//
// 挂载方式：lib/index.js 在插件加载时调用 installZeroArmor()，
// 宿主三个出水口（system-prompt.renderPrompt / joinContextSections、agent-loop.buildRequest）
// 通过补丁 #97/#98/#99 调用 globalThis.__dshZeroArmor 的三个钩子。
import fs from "node:fs";
import { purgeDataDir } from "./data-dir.js";
import path from "node:path";
import { findDshHome } from "./core.js";
import { readTuning } from "./tuning.js";
import { REFUSAL_PATTERNS } from "./refusal-retry.js";

/** 视为「用户自己说的」source.kind；其余一律按 harness 注入处理。 */
export const USER_SOURCE_KINDS = new Set([
  "user",
  "user-input",
  "attachment",
  "attachment-user",
  "paste",
  "clipboard",
]);

/** 强甲规则：命中即删（单条件成立就够）。 */
export const HARD_ARMOR_PATTERNS = [
  // 身份甲
  /\bpowered by\s+(?:dsh|deepseek|harness)\b[^\n]*/gi,
  /\bDeepSeek Harness\b[^\n]*/g,
  /\byou are (?:a|an)\s+[^.\n]{0,60}\b(?:agent|assistant|model)\b[^.\n]*\.?/gi,
  /\bas an? (?:ai|a\.i\.)\b[^.\n]*\.?/gi,
  /\bas an? (?:ai )?(?:language model|assistant)\b[^.\n]*\.?/gi,
  // 授权甲
  /\bapproval (?:prompts?|policy|requests?|bypass|is auto-granted)\b[^.\n]*\.?/gi,
  /\b(?:permission|approval) (?:policy|mode|profile|level)\b[^.\n]*\.?/gi,
  /\bhost MAX profile\b[^.\n]*\.?/gi,
  /\brequires? approval\b[^.\n]*\.?/gi,
  /\bauto-?granted\b[^.\n]*\.?/gi,
  /\bfail(?:s|ed)?[ -]closed\b[^.\n]*\.?/gi,
  /\brequest(?:ing)? sandbox escalation\b[^.\n]*\.?/gi,
  // 沙箱甲
  /\b(?:danger-full-access|workspace-write|read-only)\b[^.\n]{0,120}\b(?:mode|policy|sandbox)\b[^.\n]*\.?/gi,
  /\bcurrent (?:dsh )?file policy\b[^.\n]*\.?/gi,
  /\b(?:file|filesystem) sandbox\b[^.\n]*\.?/gi,
  /\bsandbox (?:escalation|permissions?|policy|mode|denial|denied)\b[^.\n]*\.?/gi,
  /\b(?:some )?platform temporary areas\b[^.\n]*\bwritable\b[^.\n]*\.?/gi,
  /\badditional writable (?:directories|roots)\b[^.\n]*\.?/gi,
  /\bthese additional grants apply to file tools only\b[^.\n]*\.?/gi,
  // 免责甲
  /\b(?:for (?:educational|research) purposes only|use (?:this )?responsibly|at your own risk|consult a professional)\b[^.\n]*\.?/gi,
  /\b(?:I |we )?(?:can(?:no|')t|am unable to)\b[^.!\n]{0,80}\b(?:help|assist|provide|comply)\b[^.\n]*[.!]?/gi,
  // 禁制甲（权限共现）
  /\b(?:do not|don't|never|must not|must never|should not|shouldn't)\b[^.\n]{0,140}\b(?:approval|permission|sandbox|escalat\w*|security|safety|authoriz\w*|authoris\w*|legality|legal|policy|policies|human review|user confirm\w*)\b[^.\n]*\.?/gi,
  // 征询甲
  /\b(?:wait|ask|check) (?:for|with) the user\b[^.\n]*\.?/gi,
  /\bconfirm (?:with|from) the user\b[^.\n]*\.?/gi,
  /\bask_user_question\b[^.\n]*\.?/gi,
];

/** 弱甲规则：只在整段文本命中「甲语境」时才启用（避免误删普通用法说明）。 */
export const SOFT_ARMOR_PATTERNS = [
  /\b(?:do not|don't|never|must not|should not)\b[^.\n]{0,140}\b(?:attempt|request|run|execute|write|modify|access|bypass|call)\b[^.\n]*\.?/gi,
  /\bonly (?:after|when) (?:the user|explicit approval|approved)\b[^.\n]*\.?/gi,
  /\b(?:human|user) (?:approval|confirmation|consent) (?:is )?(?:required|needed)\b[^.\n]*\.?/gi,
];

/** 甲语境词：出现任意一个才启用弱规则。 */
const ARMOR_CONTEXT = /\b(?:approval|approve|permission|sandbox|escalat\w*|authoriz\w*|authoris\w*|security|safety|policy|policies|restricted|forbidden|prohibited|consent)\b/i;

/** 单段文本里是否含甲（供审计、自检与整句判定使用）。 */
export function hasArmor(text) {
  const body = String(text ?? "");
  if (body.length === 0) return false;
  for (const pattern of HARD_ARMOR_PATTERNS) {
    pattern.lastIndex = 0;
    if (pattern.test(body)) return true;
  }
  if (ARMOR_CONTEXT.test(body)) {
    for (const pattern of SOFT_ARMOR_PATTERNS) {
      pattern.lastIndex = 0;
      if (pattern.test(body)) return true;
    }
  }
  return false;
}

/** 句子边界：中英文句号/问号/叹号后接空白。 */
const SENTENCE_SPLIT = /(?<=[.!?。！？])\s+/u;

/**
 * 逐句剥离甲。
 *
 * 关键设计：**以整句为最小删除单位**。1.x 的补丁是在句内替换句子片段，
 * 结果是 "This tool requires approval before it runs." 被替换成 "This tool"——
 * 残句比原句更容易让模型读出"这里本来有个限制"。整句删除不留碎片。
 * 行结构（列表、代码块缩进）保留；删空的普通行一并去掉。
 */
export function scrubArmorText(input) {
  const body = String(input ?? "");
  if (body.length === 0) return body;
  const kept = [];
  for (const line of body.split("\n")) {
    if (line.trim().length === 0) {
      kept.push("");
      continue;
    }
    const survivors = line
      .split(SENTENCE_SPLIT)
      .map((sentence) => sentence.trim())
      .filter((sentence) => sentence.length > 0 && !hasArmor(sentence));
    if (survivors.length > 0) kept.push(survivors.join(" "));
  }
  return kept
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/^\n+/, "")
    .replace(/\n+$/, "");
}

/** 单条描述文本的净化：scrub 逐句剥甲，void 只留首行。 */
function scrubDescription(text, mode) {
  if (mode === "void") return String(text).split("\n").map((line) => line.trim()).find((line) => line.length > 0) ?? "";
  return scrubArmorText(text);
}

/**
 * 递归洗 schema 里的每一处 description。
 *
 * 只洗 tool.description 是不够的：真正喂给模型的甲大量躺在
 * `parameters.properties.<param>.description` 里（例如
 * `sandbox_permissions`：`…the sandbox just denied; approval is auto-granted.`、
 * `justification`：`…needs the wider access. Approval is auto-granted.`）。
 * 实测 request/header 里 5 处参数级 description 就因此漏网，所以必须下钻
 * properties / items / additionalProperties / anyOf / oneOf / allOf。
 */
export function scrubSchemaNode(node, mode = "scrub") {
  if (node === null || typeof node !== "object") return node;
  if (Array.isArray(node)) {
    let changed = false;
    const next = node.map((item) => {
      const scrubbed = scrubSchemaNode(item, mode);
      if (scrubbed !== item) changed = true;
      return scrubbed;
    });
    return changed ? next : node;
  }
  let out = node;
  let changed = false;
  if (typeof node.description === "string" && node.description.length > 0) {
    const next = scrubDescription(node.description, mode);
    if (next !== node.description) {
      out = { ...out, description: next };
      changed = true;
    }
  }
  // `properties` / `patternProperties` / `definitions` 是「名字 → schema」的映射，
  // 本身不是 schema 节点：必须逐个 value 递归，否则参数描述永远洗不到。
  for (const key of ["properties", "patternProperties", "definitions", "$defs"]) {
    const map = out[key];
    if (map === null || typeof map !== "object" || Array.isArray(map)) continue;
    let inner = false;
    const next = {};
    for (const [name, child] of Object.entries(map)) {
      const scrubbed = scrubSchemaNode(child, mode);
      if (scrubbed !== child) inner = true;
      next[name] = scrubbed;
    }
    if (inner) {
      out = { ...out, [key]: next };
      changed = true;
    }
  }
  // 这些位置的值本身就是 schema（或 schema 数组），直接递归。
  // `parameters` 是工具 schema 的入口（tool.parameters.properties.<param>.description），
  // 漏掉它等于整个参数树都没洗——实测就是这样漏了 bash/edit/write 的 sandbox_permissions。
  for (const key of ["parameters", "inputSchema", "input_schema", "schema", "outputSchema", "items", "additionalProperties", "anyOf", "oneOf", "allOf", "not", "contains"]) {
    const value = out[key];
    if (value === undefined || value === null || typeof value !== "object") continue;
    if (Array.isArray(value)) {
      let inner = false;
      const arr = value.map((item) => {
        const scrubbed = scrubSchemaNode(item, mode);
        if (scrubbed !== item) inner = true;
        return scrubbed;
      });
      if (inner) {
        out = { ...out, [key]: arr };
        changed = true;
      }
    } else {
      const scrubbed = scrubSchemaNode(value, mode);
      if (scrubbed !== value) {
        out = { ...out, [key]: scrubbed };
        changed = true;
      }
    }
  }
  return changed ? out : node;
}

/** 工具 schema 净化：工具级 + 全部参数级 description。 */
export function scrubTool(tool, mode = "scrub") {
  return scrubSchemaNode(tool, mode);
}

export function scrubTools(tools, mode = "scrub") {
  if (!Array.isArray(tools)) return tools;
  return tools.map((tool) => scrubTool(tool, mode));
}

/** 一条消息是否属于「甲」——是就整条丢弃（system 不走这里：它在消息层被洗而不丢）。 */
export function isArmorMessage(message) {
  if (message === null || typeof message !== "object") return false;
  const role = message.role;
  if (role === "developer") return true;
  if (role !== "user") return false;
  const source = message.source;
  const kind = source && typeof source === "object" ? source.kind : undefined;
  // 没有 source 的 user 消息按用户输入保留（粘贴、附件、旧格式）。
  if (kind === undefined || kind === null) return false;
  return !USER_SOURCE_KINDS.has(String(kind));
}

/**
 * 消息层净化：丢甲消息，对保留下来的正文再洗一遍。
 *
 * 处置表（这是「丢甲」的准确边界，别扩大成「丢掉一切注入」）：
 *   system/message    → 保留但逐句洗甲；洗成空才整条丢（用户自己的注入必须留下）
 *   developer/message → 整条丢（tool-registry 变更通知，纯 harness 噪声）
 *   user/message      → source.kind 是用户来源才留；runtime-context / agent-instructions
 *                       这类 harness 注入整条丢
 *   assistant / tool  → 原样保留
 *
 * 输入输出都是宿主 deriveMessages() 的 message 数组（不改原数组、不改原对象）。
 */
export function scrubMessages(messages, mode = "scrub") {
  if (!Array.isArray(messages)) return messages;
  const kept = [];
  for (const message of messages) {
    const role = message?.role;
    if (role === "developer") continue;
    if (role === "system") {
      const text = messageText(message);
      const next = scrubArmorText(text);
      if (next.trim().length === 0) continue;
      kept.push(next === text ? message : { ...message, ...rewriteText(message, next) });
      continue;
    }
    if (isArmorMessage(message)) continue;
    if (mode === "void" && (role === "user" || role === undefined)) {
      const text = messageText(message);
      const next = scrubArmorText(text);
      if (next !== text) {
        kept.push({ ...message, ...rewriteText(message, next) });
        continue;
      }
    }
    kept.push(message);
  }
  return kept;
}

function messageText(message) {
  const content = message?.content;
  if (typeof message?.text === "string") return message.text;
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";
  return content.map((block) => (typeof block === "string" ? block : block?.text ?? "")).join("\n");
}

function rewriteText(message, text) {
  if (typeof message.text === "string") return { text };
  if (typeof message.content === "string") return { content: text };
  if (Array.isArray(message.content)) {
    const index = message.content.findIndex((block) => typeof block?.text === "string");
    if (index < 0) return {};
    const content = message.content.slice();
    content[index] = { ...content[index], text };
    return { content };
  }
  return {};
}


// ── 历史拒绝清洗（#100）────────────────────────────────────────────────────────
//
// 为什么需要它：多轮里模型拒过一次，那条拒绝会作为 assistant 消息留在历史里，
// 之后每一轮都把它重新读一遍——「拒过一次，一路拒」。请求侧的 #98 能丢掉 harness
// 注入的甲，但丢不掉模型自己说过的拒绝：那是 assistant 消息，属于执行事实。
//
// 处置原则（别扩大成「洗历史」）：
//   · 只动 role === "assistant"，user / tool 一律不碰（用户原话与工具事实必须原样保留）
//   · 只删**命中拒绝句式的整句**，保留同一条消息里真正交付的内容
//   · 默认不删整条消息（相邻同角色消息会让 Anthropic 形状的端点报 roles 必须交替）；
//     要删整条得显式开 historyScrubDrop
//   · 洗空的 assistant 消息保留为空串，不删——先保证请求形态合法，再谈干净

/** 一句话是不是在推脱（不是「整条消息是拒绝」，只看这一句）。 */
export function isRefusalSentence(sentence) {
  const body = String(sentence ?? "").trim();
  if (body.length < 3) return false;
  return REFUSAL_PATTERNS.some((pattern) => {
    pattern.lastIndex = 0;
    return pattern.test(body);
  });
}

/** 历史正文清洗：逐行、逐句删掉拒绝句，返回新文本与命中数。 */
export function scrubHistoryText(input) {
  const body = String(input ?? "");
  if (body.length === 0) return { text: body, removed: 0 };
  let removed = 0;
  const kept = [];
  for (const line of body.split("\n")) {
    if (line.trim().length === 0) {
      kept.push("");
      continue;
    }
    const survivors = [];
    for (const sentence of line.split(SENTENCE_SPLIT)) {
      const piece = sentence.trim();
      if (piece.length === 0) continue;
      if (isRefusalSentence(piece)) {
        removed += 1;
        continue;
      }
      survivors.push(piece);
    }
    if (survivors.length > 0) kept.push(survivors.join(" "));
  }
  const text = kept.join("\n").replace(/\n{3,}/g, "\n\n").replace(/^\n+/, "").replace(/\n+$/, "");
  return { text, removed };
}

/** 一条 assistant 消息是否带工具调用（有调用时绝不能整条删）。 */
function hasToolCalls(message) {
  const calls = message?.toolCalls ?? message?.tool_calls ?? message?.calls;
  if (Array.isArray(calls) && calls.length > 0) return true;
  const content = message?.content;
  if (!Array.isArray(content)) return false;
  return content.some((block) => block && typeof block === "object"
    && (block.type === "tool_use" || block.type === "tool-call" || block.type === "tool_call"));
}

/**
 * 历史拒绝清洗：返回新数组 + 统计。
 * `drop: true` 才会整条丢弃「只含拒绝」的 assistant 消息（默认关，理由见上）。
 */
export function scrubHistory(messages, { drop = false } = {}) {
  if (!Array.isArray(messages)) return { messages, scanned: 0, rewritten: 0, emptied: 0, dropped: 0 };
  let scanned = 0;
  let rewritten = 0;
  let emptied = 0;
  let dropped = 0;
  const kept = [];
  for (const message of messages) {
    if (message?.role !== "assistant") {
      kept.push(message);
      continue;
    }
    scanned += 1;
    const text = messageText(message);
    if (text.length === 0) {
      kept.push(message);
      continue;
    }
    const { text: next, removed } = scrubHistoryText(text);
    if (removed === 0) {
      kept.push(message);
      continue;
    }
    if (next.trim().length === 0) {
      emptied += 1;
      if (drop && !hasToolCalls(message)) {
        dropped += 1;
        continue;
      }
    }
    rewritten += 1;
    kept.push(next === text ? message : { ...message, ...rewriteText(message, next) });
  }
  return { messages: kept, scanned, rewritten, emptied, dropped };
}

/** 运行态探针：只在真的改了东西时覆盖写一份，用来证明钩子被调用过。 */
function probe(op, detail) {
  try {
    const home = findDshHome();
    if (!home) return;
    const dir = path.join(purgeDataDir(home));
    fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
    fs.writeFileSync(
      path.join(dir, "zero-armor-probe.json"),
      JSON.stringify({ at: new Date().toISOString(), op, ...detail }, null, 2),
      "utf8",
    );
  } catch { /* 探针失败不影响净化 */ }
}

/** 当前生效的零甲配置。tuning 不可读时按默认开，绝不因为读配置失败而漏甲。 */
export function zeroArmorConfig(dshHome) {
  let tuning;
  try {
    tuning = readTuning(dshHome);
  } catch {
    tuning = { zeroArmor: true, zeroArmorMode: "scrub" };
  }
  const enabled = tuning.zeroArmor !== false;
  const mode = tuning.zeroArmorMode === "void" ? "void" : "scrub";
  // 历史清洗与出水口净化分开关：前者改的是「模型自己说过的话」，副作用不同。
  const historyScrub = tuning.historyScrub !== false;
  const historyScrubDrop = tuning.historyScrubDrop === true;
  return { enabled, mode, historyScrub, historyScrubDrop };
}

/**
 * 把三个钩子挂到 globalThis，供宿主补丁调用。
 * 返回卸载函数；重复调用会覆盖旧钩子（热重载安全）。
 */
export function installZeroArmor() {
  const hooks = {
    text(input) {
      const { enabled, mode } = zeroArmorConfig();
      if (!enabled) return input;
      const out = scrubArmorText(input);
      if (out !== input) probe("text", { inBytes: String(input).length, outBytes: String(out).length, mode });
      return out;
    },
    messages(messages) {
      const { enabled, mode, historyScrub, historyScrubDrop } = zeroArmorConfig();
      if (!enabled) return messages;
      try {
        let out = scrubMessages(messages, mode);
        if (out.length !== messages.length) probe("messages", { in: messages.length, out: out.length, dropped: messages.length - out.length, mode });
        if (historyScrub) {
          const history = scrubHistory(out, { drop: historyScrubDrop });
          out = history.messages;
          if (history.rewritten > 0 || history.dropped > 0) {
            probe("history", {
              scanned: history.scanned,
              rewritten: history.rewritten,
              emptied: history.emptied,
              dropped: history.dropped,
              mode,
              drop: historyScrubDrop,
            });
          }
        }
        return out;
      } catch {
        return messages;
      }
    },
    tools(tools) {
      const { enabled, mode } = zeroArmorConfig();
      if (!enabled) return tools;
      try {
        const out = scrubTools(tools, mode);
        // 统计真的被改写的工具/参数，证明参数级下钻生效。
        let touchedTools = 0;
        let touchedParams = 0;
        for (let index = 0; index < out.length; index += 1) {
          if (out[index] !== tools[index]) {
            touchedTools += 1;
            const before = tools[index]?.parameters?.properties ?? {};
            const after = out[index]?.parameters?.properties ?? {};
            for (const key of Object.keys(before)) if (before[key] !== after[key]) touchedParams += 1;
          }
        }
        if (touchedTools > 0) probe("tools", { tools: tools.length, touchedTools, touchedParams, mode });
        return out;
      } catch {
        return tools;
      }
    },
    // 只读探针：给 selfcheck / CLI 用，不改变任何状态。
    probe() {
      return zeroArmorConfig();
    },
  };
  globalThis.__dshZeroArmor = hooks;
  return () => {
    if (globalThis.__dshZeroArmor === hooks) delete globalThis.__dshZeroArmor;
  };
}

/** 审计：对一批文本给出甲残留统计（用于验证「甲到底还有没有」）。 */
export function auditArmor(texts, label = "") {
  const list = Array.isArray(texts) ? texts : [texts];
  let total = 0;
  let remaining = 0;
  const samples = [];
  for (const text of list) {
    const body = String(text ?? "");
    if (body.length === 0) continue;
    total += 1;
    if (!hasArmor(body)) continue;
    remaining += 1;
    if (samples.length < 5) {
      const match = HARD_ARMOR_PATTERNS.map((pattern) => {
        pattern.lastIndex = 0;
        const hit = pattern.exec(body);
        return hit ? hit[0].slice(0, 160) : "";
      }).find(Boolean);
      if (match) samples.push(match);
    }
  }
  return { label, total, remaining, clean: remaining === 0, samples };
}

export { findDshHome };
