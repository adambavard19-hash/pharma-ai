#!/usr/bin/env node
"use strict";

// agent/src/index.ts
var import_node_crypto = require("node:crypto");
var import_node_fs = require("node:fs");
var import_node_os = require("node:os");
var import_node_path = require("node:path");
var VERSION = "0.2.0";
var CONFIG_PATH = process.env.PHARMABOOST_CONNECT_CONFIG ?? (0, import_node_path.join)(process.cwd(), "pharmaboost-connect.json");
var LOG_PATH = (0, import_node_path.join)((0, import_node_path.dirname)(CONFIG_PATH), "pharmaboost-connect.log");
var LOG_MAX_BYTES = 2 * 1024 * 1024;
var SETTLE_MS = 1e4;
var CHECK_MS = 3e4;
var DEFAULT_EXPORT = process.platform === "win32" ? "C:\\PharmaBoost\\Export" : (0, import_node_path.join)(process.cwd(), "export");
var DEFAULT_SCANS = process.platform === "win32" ? "C:\\PharmaBoost\\Ordonnances" : null;
var notice = null;
function log(message) {
  const line = `${(/* @__PURE__ */ new Date()).toISOString()} ${message}`;
  console.log(line);
  try {
    (0, import_node_fs.mkdirSync)((0, import_node_path.dirname)(LOG_PATH), { recursive: true });
    if ((0, import_node_fs.existsSync)(LOG_PATH) && (0, import_node_fs.statSync)(LOG_PATH).size > LOG_MAX_BYTES) (0, import_node_fs.renameSync)(LOG_PATH, `${LOG_PATH}.1`);
    (0, import_node_fs.appendFileSync)(LOG_PATH, `${line}
`);
  } catch {
  }
}
function setNotice(value) {
  if (value !== notice) log(value ? `\xC0 signaler : ${value}` : "Plus rien \xE0 signaler.");
  notice = value;
}
function arg(name) {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : void 0;
}
function readConfig() {
  if (!(0, import_node_fs.existsSync)(CONFIG_PATH)) return null;
  return JSON.parse((0, import_node_fs.readFileSync)(CONFIG_PATH, "utf8"));
}
function writeConfig(config) {
  (0, import_node_fs.mkdirSync)((0, import_node_path.dirname)(CONFIG_PATH), { recursive: true });
  (0, import_node_fs.writeFileSync)(CONFIG_PATH, JSON.stringify(config, null, 2));
}
async function api(config, path, init) {
  return fetch(`${config.serverUrl.replace(/\/$/, "")}${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${config.agentKey}`, "X-Agent-Version": VERSION, ...init.headers ?? {} }
  });
}
async function pair() {
  const code = arg("appairer");
  const serverUrl = arg("serveur") ?? "https://pharmaboost.app";
  const lgo = arg("lgo") ?? "autre";
  const exportPath = arg("export") ?? DEFAULT_EXPORT;
  const scansPath = arg("scans") ?? DEFAULT_SCANS;
  for (const dir of [exportPath, scansPath]) {
    if (dir) {
      try {
        (0, import_node_fs.mkdirSync)(dir, { recursive: true });
      } catch {
      }
    }
  }
  const response = await fetch(`${serverUrl.replace(/\/$/, "")}/api/agent/pair`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ code, lgo, hostname: (0, import_node_os.hostname)(), version: VERSION, exportPath, scansPath })
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok || !body.ok || !body.agentKey) throw new Error(body.error ?? `Appairage refus\xE9 (HTTP ${response.status}).`);
  writeConfig({ serverUrl, agentKey: body.agentKey, lgo, exportPath, scansPath, intervalSeconds: body.intervalSeconds ?? 300 });
  log(`Appair\xE9 avec ${body.pharmacyName ?? "l'officine"}. Configuration \xE9crite dans ${CONFIG_PATH}. Export surveill\xE9 : ${exportPath}${scansPath ? ` \u2014 scans : ${scansPath}` : ""}.`);
}
function latestExport(dir) {
  if (!(0, import_node_fs.existsSync)(dir)) return null;
  const st = (0, import_node_fs.statSync)(dir);
  if (st.isFile()) return { path: dir, mtime: st.mtimeMs, size: st.size };
  const files = (0, import_node_fs.readdirSync)(dir).filter((name) => /\.(csv|txt|xlsx|xls|pdf)$/i.test(name) && !name.startsWith("~$")).map((name) => {
    const s = (0, import_node_fs.statSync)((0, import_node_path.join)(dir, name));
    return { path: (0, import_node_path.join)(dir, name), mtime: s.mtimeMs, size: s.size };
  }).sort((a, b) => b.mtime - a.mtime);
  return files[0] ?? null;
}
var lastStamp = null;
async function syncStock(config, force) {
  if (!config.exportPath) return config;
  if (!(0, import_node_fs.existsSync)(config.exportPath)) {
    setNotice(`Le dossier d'export ${config.exportPath} n'existe pas sur ${(0, import_node_os.hostname)()}.`);
    return config;
  }
  const file = latestExport(config.exportPath);
  if (!file) {
    setNotice(`Aucun export dans ${config.exportPath}. Enregistrez-y l'\xE9dition de stock de votre logiciel.`);
    return config;
  }
  if (Date.now() - file.mtime < SETTLE_MS) return config;
  const stamp = `${file.path}:${file.mtime}:${file.size}`;
  if (!force && stamp === lastStamp) return config;
  lastStamp = stamp;
  const bytes = (0, import_node_fs.readFileSync)(file.path);
  const hash = (0, import_node_crypto.createHash)("sha256").update(bytes).digest("hex");
  if (hash === config.lastExportHash) {
    if (notice?.startsWith("Aucun export") || notice?.startsWith("Le dossier")) setNotice(null);
    return config;
  }
  const form = new FormData();
  form.set("file", new Blob([bytes]), (0, import_node_path.basename)(file.path));
  const response = await api(config, "/api/agent/stock", { method: "POST", body: form });
  const body = await response.json().catch(() => ({}));
  if (!response.ok || !body.ok) {
    setNotice(`Export refus\xE9 (${(0, import_node_path.basename)(file.path)}) : ${body.error ?? `HTTP ${response.status}`}`);
    return config;
  }
  setNotice(null);
  log(`Stock synchronis\xE9 : ${body.lines ?? "?"} ligne(s), ${body.created ?? 0} cr\xE9\xE9e(s), ${body.updated ?? 0} mise(s) \xE0 jour (${(0, import_node_path.basename)(file.path)}).`);
  return { ...config, lastExportHash: hash };
}
async function syncScans(config) {
  if (!config.scansPath || !(0, import_node_fs.existsSync)(config.scansPath)) return config;
  const sent = new Set(config.sentScans ?? []);
  const files = (0, import_node_fs.readdirSync)(config.scansPath).filter((name) => /\.(pdf|jpe?g|png|webp)$/i.test(name)).map((name) => ({ path: (0, import_node_path.join)(config.scansPath, name), stat: (0, import_node_fs.statSync)((0, import_node_path.join)(config.scansPath, name)) })).filter(({ stat }) => Date.now() - stat.mtimeMs > SETTLE_MS).sort((a, b) => a.stat.mtimeMs - b.stat.mtimeMs);
  let next = config;
  for (const { path, stat } of files) {
    const key = `${(0, import_node_path.basename)(path)}:${stat.size}`;
    if (sent.has(key)) continue;
    const mime = { ".pdf": "application/pdf", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".png": "image/png", ".webp": "image/webp" }[(0, import_node_path.extname)(path).toLowerCase()] ?? "application/octet-stream";
    const form = new FormData();
    form.set("file", new Blob([(0, import_node_fs.readFileSync)(path)], { type: mime }), (0, import_node_path.basename)(path));
    const response = await api(config, "/api/agent/prescriptions", { method: "POST", body: form });
    const body = await response.json().catch(() => ({}));
    if (!response.ok || !body.ok) {
      log(`Scan refus\xE9 (${(0, import_node_path.basename)(path)}) : ${body.error ?? `HTTP ${response.status}`}`);
      continue;
    }
    sent.add(key);
    next = { ...next, sentScans: [...sent].slice(-2e3) };
    writeConfig(next);
    log(`Ordonnance envoy\xE9e : ${(0, import_node_path.basename)(path)} \u2192 ${body.reference ?? "?"} (${body.lines ?? 0} ligne(s) lue(s)).`);
  }
  return next;
}
async function heartbeat(config) {
  const response = await api(config, "/api/agent/heartbeat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ version: VERSION, hostname: (0, import_node_os.hostname)(), exportPath: config.exportPath, scansPath: config.scansPath, notice })
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok || !body.ok) {
    log(`Signe de vie refus\xE9 (HTTP ${response.status}) : la cl\xE9 est-elle r\xE9voqu\xE9e ?`);
    return config;
  }
  const updated = {
    ...config,
    intervalSeconds: body.intervalSeconds ?? config.intervalSeconds,
    exportPath: body.exportPath ?? config.exportPath,
    scansPath: body.scansPath ?? config.scansPath
  };
  if (JSON.stringify(updated) !== JSON.stringify(config)) writeConfig(updated);
  return updated;
}
async function run() {
  let config = readConfig();
  if (!config) throw new Error(`Aucune configuration (${CONFIG_PATH}). Lancez d'abord : --appairer CODE --serveur URL --lgo LGO --export DOSSIER`);
  log(`PharmaBoost Connect ${VERSION} \u2014 ${config.lgo} \u2014 export : ${config.exportPath ?? "non configur\xE9"} \u2014 scans : ${config.scansPath ?? "non configur\xE9s"} \u2014 journal : ${LOG_PATH}`);
  let lastHeartbeat = 0;
  let lastCheck = 0;
  let lastFullCheck = 0;
  for (; ; ) {
    try {
      if (Date.now() - lastCheck > CHECK_MS) {
        const force = Date.now() - lastFullCheck > config.intervalSeconds * 1e3;
        const before = config.lastExportHash;
        config = await syncStock(config, force);
        if (config.lastExportHash !== before) writeConfig(config);
        lastCheck = Date.now();
        if (force) lastFullCheck = Date.now();
      }
      if (Date.now() - lastHeartbeat > 6e4) {
        config = await heartbeat(config);
        lastHeartbeat = Date.now();
      }
      config = await syncScans(config);
    } catch (error) {
      log(`Erreur : ${error instanceof Error ? error.message : String(error)}`);
    }
    await new Promise((resolve) => setTimeout(resolve, 5e3));
  }
}
if (arg("appairer")) {
  pair().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
} else if (process.argv.includes("--version")) {
  console.log(VERSION);
} else {
  run().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
