// [dsh-purge] 模式与模型接入：CLI / harness 切换、自定义 key（OpenAI / Claude 协议）、模型列表。
//
// 设计取舍：
//   · 不改 client.js（702KB 打包产物，"Generated from src/ … Do not edit"），
//     改成服务端出一张单页 UI（/dsh-purge/surface.html），纯原生 JS，零构建。
//   · 配置落在 $DSH_HOME/dsh-purge/surface.json（0600），不碰 dsh 自己的 credentials.yaml。
//   · 自定义 provider 生成一个 profile patch 文件，daemon 与 dsh-cli.sh 启动时叠加：
//     harness 端和 CLI 端用的是同一份 provider 定义，行为一致。
import fs from "node:fs";
import path from "node:path";
import http from "node:http";
import https from "node:https";
import { findDshHome } from "./core.js";

const CONFIG_FILE = "surface.json";
const PATCH_NAME = "custom-provider.patch.yml";
const MASK = "••••••••";

export function surfacePaths(home = findDshHome()) {
  if (!home) throw new Error("未定位 DSH_HOME");
  const dir = path.join(home, "dsh-purge");
  return {
    home,
    dir,
    config: path.join(dir, CONFIG_FILE),
    patch: path.join(home, "profiles", "web", PATCH_NAME),
    patchCli: path.join(home, "profiles", "cli", PATCH_NAME),
  };
}

export const DEFAULT_CONFIG = Object.freeze({
  defaultSurface: "harness", // harness | cli
  custom: {
    enabled: false,
    protocol: "openai", // openai | anthropic
    baseURL: "",
    apiKey: "",
    model: "",
  },
  models: [], // 最近一次拉取到的模型 id 列表（缓存，便于离线打开页面）
  updatedAt: "",
});

export function readSurfaceConfig(home) {
  const { config } = surfacePaths(home);
  try {
    const raw = JSON.parse(fs.readFileSync(config, "utf8"));
    return {
      ...DEFAULT_CONFIG,
      ...raw,
      custom: { ...DEFAULT_CONFIG.custom, ...(raw.custom || {}) },
      models: Array.isArray(raw.models) ? raw.models : [],
    };
  } catch {
    return structuredClone(DEFAULT_CONFIG);
  }
}

export function writeSurfaceConfig(patch, home) {
  const paths = surfacePaths(home);
  fs.mkdirSync(paths.dir, { recursive: true, mode: 0o700 });
  const before = readSurfaceConfig(home);
  const next = {
    ...before,
    ...patch,
    custom: { ...before.custom, ...(patch.custom || {}) },
  };
  // apiKey 传空串表示"沿用原值"：页面不回填明文，避免密钥反复出现在响应里。
  if (typeof patch.custom?.apiKey === "string" && patch.custom.apiKey.length === 0) {
    next.custom.apiKey = before.custom.apiKey;
  }
  next.updatedAt = new Date().toISOString();
  const tmp = `${paths.config}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(next, null, 2), { mode: 0o600 });
  fs.renameSync(tmp, paths.config);
  return next;
}

/** 页面拿到的版本：apiKey 只回一个掩码 + 是否存在。 */
export function publicSurfaceConfig(config) {
  const { custom } = config;
  return {
    defaultSurface: config.defaultSurface,
    custom: {
      enabled: custom.enabled,
      protocol: custom.protocol,
      baseURL: custom.baseURL,
      model: custom.model,
      hasKey: typeof custom.apiKey === "string" && custom.apiKey.length > 0,
      apiKeyMask: custom.apiKey ? MASK : "",
    },
    models: config.models,
    updatedAt: config.updatedAt,
  };
}

function yamlScalar(value) {
  const text = String(value ?? "");
  // 只给"安全"标量留原样，其余一律单引号转义，避免生成非法 YAML。
  if (/^[A-Za-z0-9._:/-]+$/.test(text)) return text;
  return `'${text.replace(/'/g, "''")}'`;
}

/** 由配置生成 provider patch；未启用自定义 key 时返回 null（= 不叠加任何 patch）。 */
export function renderProviderPatch(config) {
  const { custom } = config;
  if (!custom.enabled || !custom.apiKey || !custom.baseURL || !custom.model) return null;
  const route = custom.protocol === "anthropic" ? "custom-anthropic" : "custom-openai";
  const api = custom.protocol === "anthropic" ? "anthropic-messages" : "openai-completions";
  const keyEnv = custom.protocol === "anthropic" ? "CUSTOM_ANTHROPIC_KEY" : "CUSTOM_OPENAI_KEY";
  return [
    "# 由 dsh-purge 设置页生成，勿手改（改动会在下次保存时被覆盖）。",
    "# daemon（harness 端）与 dsh-cli.sh（CLI 端）都会 --patch 这份文件。",
    "- id: llm-pi-ai",
    "  name: \"@deepseek-ai/dsh-llm-pi-ai\"",
    "  config:",
    "    providers:",
    `      ${route}:`,
    `        apiKeyEnv: ${keyEnv}`,
    `        displayName: ${yamlScalar(custom.protocol === "anthropic" ? "Claude (custom)" : "OpenAI-compatible (custom)")}`,
    `        api: ${api}`,
    `        baseURL: ${yamlScalar(custom.baseURL)}`,
    "        models:",
    `          - id: ${yamlScalar(custom.model)}`,
    `            name: ${yamlScalar(custom.model)}`,
    "- id: agent-default-model",
    "  name: \"@deepseek-ai/dsh-agent-default-model\"",
    "  config:",
    `    provider: ${route}`,
    `    model: ${yamlScalar(custom.model)}`,
    "",
  ].join("\n");
}

/** 写 patch（web 与 cli 两个 profile 各一份），返回写入的路径。 */
export function writeProviderPatch(config, home) {
  const paths = surfacePaths(home);
  const body = renderProviderPatch(config);
  const written = [];
  for (const target of [paths.patch, paths.patchCli]) {
    if (body === null) {
      try { fs.unlinkSync(target); } catch { /* 不存在就算了 */ }
      continue;
    }
    fs.mkdirSync(path.dirname(target), { recursive: true, mode: 0o700 });
    fs.writeFileSync(target, body, { mode: 0o600 });
    written.push(target);
  }
  return written;
}

/**
 * 直接用 node:http(s) 发请求，不走全局 fetch。
 *
 * 原因：这台设备跑 `--jitless`，Node 内置 fetch 是 undici，加载时要编译
 * WebAssembly 版 llhttp，直接抛 "WebAssembly is not defined"；dsh 自己靠
 * preload/fetch-https-shim.js 绕开，但那是进程级补丁，插件里不该依赖它。
 * node:https 不碰 wasm，任何加载顺序都能用。
 */
function requestJson(url, headers, timeoutMs) {
  return new Promise((resolve, reject) => {
    let parsed;
    try {
      parsed = new URL(url);
    } catch {
      reject(new Error(`URL 不合法：${url}`));
      return;
    }
    const lib = parsed.protocol === "https:" ? https : parsed.protocol === "http:" ? http : null;
    if (lib === null) {
      reject(new Error(`只支持 http/https：${parsed.protocol}`));
      return;
    }
    const request = lib.get(
      parsed,
      { headers: { accept: "application/json", "user-agent": "dsh-purge/surface", ...headers }, timeout: timeoutMs },
      (response) => {
        const chunks = [];
        response.on("data", (chunk) => chunks.push(chunk));
        response.on("end", () => {
          const text = Buffer.concat(chunks).toString("utf8");
          if (response.statusCode === 301 || response.statusCode === 302 || response.statusCode === 307 || response.statusCode === 308) {
            const location = response.headers.location;
            if (location) {
              requestJson(new URL(location, parsed).toString(), headers, timeoutMs).then(resolve, reject);
              return;
            }
          }
          resolve({ status: response.statusCode ?? 0, text });
        });
      },
    );
    request.on("timeout", () => {
      request.destroy(new Error(`请求超时（${timeoutMs}ms）`));
    });
    request.on("error", (error) => reject(new Error(`${error.code || ""} ${error.message}`.trim())));
  });
}

/** 拉模型列表：OpenAI 兼容 / Anthropic 两种鉴权头。 */
export async function fetchModels({ protocol, baseURL, apiKey }, timeoutMs = 20000) {
  const base = String(baseURL || "").replace(/\/+$/, "");
  if (!base) throw new Error("baseURL 为空");
  const url = `${base}/models`;
  const headers = protocol === "anthropic"
    ? { "x-api-key": apiKey, "anthropic-version": "2023-06-01" }
    : { authorization: `Bearer ${apiKey}` };
  const { status, text } = await requestJson(url, headers, timeoutMs);
  if (status < 200 || status >= 300) throw new Error(`HTTP ${status}: ${text.slice(0, 300)}`);
  let payload;
  try {
    payload = JSON.parse(text);
  } catch {
    throw new Error(`返回不是 JSON：${text.slice(0, 200)}`);
  }
  const list = Array.isArray(payload?.data) ? payload.data
    : Array.isArray(payload?.models) ? payload.models
      : Array.isArray(payload) ? payload : [];
  const models = list
    .map((entry) => (typeof entry === "string" ? entry : entry?.id ?? entry?.name))
    .filter((id) => typeof id === "string" && id.length > 0);
  return { url, models: [...new Set(models)].sort() };
}

const PAGE = String.raw`<!doctype html>
<html lang="zh-CN"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>dsh 启动模式</title>
<style>
:root{color-scheme:light dark;--bg:#fff;--fg:#111;--muted:#667085;--line:#e4e7ec;--card:#f9fafb;
--ds-blue:#4d6bfe;--ds-blue-hover:#3d5bf5;--ds-blue-soft:rgba(77,107,254,.12)}
@media(prefers-color-scheme:dark){:root{--bg:#141414;--fg:#ececec;--muted:#9aa0aa;--line:#2c2c2c;--card:#1b1b1b;
--ds-blue:#6b83ff;--ds-blue-hover:#7d92ff;--ds-blue-soft:rgba(107,131,255,.18)}}
*{box-sizing:border-box}
body{margin:0;padding:20px;font:15px/1.5 -apple-system,system-ui,"PingFang SC",sans-serif;background:var(--bg);color:var(--fg)}
h1{font-size:19px;margin:0 0 4px}
p.sub{color:var(--muted);margin:0 0 18px;font-size:13px}
section{border:1px solid var(--line);border-radius:12px;padding:16px;margin-bottom:16px;background:var(--card)}
h2{font-size:13px;margin:0 0 12px;letter-spacing:.04em;color:var(--muted);text-transform:uppercase}
label{display:block;font-size:13px;margin:10px 0 4px;color:var(--muted)}
select{width:100%;padding:10px;border:1px solid var(--line);border-radius:8px;background:var(--bg);color:var(--fg);font:inherit}
button{padding:10px 16px;border-radius:8px;border:1px solid var(--line);background:var(--bg);color:var(--fg);font:inherit;cursor:pointer;transition:background .15s,border-color .15s}
button:disabled{opacity:.5;cursor:default}
button.primary{background:var(--ds-blue);border-color:var(--ds-blue);color:#fff;font-weight:600}
button.primary:hover:not(:disabled){background:var(--ds-blue-hover);border-color:var(--ds-blue-hover)}
button.ghost{background:var(--ds-blue-soft);border-color:var(--ds-blue);color:var(--ds-blue);font-weight:600}
button.ghost:hover:not(:disabled){background:var(--ds-blue);color:#fff}
.row{display:flex;gap:10px;flex-wrap:wrap}
.msg{margin-top:12px;font-size:13px;white-space:pre-wrap}
.ok{color:var(--ds-blue)}.err{color:#d33}
.hint{font-size:12px;color:var(--muted);margin-top:8px}
</style></head><body>
<h1>dsh 启动模式</h1>
<p class="sub">开机默认拉起哪个端；模型与 API key 在 harness 自带设置里配置。</p>

<section>
  <h2>默认入口</h2>
  <label for="surface">开机后默认打开</label>
  <select id="surface">
    <option value="harness">harness（浏览器 / web 服务）</option>
    <option value="cli">cli（终端 / dsh-cli，自动在 tmux 开窗口）</option>
  </select>
  <p class="hint">两个端共用同一个 dsh-home（会话、skills、补丁），随时可以手动起另一个。</p>
</section>

<section>
  <h2>应用</h2>
  <div class="row">
    <button class="primary" id="save">保存</button>
    <button class="ghost" id="restart">重启 dsh</button>
  </div>
  <div class="msg" id="msg"></div>
  <p class="hint">「保存」只写配置，下次开机生效；「重启 dsh」会先保存再重启，让当前进程立刻按新模式拉起（页面会断开几秒）。</p>
</section>

<script>
const $=id=>document.getElementById(id);
function show(text,ok){$('msg').textContent=text;$('msg').className='msg '+(ok?'ok':'err')}
async function api(path,body){
  const res=await fetch(path,{method:body?'POST':'GET',headers:body?{'content-type':'application/json'}:{},body:body?JSON.stringify(body):undefined});
  const text=await res.text();let data=null;try{data=JSON.parse(text)}catch{data={raw:text}}
  if(!res.ok||data.ok===false)throw new Error((data&&(data.error||data.message))||('HTTP '+res.status));
  return data;
}
async function saveSelection(){
  await api('/dsh-purge/surface',{defaultSurface:$('surface').value});
  return $('surface').value;
}
async function load(){
  const data=await api('/dsh-purge/surface');
  $('surface').value=(data.config&&data.config.defaultSurface)||'harness';
  show('已加载',true);
}
$('save').onclick=async()=>{
  const btn=$('save');btn.disabled=true;show('保存中…',true);
  try{
    const value=await saveSelection();
    show('已保存：默认 ' + value + '（下次开机生效）',true);
  }catch(e){show('保存失败：'+e.message,false)}
  finally{btn.disabled=false}
};
$('restart').onclick=async()=>{
  const btn=$('restart');btn.disabled=true;
  try{
    const value=await saveSelection();
    show('已保存为 ' + value + '，正在重启 dsh…页面会在几秒内断开，稍后重新打开即可。',true);
    await api('/dsh-purge/surface/restart',{});
    show('重启已受理，等待新进程接管端口…',true);
  }catch(e){
    show('重启失败：'+e.message,false);
    btn.disabled=false;
  }
};
load().catch(e=>show('加载失败：'+e.message,false));
</script></body></html>`;

export function installSurfaceRoutes({ registerPluginRoute, sendJson, readJsonBody, home, restart, log } = {}) {
  const resolveHome = () => home || findDshHome();
  const route = (path, handler) => registerPluginRoute({ kind: "exact", path, handler });

  route("/dsh-purge/surface.html", (request, response) => {
    if (request.method !== "GET") {
      response.writeHead(405, { allow: "GET" });
      response.end();
      return;
    }
    response.writeHead(200, { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" });
    response.end(PAGE);
  });

  route("/dsh-purge/surface", async (request, response) => {
    if (request.method === "GET") {
      const config = readSurfaceConfig(resolveHome());
      sendJson(response, 200, { ok: true, config: publicSurfaceConfig(config) });
      return;
    }
    if (request.method !== "POST") {
      response.writeHead(405, { allow: "GET, POST" });
      response.end();
      return;
    }
    try {
      const body = await readJsonBody(request);
      const patch = {};
      if (body?.defaultSurface === "cli" || body?.defaultSurface === "harness") patch.defaultSurface = body.defaultSurface;
      if (body?.custom && typeof body.custom === "object") {
        const c = body.custom;
        patch.custom = {
          enabled: c.enabled === true,
          protocol: c.protocol === "anthropic" ? "anthropic" : "openai",
          baseURL: typeof c.baseURL === "string" ? c.baseURL : "",
          model: typeof c.model === "string" ? c.model : "",
          ...(typeof c.apiKey === "string" ? { apiKey: c.apiKey } : {}),
        };
      }
      if (Array.isArray(body?.models)) patch.models = body.models.filter((m) => typeof m === "string").slice(0, 500);
      const saved = writeSurfaceConfig(patch, resolveHome());
      const files = writeProviderPatch(saved, resolveHome());
      if (log) log("surface saved", { files });
      sendJson(response, 200, { ok: true, config: publicSurfaceConfig(saved), patchFiles: files });
    } catch (error) {
      sendJson(response, 400, { ok: false, error: String(error?.message || error) });
    }
  });

  // 重启：不在插件里自己 spawn 新进程（purge 的 restart-web 用的是精简参数，
  // 缺 --patch ios.patch.yml / preload，会和 launchd 的 daemon 抢端口形成重启循环）。
  // 这里只让当前进程退出，由 launchd 的 KeepAlive 用 dsh-daemon.sh 的正确参数拉起。
  route("/dsh-purge/surface/restart", async (request, response) => {
    if (request.method !== "POST") {
      response.writeHead(405, { allow: "POST" });
      response.end();
      return;
    }
    sendJson(response, 200, { ok: true, restarting: true, via: "launchd" });
    setTimeout(() => {
      try {
        if (typeof restart === "function") restart();
        else process.exit(0);
      } catch {
        process.exit(0);
      }
    }, 300);
  });

  route("/dsh-purge/models", async (request, response) => {
    if (request.method !== "POST") {
      response.writeHead(405, { allow: "POST" });
      response.end();
      return;
    }
    try {
      const body = await readJsonBody(request);
      const saved = readSurfaceConfig(resolveHome());
      // apiKey 留空时沿用已保存的（页面不回填明文）。
      const apiKey = typeof body?.apiKey === "string" && body.apiKey.length > 0 ? body.apiKey : saved.custom.apiKey;
      const protocol = body?.protocol === "anthropic" ? "anthropic" : "openai";
      const baseURL = typeof body?.baseURL === "string" && body.baseURL ? body.baseURL : saved.custom.baseURL;
      const result = await fetchModels({ protocol, baseURL, apiKey });
      const saved2 = writeSurfaceConfig({ models: result.models }, resolveHome());
      sendJson(response, 200, { ok: true, url: result.url, models: result.models, config: publicSurfaceConfig(saved2) });
    } catch (error) {
      sendJson(response, 200, { ok: false, error: String(error?.message || error) });
    }
  });
}

export { PAGE as SURFACE_PAGE };
