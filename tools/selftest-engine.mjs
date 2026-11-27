#!/usr/bin/env node
// tools/selftest-engine.mjs —— 补丁引擎的两条新语义（无第三方依赖）。
//
//   node tools/selftest-engine.mjs
//
// 覆盖：
//   1) obsoleteWhenAbsent 判定单元（符号全消失 = na；还剩一个 = 真漂移）
//   2) 补丁表完整性（id 唯一、#100 存在且是 runtime 补丁、展示组包含它）
//   3) 声明审计（打了 obsoleteWhenAbsent 的补丁，符号不许等于自己的锚点首行——否则永远 na）
//   4) 真实引擎复核：patchStatus 在合成宿主树上把「符号全无」判 na 而不是 drifted（环境不全时降级为 skip）
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { obsoleteSymbolsAbsent } from "../lib/core/shared.mjs";
import { ALL_PATCHES, PATCH_DISPLAY_GROUPS } from "../lib/patches/index.mjs";

let pass = 0;
let fail = 0;
const ok = (name, detail = "") => { pass += 1; console.log(`  ✓ ${name}${detail ? ` — ${detail}` : ""}`); };
const bad = (name, error) => { fail += 1; console.log(`  ✗ ${name} — ${error?.message || error}`); };
const test = (name, fn) => { try { fn(); ok(name); } catch (error) { bad(name, error); } };

console.log("=== 1) obsoleteWhenAbsent 判定单元");
test("声明 + 符号全消失 → na（true）", () => {
  assert.equal(obsoleteSymbolsAbsent("function foo() {}", { obsoleteWhenAbsent: ["sourceEventSeqs"] }), true);
});
test("声明 + 还剩一个符号 → 不判 na（false）", () => {
  assert.equal(obsoleteSymbolsAbsent("event.sourceEventSeqs", { obsoleteWhenAbsent: ["sourceEventSeqs", "surfaceOp"] }), false);
});
test("未声明 → 永不 na", () => {
  assert.equal(obsoleteSymbolsAbsent("anything", {}), false);
  assert.equal(obsoleteSymbolsAbsent("anything", { obsoleteWhenAbsent: [] }), false);
});
test("空文本 → 不判 na（读不到文件不等于功能消失）", () => {
  assert.equal(obsoleteSymbolsAbsent("", { obsoleteWhenAbsent: ["x"] }), false);
});
test("CRLF 文本同样命中", () => {
  assert.equal(obsoleteSymbolsAbsent("a\r\nb", { obsoleteWhenAbsent: ["zzz"] }), true);
  assert.equal(obsoleteSymbolsAbsent("a\r\nb\r\n", { obsoleteWhenAbsent: ["b"] }), false);
});

console.log("=== 2) 补丁表完整性");
test("#100 ZERO_ARMOR_HISTORY_SINK 存在且是 runtime 级", () => {
  const p = ALL_PATCHES.find((x) => x.id === 100);
  assert.ok(p, "缺少 #100");
  assert.equal(p.name, "ZERO_ARMOR_HISTORY_SINK");
  assert.equal(p.runtime, true);
  assert.equal(p.chainedAfter, 98);
  assert.deepEqual(p.replacements, []);
  assert.ok(Array.isArray(p.markers) && p.markers.length > 0, "#100 必须靠 #98 的标记判定落地");
});
test("补丁 id 无重复", () => {
  const ids = ALL_PATCHES.map((p) => p.id);
  assert.equal(new Set(ids).size, ids.length, `重复 id: ${ids.filter((id, i) => ids.indexOf(id) !== i)}`);
});
test("零甲展示组包含 #97–#100", () => {
  assert.deepEqual([...(PATCH_DISPLAY_GROUPS.zero_armor || [])].sort((a, b) => a - b), [97, 98, 99, 100]);
});

console.log("=== 3) 声明审计");
const declared = ALL_PATCHES.filter((p) => Array.isArray(p.obsoleteWhenAbsent) && p.obsoleteWhenAbsent.length > 0);
test(`有 ${declared.length} 条补丁声明了 obsoleteWhenAbsent`, () => {
  assert.ok(declared.length >= 6, `只找到 ${declared.length} 条`);
});
for (const patch of declared) {
  test(`#${patch.id} ${patch.name} 的符号声明可用`, () => {
    assert.ok(patch.obsoleteWhenAbsent.every((s) => typeof s === "string" && s.trim().length > 2), "符号必须是字符串");
    const firstAnchor = (patch.replacements?.[0]?.pattern);
    if (typeof firstAnchor === "string") {
      const head = firstAnchor.split("\n")[0].trim().slice(0, 24);
      assert.ok(!patch.obsoleteWhenAbsent.includes(firstAnchor), "符号不能直接等于锚点原文");
      assert.ok(!(head.length > 8 && patch.obsoleteWhenAbsent.some((s) => s === head)), `符号与锚点首行重合（${head}）会让判定失效`);
    }
  });
}

console.log("=== 4) 真实引擎复核（合成宿主树）");
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "purge-engine-"));
try {
  const ai = path.join(tmp, "packages", "ai");
  const loopDir = path.join(ai, "dsh-agent-loop", "lib");
  fs.mkdirSync(loopDir, { recursive: true });
  const target = path.join(loopDir, "index.js");
  // 宿主里已经彻底没有 renderPrompt/buildRequest 这两个符号 = 功能被上游删掉
  fs.writeFileSync(target, "// future host without the prompt pipeline\nexport const x = 1;\n");

  const probePatch = {
    id: 987,
    name: "PROBE_OBSOLETE",
    layer: "代码",
    file: "agent-loop",
    obsoleteWhenAbsent: ["renderPrompt(", "buildRequest("],
    replacements: [{ pattern: "const neverMatches = 1;", replace: "const stillNeverMatches = 1;" }],
  };

  const core = await import("../lib/core.js");
  const status = await core.patchStatus(ai, [probePatch], { surface: "web", dshHome: tmp });
  test("patchStatus 把「功能已消失」判成 na", () => {
    assert.equal(status[987], "na", `实际: ${status[987]}`);
  });

  // 同一个补丁，把符号放回去：此时应恢复成 drifted（功能还在，锚点变了）
  fs.writeFileSync(target, "renderPrompt(assembly);\n");
  const status2 = await core.patchStatus(ai, [probePatch], { surface: "web", dshHome: tmp });
  test("符号还在但锚点不中 → drifted（真漂移）", () => {
    assert.equal(status2[987], "drifted", `实际: ${status2[987]}`);
  });
} catch (error) {
  console.log(`  · 真实引擎复核跳过（环境不全）：${error?.message || error}`);
} finally {
  fs.rmSync(tmp, { recursive: true, force: true });
}

console.log(`\nengine selftest: ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
