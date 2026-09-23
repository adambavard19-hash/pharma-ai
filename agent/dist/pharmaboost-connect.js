#!/usr/bin/env node
"use strict";

// agent/src/index.ts
var import_node_crypto = require("node:crypto");

// agent/src/douchette.ts
var import_node_child_process = require("node:child_process");
var import_node_fs = require("node:fs");
var import_node_path = require("node:path");

// agent/src/scan-detect.ts
var DEFAULTS = { maxGapMs: 120, minLength: 7, maxLength: 20, settleMs: 250 };
var ScanDetector = class {
  constructor(onScan, options = {}) {
    this.onScan = onScan;
    this.options = { ...DEFAULTS, ...options };
  }
  onScan;
  buffer = "";
  lastAt = 0;
  /** Dernière touche qui n'était pas un chiffre : une rafale qui la suit de trop près est une frappe humaine. */
  lastOtherAt = -Infinity;
  tainted = false;
  options;
  /** Une touche arrive. `key` vaut un caractère (« 3 »), « Enter », « Tab » ou autre chose. */
  feed(event) {
    const { maxGapMs, minLength } = this.options;
    if (this.buffer && event.at - this.lastAt > maxGapMs) {
      this.flushIfScan(this.lastAt);
      this.buffer = "";
    }
    if (event.key === "Enter" || event.key === "Tab") {
      this.flushIfScan(event.at);
      this.buffer = "";
      return;
    }
    if (/^\d$/.test(event.key)) {
      if (!this.buffer) this.tainted = event.at - this.lastOtherAt < maxGapMs * 3;
      this.buffer += event.key;
      this.lastAt = event.at;
      if (this.buffer.length > this.options.maxLength) this.buffer = "";
      return;
    }
    this.buffer = "";
    this.lastOtherAt = event.at;
    void minLength;
  }
  /** À appeler régulièrement : clôt une rafale restée sans Entrée. */
  tick(now) {
    if (this.buffer && now - this.lastAt > this.options.settleMs) {
      this.flushIfScan(this.lastAt);
      this.buffer = "";
    }
  }
  flushIfScan(at) {
    if (!this.tainted && this.buffer.length >= this.options.minLength && this.buffer.length <= this.options.maxLength) this.onScan(this.buffer, at);
    this.tainted = false;
  }
};
function normalizeScannedCode(raw) {
  const digits = raw.replace(/\D/g, "");
  if (digits.length === 13) return digits;
  if (digits.length === 7) return digits;
  if (digits.startsWith("01") && digits.length >= 16) {
    const gtin14 = digits.slice(2, 16);
    return gtin14.startsWith("0") ? gtin14.slice(1) : null;
  }
  return null;
}

// agent/src/douchette.ts
var HOOK_SCRIPT = String.raw`
$code = @"
using System;
using System.Diagnostics;
using System.Runtime.InteropServices;
using System.Windows.Forms;
public static class PharmaBoostHook {
  private const int WH_KEYBOARD_LL = 13;
  private const int WM_KEYDOWN = 0x0100;
  private const int WM_SYSKEYDOWN = 0x0104;
  private delegate IntPtr LowLevelKeyboardProc(int nCode, IntPtr wParam, IntPtr lParam);
  private static LowLevelKeyboardProc _proc = HookCallback;
  private static IntPtr _hookId = IntPtr.Zero;
  [DllImport("user32.dll", CharSet = CharSet.Auto, SetLastError = true)]
  private static extern IntPtr SetWindowsHookEx(int idHook, LowLevelKeyboardProc lpfn, IntPtr hMod, uint dwThreadId);
  [DllImport("user32.dll", CharSet = CharSet.Auto, SetLastError = true)]
  private static extern bool UnhookWindowsHookEx(IntPtr hhk);
  [DllImport("user32.dll", CharSet = CharSet.Auto, SetLastError = true)]
  private static extern IntPtr CallNextHookEx(IntPtr hhk, int nCode, IntPtr wParam, IntPtr lParam);
  [DllImport("kernel32.dll", CharSet = CharSet.Auto, SetLastError = true)]
  private static extern IntPtr GetModuleHandle(string lpModuleName);
  public static void Run() {
    using (Process curProcess = Process.GetCurrentProcess())
    using (ProcessModule curModule = curProcess.MainModule) {
      _hookId = SetWindowsHookEx(WH_KEYBOARD_LL, _proc, GetModuleHandle(curModule.ModuleName), 0);
    }
    if (_hookId == IntPtr.Zero) { Console.Out.WriteLine("ERROR hook"); Console.Out.Flush(); return; }
    Console.Out.WriteLine("READY");
    Console.Out.Flush();
    Application.Run();
  }
  private static IntPtr HookCallback(int nCode, IntPtr wParam, IntPtr lParam) {
    if (nCode >= 0 && (wParam == (IntPtr)WM_KEYDOWN || wParam == (IntPtr)WM_SYSKEYDOWN)) {
      int vk = Marshal.ReadInt32(lParam);
      long now = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds();
      string key;
      if (vk >= 0x30 && vk <= 0x39) key = ((char)('0' + (vk - 0x30))).ToString();
      else if (vk >= 0x60 && vk <= 0x69) key = ((char)('0' + (vk - 0x60))).ToString();
      else if (vk == 0x0D) key = "Enter";
      else if (vk == 0x09) key = "Tab";
      else if (vk == 0x10 || vk == 0xA0 || vk == 0xA1) key = "Shift";
      else key = "Other";
      Console.Out.WriteLine("KEY " + key + " " + now);
      Console.Out.Flush();
    }
    return CallNextHookEx(_hookId, nCode, wParam, lParam);
  }
}
"@
Add-Type -TypeDefinition $code -ReferencedAssemblies System.Windows.Forms
[PharmaBoostHook]::Run()
`;
function startDouchette(configDir, handlers) {
  if (process.platform !== "win32") {
    handlers.onStatus("L'\xE9coute de la douchette n'est disponible que sous Windows.");
    return () => void 0;
  }
  const scriptPath = (0, import_node_path.join)(configDir, "pharmaboost-douchette.ps1");
  (0, import_node_fs.mkdirSync)((0, import_node_path.dirname)(scriptPath), { recursive: true });
  (0, import_node_fs.writeFileSync)(scriptPath, HOOK_SCRIPT, "utf8");
  const detector = new ScanDetector((raw, at) => {
    const code = normalizeScannedCode(raw);
    if (code) handlers.onScan(code, at);
  });
  let child = null;
  let stopped = false;
  const tick = setInterval(() => detector.tick(Date.now()), 100);
  const launch = () => {
    if (stopped) return;
    child = (0, import_node_child_process.spawn)("powershell.exe", ["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-File", scriptPath], { stdio: ["ignore", "pipe", "pipe"], windowsHide: true });
    let pending = "";
    child.stdout?.on("data", (chunk) => {
      pending += chunk.toString("utf8");
      const lines = pending.split(/\r?\n/);
      pending = lines.pop() ?? "";
      for (const line of lines) {
        if (line === "READY") handlers.onStatus("Douchette \xE9cout\xE9e.");
        else if (line.startsWith("ERROR")) handlers.onStatus(`Le hook clavier a \xE9chou\xE9 : ${line}`);
        else if (line.startsWith("KEY ")) {
          const [, key, at] = line.split(" ");
          if (key === "Shift") continue;
          detector.feed({ key: key ?? "Other", at: Number(at) || Date.now() });
        }
      }
    });
    child.stderr?.on("data", (chunk) => handlers.onStatus(`Douchette (PowerShell) : ${chunk.toString("utf8").trim().slice(0, 300)}`));
    child.on("exit", (code) => {
      if (stopped) return;
      handlers.onStatus(`L'\xE9coute de la douchette s'est arr\xEAt\xE9e (code ${code ?? "?"}) ; relance dans 10 s.`);
      setTimeout(launch, 1e4);
    });
  };
  launch();
  return () => {
    stopped = true;
    clearInterval(tick);
    child?.kill();
  };
}

// agent/src/index.ts
var import_node_fs2 = require("node:fs");
var import_node_os = require("node:os");
var import_node_path2 = require("node:path");
var VERSION = "0.3.0";
var CONFIG_PATH = process.env.PHARMABOOST_CONNECT_CONFIG ?? (0, import_node_path2.join)(process.cwd(), "pharmaboost-connect.json");
var LOG_PATH = (0, import_node_path2.join)((0, import_node_path2.dirname)(CONFIG_PATH), "pharmaboost-connect.log");
var LOG_MAX_BYTES = 2 * 1024 * 1024;
var SETTLE_MS = 1e4;
var CHECK_MS = 3e4;
var DEFAULT_EXPORT = process.platform === "win32" ? "C:\\PharmaBoost\\Export" : (0, import_node_path2.join)(process.cwd(), "export");
var DEFAULT_SCANS = process.platform === "win32" ? "C:\\PharmaBoost\\Ordonnances" : null;
var notice = null;
function log(message) {
  const line = `${(/* @__PURE__ */ new Date()).toISOString()} ${message}`;
  console.log(line);
  try {
    (0, import_node_fs2.mkdirSync)((0, import_node_path2.dirname)(LOG_PATH), { recursive: true });
    if ((0, import_node_fs2.existsSync)(LOG_PATH) && (0, import_node_fs2.statSync)(LOG_PATH).size > LOG_MAX_BYTES) (0, import_node_fs2.renameSync)(LOG_PATH, `${LOG_PATH}.1`);
    (0, import_node_fs2.appendFileSync)(LOG_PATH, `${line}
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
  if (!(0, import_node_fs2.existsSync)(CONFIG_PATH)) return null;
  return JSON.parse((0, import_node_fs2.readFileSync)(CONFIG_PATH, "utf8"));
}
function writeConfig(config) {
  (0, import_node_fs2.mkdirSync)((0, import_node_path2.dirname)(CONFIG_PATH), { recursive: true });
  (0, import_node_fs2.writeFileSync)(CONFIG_PATH, JSON.stringify(config, null, 2));
}
async function api(config, path, init) {
  return fetch(`${config.serverUrl.replace(/\/$/, "")}${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${config.agentKey}`, "X-Agent-Version": VERSION, ...init.headers ?? {} }
  });
}
async function pairPost() {
  const code = arg("poste");
  const serverUrl = arg("serveur") ?? "https://pharmaboost.app";
  const response = await fetch(`${serverUrl.replace(/\/$/, "")}/api/agent/pair`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ code, role: "poste", hostname: (0, import_node_os.hostname)(), version: VERSION })
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok || !body.ok || !body.agentKey) throw new Error(body.error ?? `Appairage refus\xE9 (HTTP ${response.status}).`);
  writeConfig({ serverUrl, agentKey: body.agentKey, role: "poste", lgo: arg("lgo") ?? "lgpi", exportPath: null, scansPath: null, intervalSeconds: 300 });
  log(`Poste ${body.postLabel ?? (0, import_node_os.hostname)()} reli\xE9 \xE0 ${body.pharmacyName ?? "l'officine"}. Configuration \xE9crite dans ${CONFIG_PATH}.`);
}
var pendingScans = [];
async function sendScan(config, code, scannedAt) {
  const response = await api(config, "/api/agent/scans", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ code, post: (0, import_node_os.hostname)(), scannedAt })
  });
  const body = await response.json().catch(() => ({}));
  if (response.status === 401) throw new Error("cl\xE9 du poste r\xE9voqu\xE9e");
  if (response.status === 422) {
    log(`Bip ignor\xE9 (${code}) : ${body.error ?? "code inconnu"}`);
    return;
  }
  if (!response.ok || !body.ok) throw new Error(body.error ?? `HTTP ${response.status}`);
  log(`Bip ${code} \u2192 ${body.drugName ?? "?"} (${body.reference ?? "?"}, ${body.lineCount ?? "?"} ligne(s)).`);
}
async function flushScans(config) {
  while (pendingScans.length > 0) {
    const next = pendingScans[0];
    await sendScan(config, next.code, next.scannedAt);
    pendingScans.shift();
  }
}
async function runPost(config) {
  log(`PharmaBoost Connect ${VERSION} \u2014 poste de caisse ${(0, import_node_os.hostname)()} \u2014 journal : ${LOG_PATH}`);
  startDouchette((0, import_node_path2.dirname)(CONFIG_PATH), {
    onScan: (code, at) => {
      pendingScans.push({ code, scannedAt: new Date(at).toISOString() });
      flushScans(config).catch((error) => log(`Bip en attente : ${error instanceof Error ? error.message : String(error)}`));
    },
    onStatus: (message) => log(message)
  });
  let lastHeartbeat = 0;
  for (; ; ) {
    try {
      if (pendingScans.length > 0) await flushScans(config);
      if (Date.now() - lastHeartbeat > 6e4) {
        await heartbeat(config);
        lastHeartbeat = Date.now();
      }
    } catch (error) {
      log(`Erreur : ${error instanceof Error ? error.message : String(error)}`);
    }
    await new Promise((resolve) => setTimeout(resolve, 3e3));
  }
}
function testDouchette() {
  console.log("Passez une bo\xEEte \xE0 la douchette. Chaque code lu s'affiche ci-dessous. Ctrl+C pour arr\xEAter.");
  startDouchette((0, import_node_path2.dirname)(CONFIG_PATH), {
    onScan: (code) => console.log(`${(/* @__PURE__ */ new Date()).toLocaleTimeString("fr-FR")}  BIP  ${code}`),
    onStatus: (message) => console.log(`  ${message}`)
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
        (0, import_node_fs2.mkdirSync)(dir, { recursive: true });
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
  if (!(0, import_node_fs2.existsSync)(dir)) return null;
  const st = (0, import_node_fs2.statSync)(dir);
  if (st.isFile()) return { path: dir, mtime: st.mtimeMs, size: st.size };
  const files = (0, import_node_fs2.readdirSync)(dir).filter((name) => /\.(csv|txt|xlsx|xls|pdf)$/i.test(name) && !name.startsWith("~$")).map((name) => {
    const s = (0, import_node_fs2.statSync)((0, import_node_path2.join)(dir, name));
    return { path: (0, import_node_path2.join)(dir, name), mtime: s.mtimeMs, size: s.size };
  }).sort((a, b) => b.mtime - a.mtime);
  return files[0] ?? null;
}
var lastStamp = null;
async function syncStock(config, force) {
  if (!config.exportPath) return config;
  if (!(0, import_node_fs2.existsSync)(config.exportPath)) {
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
  const bytes = (0, import_node_fs2.readFileSync)(file.path);
  const hash = (0, import_node_crypto.createHash)("sha256").update(bytes).digest("hex");
  if (hash === config.lastExportHash) {
    if (notice?.startsWith("Aucun export") || notice?.startsWith("Le dossier")) setNotice(null);
    return config;
  }
  const form = new FormData();
  form.set("file", new Blob([bytes]), (0, import_node_path2.basename)(file.path));
  const response = await api(config, "/api/agent/stock", { method: "POST", body: form });
  const body = await response.json().catch(() => ({}));
  if (!response.ok || !body.ok) {
    setNotice(`Export refus\xE9 (${(0, import_node_path2.basename)(file.path)}) : ${body.error ?? `HTTP ${response.status}`}`);
    return config;
  }
  setNotice(null);
  log(`Stock synchronis\xE9 : ${body.lines ?? "?"} ligne(s), ${body.created ?? 0} cr\xE9\xE9e(s), ${body.updated ?? 0} mise(s) \xE0 jour (${(0, import_node_path2.basename)(file.path)}).`);
  return { ...config, lastExportHash: hash };
}
async function syncScans(config) {
  if (!config.scansPath || !(0, import_node_fs2.existsSync)(config.scansPath)) return config;
  const sent = new Set(config.sentScans ?? []);
  const files = (0, import_node_fs2.readdirSync)(config.scansPath).filter((name) => /\.(pdf|jpe?g|png|webp)$/i.test(name)).map((name) => ({ path: (0, import_node_path2.join)(config.scansPath, name), stat: (0, import_node_fs2.statSync)((0, import_node_path2.join)(config.scansPath, name)) })).filter(({ stat }) => Date.now() - stat.mtimeMs > SETTLE_MS).sort((a, b) => a.stat.mtimeMs - b.stat.mtimeMs);
  let next = config;
  for (const { path, stat } of files) {
    const key = `${(0, import_node_path2.basename)(path)}:${stat.size}`;
    if (sent.has(key)) continue;
    const mime = { ".pdf": "application/pdf", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".png": "image/png", ".webp": "image/webp" }[(0, import_node_path2.extname)(path).toLowerCase()] ?? "application/octet-stream";
    const form = new FormData();
    form.set("file", new Blob([(0, import_node_fs2.readFileSync)(path)], { type: mime }), (0, import_node_path2.basename)(path));
    const response = await api(config, "/api/agent/prescriptions", { method: "POST", body: form });
    const body = await response.json().catch(() => ({}));
    if (!response.ok || !body.ok) {
      log(`Scan refus\xE9 (${(0, import_node_path2.basename)(path)}) : ${body.error ?? `HTTP ${response.status}`}`);
      continue;
    }
    sent.add(key);
    next = { ...next, sentScans: [...sent].slice(-2e3) };
    writeConfig(next);
    log(`Ordonnance envoy\xE9e : ${(0, import_node_path2.basename)(path)} \u2192 ${body.reference ?? "?"} (${body.lines ?? 0} ligne(s) lue(s)).`);
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
  if (!config) throw new Error(`Aucune configuration (${CONFIG_PATH}). Lancez d'abord : --appairer CODE --serveur URL --lgo LGO --export DOSSIER (serveur) ou --poste CODE --serveur URL (poste de caisse)`);
  if (config.role === "poste") return runPost(config);
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
} else if (arg("poste")) {
  pairPost().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
} else if (process.argv.includes("--test-douchette")) {
  testDouchette();
} else if (process.argv.includes("--version")) {
  console.log(VERSION);
} else {
  run().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
