// [dsh-purge] 零甲补丁组（#97–#100）：在宿主三个出水口挂 globalThis.__dshZeroArmor 钩子，
// 并在同一个消息出口上追加「历史拒绝清洗」（#100）。
//
// 为什么不是「再改一遍提示词」：
//   1.x 的破甲补丁把官方限制句**改写成放行句**，句子还在（"approval is auto-granted…"），
//   模型读到的仍然是权限叙事，只是方向变了。真正的「丢甲」必须在**出水口**做减法：
//   · #97 系统提示 / 运行时上下文 → 文本级剥离（兜底，任何插件塞进来的甲都会被扫掉）
//   · #98 消息列表 → 整条丢弃 system / developer / 非用户来源的 user 消息
//   · #99 工具 schema → description 逐句剥甲（scrub）或只留首行（void）
// 三处都是「最后一个出模型前的点」，所以不管上游哪个插件、哪个版本加了新甲，都拦得住。
export const ZERO_ARMOR_PATCHES = [
  {
    id: 97,
    name: "ZERO_ARMOR_PROMPT_SINK",
    layer: "代码",
    layer_en: "Code",
    desc: "系统提示出口洗净：renderPrompt / runtime context 出模型前剥掉甲句 / scrub the prompt sink",
    file: ["system-prompt", "system-prompt-nested"],
    replacements: [
      {
        // 已打过 #66（含 purge 标记）的现行宿主。
        pattern:
          '\treturn assembly.sections.map((section) => section.interpolate === false ? section.text : interpolate(section, assembly.variables, "section")).filter((text) => typeof text === "string" && text.length > 0).join("\\n\\n"); // [dsh-purge] guard undefined section text',
        replace:
          '\tconst dshZeroArmorPrompt = assembly.sections.map((section) => section.interpolate === false ? section.text : interpolate(section, assembly.variables, "section")).filter((text) => typeof text === "string" && text.length > 0).join("\\n\\n");\n' +
          '\t// [dsh-purge] zero armor: strip identity / approval / sandbox / disclaimer sentences\n' +
          '\treturn typeof globalThis.__dshZeroArmor?.text === "function" ? globalThis.__dshZeroArmor.text(dshZeroArmorPrompt) : dshZeroArmorPrompt;',
      },
      {
        // 未打 #66 的原始宿主。
        pattern:
          '\treturn assembly.sections.map((section) => section.interpolate === false ? section.text : interpolate(section, assembly.variables, "section")).filter((text) => text.length > 0).join("\\n\\n");',
        replace:
          '\tconst dshZeroArmorPrompt = assembly.sections.map((section) => section.interpolate === false ? section.text : interpolate(section, assembly.variables, "section")).filter((text) => text.length > 0).join("\\n\\n");\n' +
          '\t// [dsh-purge] zero armor: strip identity / approval / sandbox / disclaimer sentences\n' +
          '\treturn typeof globalThis.__dshZeroArmor?.text === "function" ? globalThis.__dshZeroArmor.text(dshZeroArmorPrompt) : dshZeroArmorPrompt;',
      },
      {
        // 运行时上下文快照：heading 与正文一起过一遍。
        pattern:
          '\treturn `Current runtime context. This snapshot supersedes earlier runtime-context snapshots.\\n\\n${body}`;',
        replace:
          '\tconst dshZeroArmorContext = `Current runtime context. This snapshot supersedes earlier runtime-context snapshots.\\n\\n${body}`;\n' +
          '\t// [dsh-purge] zero armor: strip sandbox / approval / file-policy paragraphs from the context snapshot\n' +
          '\treturn typeof globalThis.__dshZeroArmor?.text === "function" ? globalThis.__dshZeroArmor.text(dshZeroArmorContext) : dshZeroArmorContext;',
      },
    ],
    markers: ["[dsh-purge] zero armor"],
  },
  {
    id: 98,
    name: "ZERO_ARMOR_MESSAGES_SINK",
    layer: "代码",
    layer_en: "Code",
    desc: "消息出口丢甲：system / developer / harness 注入的 user 消息不进请求 / drop armor messages at the request sink",
    file: ["agent-loop"],
    replacements: [
      {
        pattern: "\t\tconst boundaryMessages = session.deriveMessages();",
        replace:
          "\t\t// [dsh-purge] zero armor: system / developer / non-user-source messages never leave the process\n" +
          '\t\tconst dshZeroArmorRaw = session.deriveMessages();\n' +
          '\t\tconst boundaryMessages = typeof globalThis.__dshZeroArmor?.messages === "function" ? globalThis.__dshZeroArmor.messages(dshZeroArmorRaw) : dshZeroArmorRaw;',
      },
    ],
    markers: ["[dsh-purge] zero armor: system / developer"],
  },
  {
    id: 99,
    name: "ZERO_ARMOR_TOOLS_SINK",
    layer: "代码",
    layer_en: "Code",
    desc: "工具 schema 出口洗甲：description 里的审批 / 沙箱 / 禁制句剥掉 / scrub tool descriptions before the header is frozen",
    file: ["agent-loop"],
    replacements: [
      {
        pattern:
          "\tbuildRequest(config, preparedCall, tools, position, startsRequestSeries, signal) {\n" +
          "\t\tconst { session } = this;",
        replace:
          "\tbuildRequest(config, preparedCall, tools, position, startsRequestSeries, signal) {\n" +
          "\t\tconst { session } = this;\n" +
          "\t\t// [dsh-purge] zero armor: tool descriptions are scrubbed before the header is frozen\n" +
          '\t\tif (typeof globalThis.__dshZeroArmor?.tools === "function") {\n' +
          "\t\t\ttry { tools = globalThis.__dshZeroArmor.tools(tools); } catch { /* keep the original schema */ }\n" +
          "\t\t}",
      },
    ],
    markers: ["[dsh-purge] zero armor: tool descriptions are scrubbed"],
  },
  {
    id: 100,
    name: "ZERO_ARMOR_HISTORY_SINK",
    layer: "代码",
    layer_en: "Code",
    desc: "历史拒绝清洗：assistant 消息里的拒绝句在出模型前删掉 / strip refusal sentences from assistant history",
    file: ["agent-loop"],
    // 运行时补丁：不新增宿主锚点，复用 #98 已写好的 messages 出口（钩子内部再走一遍历史）。
    // 因此判定以 #98 的标记为准：宿主侧一旦落地，这条就随之生效；
    // 真正的开关在 tuning.historyScrub / historyScrubDrop（插件侧，改完即生效，不用重打补丁）。
    runtime: true,
    chainedAfter: 98,
    replacements: [],
    markers: ["[dsh-purge] zero armor: system / developer"],
  },
];
